import { Injectable } from "@nestjs/common";
import {
  type CreditKind,
  PARAM_KEYS,
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
  refCode,
} from "@pharmachain/core";
import { type Prisma, prisma } from "@pharmachain/db";
import { genericEventEmail } from "@pharmachain/email";
import { notify } from "@pharmachain/notifications";
import { badRequest, conflict, forbidden, notFound } from "../../common/errors";
import { env } from "../../env";
import type { AuthUser, Membership } from "../../lib/context";
import { getParam } from "../../lib/params";
import { enabledPaymentMethods, gatewayFor } from "../../lib/payment-gateways";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Platform fees, paid inside the platform.
 *
 * QA finding: buying RFQ credits told you to pay "off-platform" and wait for
 * someone to notice. Money owed *to the platform* now goes through the same
 * gateway abstraction order payments use — card and mobile money settle on the
 * provider webhook, bank transfer and escrow produce a quotable reference and
 * instructions that the platform team confirms against.
 *
 * B2B money between two companies is deliberately untouched: that stays
 * off-platform, as the brief asks.
 */
@Injectable()
export class BillingService {
  /** Owner-scoped load; a company can only ever see its own fee requests. */
  private async loadOwn(membership: Membership, creditRequestId: string) {
    const request = await prisma.creditRequest.findUnique({ where: { id: creditRequestId } });
    if (!request || request.companyId !== membership.companyId) {
      throw notFound("Credit request not found");
    }
    return request;
  }

  /**
   * Start (or restart) checkout for a pending fee. Re-initiating while still
   * pending is allowed and mints a fresh reference — a buyer who picked bank
   * transfer and then reached for a card should not be stuck, and the old
   * reference stops being the one the webhook matches.
   */
  async initiatePayment(membership: Membership, creditRequestId: string, method: PaymentMethod) {
    const request = await this.loadOwn(membership, creditRequestId);
    if (request.status !== "PENDING_PAYMENT") {
      throw conflict("This request has already been settled");
    }
    // Same rule the method list is built from, enforced server-side: escrow
    // is a B2B instrument and never settles a fee owed to the platform.
    const settleable = enabledPaymentMethods().filter((m) => m.method !== "ESCROW");
    if (!settleable.some((m) => m.method === method)) {
      throw badRequest(
        `${PAYMENT_METHOD_LABELS[method]} cannot be used for platform fees — use bank transfer`,
      );
    }

    const gateway = gatewayFor(method);
    const bankDetails = await getParam(PARAM_KEYS.PLATFORM_BANK_DETAILS);
    const initiated = await gateway.initiate({
      reference: refCode("FEE"),
      amount: Number(request.fee),
      currency: request.currency,
      method,
      bankDetails,
    });

    const updated = await prisma.creditRequest.update({
      where: { id: request.id },
      data: {
        paymentMethod: method,
        paymentProvider: initiated.provider,
        paymentRef: initiated.providerRef,
        paymentInstructions: initiated.instructions,
        paymentInitiatedAt: new Date(),
      },
    });
    return { request: updated, instructions: initiated.instructions };
  }

  /**
   * Settle a fee request by provider reference — the provider webhook's entry
   * point. Returns null when the reference belongs to something else (an order
   * payment), so the caller can keep looking.
   *
   * A declined card does NOT reject the request: the buyer should be able to
   * try another method, so a failure records itself and leaves the request
   * pending. Only a confirmation, or an explicit admin rejection, is terminal.
   */
  async settleByReference(
    providerRef: string,
    outcome: "CONFIRMED" | "FAILED",
    webhookPayload?: Record<string, unknown>,
  ) {
    const request = await prisma.creditRequest.findUnique({ where: { paymentRef: providerRef } });
    if (!request) return null;
    if (outcome === "CONFIRMED") {
      return this.settle(request.id, "CONFIRMED", { webhookPayload });
    }
    if (request.status !== "PENDING_PAYMENT") {
      throw conflict("This credit request was already decided");
    }
    const failed = await prisma.creditRequest.update({
      where: { id: request.id },
      data: {
        note: "The payment provider declined this payment — try again or use another method.",
        ...(webhookPayload ? { webhookPayload: webhookPayload as Prisma.InputJsonValue } : {}),
      },
    });
    await notify({
      companyId: request.companyId,
      roles: ["COMPANY_ADMIN"],
      type: "CREDIT_UPDATE",
      title: "Payment declined",
      body: `Your ${request.currency} ${request.fee.toString()} payment was declined. The request is still open — try again from Usage & credits.`,
      href: "/company/usage",
    });
    return failed;
  }

  /**
   * The one settlement path. The status flip is conditional on
   * PENDING_PAYMENT, so a replayed webhook (or a race with an admin clicking
   * Confirm) is a 409 rather than a second set of granted credits.
   */
  async settle(
    creditRequestId: string,
    outcome: "CONFIRMED" | "REJECTED",
    extra: {
      confirmedById?: string;
      note?: string;
      webhookPayload?: Record<string, unknown>;
    } = {},
  ) {
    const confirm = outcome === "CONFIRMED";
    const flipped = await prisma.creditRequest.updateMany({
      where: { id: creditRequestId, status: "PENDING_PAYMENT" },
      data: {
        status: outcome,
        confirmedById: extra.confirmedById,
        decidedAt: new Date(),
        note: extra.note,
        ...(extra.webhookPayload
          ? { webhookPayload: extra.webhookPayload as Prisma.InputJsonValue }
          : {}),
      },
    });
    if (flipped.count === 0) throw conflict("This credit request was already decided");

    const request = await prisma.creditRequest.findUniqueOrThrow({
      where: { id: creditRequestId },
      include: { company: { select: { name: true } } },
    });

    // Phase 4 §3: confirmed purchases take effect immediately — featured
    // placement runs 30 days; premium verification upgrades the tier.
    if (confirm) await this.applyPurchase(request.companyId, request.kind);

    await notify({
      companyId: request.companyId,
      roles: ["COMPANY_ADMIN"],
      type: "CREDIT_UPDATE",
      title: confirm ? "Payment received — credits active" : "Credit request rejected",
      body: confirm
        ? `${request.count} ${request.kind} credit(s) are now active for this month.`
        : `Your ${request.kind} credit request was rejected. ${extra.note ?? ""}`,
      href: "/company/usage",
      emailContent: genericEventEmail({
        title: confirm ? "Payment received — credits active" : "Credit request rejected",
        body: confirm
          ? `Payment received — ${request.count} ${request.kind} credit(s) added to ${request.company.name}'s allowance this month.`
          : `The credit request was rejected. ${extra.note ?? ""}`,
        url: `${env.APP_URL}/company/usage`,
      }),
    });
    return request;
  }

  /** What a confirmed purchase actually unlocks, by kind. */
  private async applyPurchase(companyId: string, kind: CreditKind) {
    const until = new Date(Date.now() + THIRTY_DAYS_MS);
    if (kind === "FEATURED") {
      await prisma.company.update({
        where: { id: companyId },
        data: { subscriptionTier: "FEATURED", featuredUntil: until },
      });
    } else if (kind === "DATA_INSIGHTS") {
      await prisma.company.update({ where: { id: companyId }, data: { insightsUntil: until } });
    } else if (kind === "VERIFICATION_PREMIUM") {
      await prisma.company.update({
        where: { id: companyId },
        data: { subscriptionTier: "PREMIUM" },
      });
    }
    // RFQ/QUOTATION credits need no grant — billing/usage.ts sums CONFIRMED
    // requests for the current month when it computes the effective limit.
  }

  /**
   * Payer-side confirmation for the methods that have no webhook (bank
   * transfer): the company states it has paid. This does NOT grant the
   * credits — only the platform team confirming receipt does — it just moves
   * the request to the top of the admin queue with the reference attached.
   */
  async declarePaid(user: AuthUser, membership: Membership, creditRequestId: string) {
    const request = await this.loadOwn(membership, creditRequestId);
    if (request.status !== "PENDING_PAYMENT") {
      throw conflict("This request has already been settled");
    }
    if (!request.paymentRef) throw badRequest("Start a payment before confirming it");
    if (request.paymentMethod === "CARD" || request.paymentMethod === "MOBILE_MONEY") {
      throw forbidden("Card and mobile-money payments confirm automatically");
    }
    const superAdmins = await prisma.user.findMany({
      where: { isSuperAdmin: true, status: "ACTIVE" },
      select: { id: true },
    });
    await notify({
      userIds: superAdmins.map((u) => u.id),
      type: "CREDIT_UPDATE",
      title: "Fee payment declared — awaiting confirmation",
      body: `${membership.company.name} says it has paid ${request.currency} ${request.fee.toString()} (ref ${request.paymentRef}). Confirm once the funds land.`,
      href: "/admin/credits",
      emailContent: genericEventEmail({
        title: "Fee payment declared — awaiting confirmation",
        body: `${membership.company.name} declared payment of ${request.currency} ${request.fee.toString()} for ${request.count} ${request.kind} credit(s), reference ${request.paymentRef}. Confirm once the funds land.`,
        url: `${env.APP_URL}/admin/credits`,
      }),
    });
    return prisma.creditRequest.update({
      where: { id: request.id },
      data: { note: `Payer declared payment ${new Date().toISOString()} (by ${user.email})` },
    });
  }
}
