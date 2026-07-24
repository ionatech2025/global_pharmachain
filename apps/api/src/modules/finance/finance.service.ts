import { Injectable } from "@nestjs/common";
import type {
  InvoiceCreateInput,
  PaymentCreateInput,
  PdfTable,
  ReportQuery,
} from "@pharmachain/core";
import {
  fxRate,
  LEDGER_ENTRY_LABELS,
  PARAM_KEYS,
  PAYMENT_METHOD_LABELS,
  renderPdf,
} from "@pharmachain/core";
import type { Prisma } from "@pharmachain/db";
import { prisma } from "@pharmachain/db";
import { genericEventEmail } from "@pharmachain/email";
import { notify } from "@pharmachain/notifications";
import { badRequest, conflict, forbidden, notFound } from "../../common/errors";
import { env } from "../../env";
import type { AuthUser, Membership } from "../../lib/context";
import { getParam } from "../../lib/params";
import { gatewayById, gatewayFor } from "../../lib/payment-gateways";
import { emitWebhookEvent } from "../../lib/webhooks";
import { buildStorageKey, putObject } from "../document/storage";

function refCode(prefix: string): string {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${prefix}-${stamp}${rand}`;
}

const toNum = (d: Prisma.Decimal | number | string) => Number(d);

@Injectable()
export class FinanceService {
  private async loadOrderForParty(membership: Membership, orderId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        buyerCompany: { select: { id: true, name: true, country: true } },
        sellerCompany: { select: { id: true, name: true, country: true } },
      },
    });
    if (
      !order ||
      (order.buyerCompanyId !== membership.companyId &&
        order.sellerCompanyId !== membership.companyId)
    ) {
      throw notFound("Order not found");
    }
    return order;
  }

  // ─── Payments (Phase 3 §1) ─────────────────────────────────────────────────

  /** Buyer initiates a (possibly partial/instalment) payment on an order. */
  async createPayment(
    user: AuthUser,
    membership: Membership,
    orderId: string,
    input: PaymentCreateInput,
  ) {
    const order = await this.loadOrderForParty(membership, orderId);
    if (order.buyerCompanyId !== membership.companyId) {
      throw forbidden("Only the buyer records outgoing payments");
    }
    const { balance } = await this.orderBalance(orderId, toNum(order.totalAmount));
    if (input.amount > balance + 0.005) {
      throw badRequest(
        `Amount exceeds the outstanding balance (${order.currency} ${balance.toFixed(2)})`,
      );
    }
    const gateway =
      input.method === "BANK_TRANSFER" ? gatewayFor("BANK_TRANSFER") : gatewayFor(input.method);
    const bankDetails = await getParam(PARAM_KEYS.PLATFORM_BANK_DETAILS);
    const initiated = await gateway.initiate({
      reference: refCode("PAY"),
      amount: input.amount,
      currency: order.currency,
      method: input.method,
      bankDetails,
    });
    const payment = await prisma.payment.create({
      data: {
        orderId,
        payerCompanyId: membership.companyId,
        method: input.method,
        provider: initiated.provider,
        providerRef: initiated.providerRef,
        amount: input.amount,
        currency: order.currency,
        note: input.note,
        recordedById: user.id,
      },
    });
    // The payee's finance team hears about the incoming payment immediately.
    await notify({
      companyId: order.sellerCompanyId,
      roles: ["COMPANY_ADMIN", "FINANCE"],
      type: "ACCOUNT_UPDATE",
      title: `Payment initiated on ${order.orderNo}`,
      body: `${order.buyerCompany.name} initiated ${order.currency} ${input.amount.toFixed(2)} via ${PAYMENT_METHOD_LABELS[input.method]} (ref ${payment.providerRef}).`,
      href: `/orders/${order.id}`,
    });
    return { payment, instructions: initiated.instructions };
  }

  /** Payee (or super admin) confirms receipt of a manual payment. */
  async confirmPayment(
    user: AuthUser,
    membership: Membership | undefined,
    paymentId: string,
    note?: string,
  ) {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: true },
    });
    if (!payment) throw notFound("Payment not found");
    const isPayee = membership?.companyId === payment.order.sellerCompanyId;
    if (!isPayee && !user.isSuperAdmin) {
      throw forbidden("Only the payee confirms receipt");
    }
    return this.settlePayment(payment.id, "CONFIRMED", { confirmedById: user.id, note });
  }

  /** Payer cancels / payee rejects a pending payment. */
  async failPayment(
    user: AuthUser,
    membership: Membership | undefined,
    paymentId: string,
    reason: string,
  ) {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: true },
    });
    if (!payment) throw notFound("Payment not found");
    const isParty =
      membership?.companyId === payment.order.sellerCompanyId ||
      membership?.companyId === payment.payerCompanyId;
    if (!isParty && !user.isSuperAdmin) throw forbidden();
    return this.settlePayment(payment.id, "FAILED", { failureReason: reason });
  }

  /**
   * Single settlement path shared by manual confirmation and webhooks:
   * status flip is conditional on PENDING (idempotent under replays), then
   * ledger entries, parameterised platform commission, invoice auto-PAID
   * and notifications.
   */
  private async settlePayment(
    paymentId: string,
    outcome: "CONFIRMED" | "FAILED",
    extra: {
      confirmedById?: string;
      note?: string;
      failureReason?: string;
      webhookPayload?: Record<string, unknown>;
    },
  ) {
    const flipped = await prisma.payment.updateMany({
      where: { id: paymentId, status: "PENDING" },
      data: {
        status: outcome,
        confirmedAt: outcome === "CONFIRMED" ? new Date() : undefined,
        confirmedById: extra.confirmedById,
        failureReason: extra.failureReason,
        ...(extra.note ? { note: extra.note } : {}),
        ...(extra.webhookPayload
          ? { webhookPayload: extra.webhookPayload as Prisma.InputJsonValue }
          : {}),
      },
    });
    if (flipped.count === 0) throw conflict("This payment was already settled");
    const payment = await prisma.payment.findUniqueOrThrow({
      where: { id: paymentId },
      include: {
        order: {
          include: {
            buyerCompany: { select: { id: true, name: true } },
            sellerCompany: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (payment.status === "CONFIRMED") {
      const amount = toNum(payment.amount);
      const commissionPct = Number(await getParam(PARAM_KEYS.PLATFORM_COMMISSION_PCT));
      const commission = Math.round(amount * commissionPct) / 100;
      await prisma.$transaction([
        prisma.ledgerEntry.create({
          data: {
            companyId: payment.payerCompanyId,
            kind: "PAYMENT_OUT",
            amount: -amount,
            currency: payment.currency,
            refType: "Payment",
            refId: payment.id,
            note: `Order ${payment.order.orderNo} · ref ${payment.providerRef}`,
          },
        }),
        prisma.ledgerEntry.create({
          data: {
            companyId: payment.order.sellerCompanyId,
            kind: "PAYMENT_IN",
            amount,
            currency: payment.currency,
            refType: "Payment",
            refId: payment.id,
            note: `Order ${payment.order.orderNo} · ref ${payment.providerRef}`,
          },
        }),
        // Parameterised transaction-fee collection (Phase 3 §1): recorded
        // against the seller; platform revenue = Σ PLATFORM_FEE entries.
        prisma.ledgerEntry.create({
          data: {
            companyId: payment.order.sellerCompanyId,
            kind: "PLATFORM_FEE",
            amount: -commission,
            currency: payment.currency,
            refType: "Payment",
            refId: payment.id,
            note: `Commission ${commissionPct}% on ${payment.providerRef}`,
          },
        }),
      ]);
      // Auto-mark invoices PAID once confirmed payments cover the total.
      const { paid } = await this.orderBalance(payment.orderId, toNum(payment.order.totalAmount));
      await prisma.invoice.updateMany({
        where: {
          orderId: payment.orderId,
          status: "ISSUED",
          total: { lte: paid + 0.005 },
        },
        data: { status: "PAID", paidAt: new Date() },
      });
    }

    if (payment.status === "CONFIRMED") {
      void emitWebhookEvent(
        [payment.payerCompanyId, payment.order.sellerCompanyId],
        "payment.confirmed",
        {
          paymentId: payment.id,
          providerRef: payment.providerRef,
          orderNo: payment.order.orderNo,
          amount: String(payment.amount),
          currency: payment.currency,
        },
      );
    }
    const label = payment.status === "CONFIRMED" ? "confirmed" : "failed";
    await notify({
      userIds: (
        await prisma.companyUserRole.findMany({
          where: {
            companyId: { in: [payment.payerCompanyId, payment.order.sellerCompanyId] },
            user: { status: "ACTIVE" },
          },
          select: { userId: true },
        })
      ).map((m) => m.userId),
      type: "ACCOUNT_UPDATE",
      title: `Payment ${label}: ${payment.currency} ${toNum(payment.amount).toFixed(2)}`,
      body: `Order ${payment.order.orderNo} · ref ${payment.providerRef}${payment.failureReason ? ` — ${payment.failureReason}` : ""}`,
      href: `/orders/${payment.orderId}`,
      emailContent: genericEventEmail({
        title: `Payment ${label} — order ${payment.order.orderNo}`,
        body: `${payment.currency} ${toNum(payment.amount).toFixed(2)} (${PAYMENT_METHOD_LABELS[payment.method]}, ref ${payment.providerRef}) is ${label}.`,
        url: `${env.APP_URL}/orders/${payment.orderId}`,
        cta: "View the order",
      }),
    });
    return payment;
  }

  /** Signature-verified provider webhook (Phase 3 §1). */
  async handleWebhook(providerId: string, body: Record<string, unknown>) {
    const gateway = gatewayById(providerId);
    if (!gateway) throw notFound("Unknown payment provider");
    const verdict = gateway.verifyWebhook(body);
    if (!verdict.valid || !verdict.providerRef || !verdict.status) {
      throw badRequest(`Webhook rejected: ${verdict.reason ?? "invalid"}`);
    }
    const payment = await prisma.payment.findUnique({
      where: { providerRef: verdict.providerRef },
    });
    if (!payment) throw notFound("No payment matches this reference");
    return this.settlePayment(payment.id, verdict.status, {
      webhookPayload: body,
      failureReason: verdict.status === "FAILED" ? "Provider reported failure" : undefined,
    });
  }

  /**
   * What the buyer actually owes: once an invoice is issued its total (which
   * adds duty/VAT on top of the order contract amount) becomes the basis —
   * otherwise a fully-invoiced order could never be fully paid.
   */
  private async orderBalance(orderId: string, orderTotal: number) {
    const [confirmed, invoiced] = await Promise.all([
      prisma.payment.aggregate({
        where: { orderId, status: "CONFIRMED" },
        _sum: { amount: true },
      }),
      prisma.invoice.aggregate({
        where: { orderId, status: { in: ["ISSUED", "PAID"] } },
        _sum: { total: true },
      }),
    ]);
    const paid = toNum(confirmed._sum.amount ?? 0);
    const invoiceTotal = toNum(invoiced._sum?.total ?? 0);
    const basis = Math.max(orderTotal, invoiceTotal);
    return { paid, balance: Math.max(0, basis - paid), basis };
  }

  /** Payments + running balance, visible on the order (Phase 3 §1). */
  async listOrderPayments(membership: Membership, orderId: string) {
    const order = await this.loadOrderForParty(membership, orderId);
    const payments = await prisma.payment.findMany({
      where: { orderId },
      include: { recordedBy: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
    const { paid, balance, basis } = await this.orderBalance(orderId, toNum(order.totalAmount));
    return { payments, total: basis, paid, balance, currency: order.currency };
  }

  // ─── Invoices & tax (Phase 3 §2) ───────────────────────────────────────────

  /** Seller issues the order invoice: duty/VAT from the TaxRule table, FX
   *  stamped, per-issuer sequential number, PDF stored as an order document. */
  async createInvoice(
    user: AuthUser,
    membership: Membership,
    orderId: string,
    input: InvoiceCreateInput,
  ) {
    const order = await this.loadOrderForParty(membership, orderId);
    if (order.sellerCompanyId !== membership.companyId) {
      throw forbidden("Only the supplier issues the order invoice");
    }
    const existing = await prisma.invoice.findFirst({
      where: { orderId, status: { in: ["ISSUED", "PAID"] } },
    });
    if (existing) throw conflict(`Invoice ${existing.invoiceNo} already covers this order`);

    // HS code: explicit input, else detected from the seller's catalogue.
    let hsCode = input.hsCode ?? null;
    if (!hsCode) {
      const listing = await prisma.listing.findFirst({
        where: { companyId: order.sellerCompanyId, hsCode: { not: null } },
        orderBy: { updatedAt: "desc" },
        select: { hsCode: true },
      });
      hsCode = listing?.hsCode ?? null;
    }
    const originCountry = order.sellerCompany.country;
    const destCountry = order.buyerCompany.country;

    // Longest-prefix tax rule for the lane (Phase 3 §2).
    const rules = await prisma.taxRule.findMany({
      where: {
        active: true,
        destCountry: { equals: destCountry, mode: "insensitive" },
        OR: [
          { originCountry: null },
          { originCountry: { equals: originCountry, mode: "insensitive" } },
        ],
      },
    });
    const rule = hsCode
      ? rules
          .filter((r) => (hsCode as string).startsWith(r.hsPrefix))
          .sort((a, b) => b.hsPrefix.length - a.hsPrefix.length)[0]
      : undefined;

    const subtotalBase = toNum(order.totalAmount);
    const extraTotal = (input.extraLines ?? []).reduce((s, l) => s + l.amount, 0);
    const subtotal = subtotalBase + extraTotal;
    const dutyRatePct = rule ? toNum(rule.dutyRatePct) : 0;
    const vatRatePct = rule ? toNum(rule.vatRatePct) : 0;
    const dutyAmount = Math.round(subtotal * dutyRatePct) / 100;
    const vatAmount = Math.round((subtotal + dutyAmount) * vatRatePct) / 100;
    const total = subtotal + dutyAmount + vatAmount;

    // FX stamp so historical amounts stay reproducible (Phase 3 §3).
    const fxPairs = (await prisma.exchangeRate.findMany()).map((r) => ({
      base: r.base,
      quote: r.quote,
      rate: toNum(r.rate),
    }));
    const rateToUsd = fxRate(fxPairs, order.currency, "USD");

    const lines = [
      {
        description: `${order.title} — ${toNum(order.quantity)} ${order.unit} @ ${toNum(order.unitPrice)}`,
        amount: subtotalBase,
      },
      ...(input.extraLines ?? []),
    ];

    // Per-issuer sequential numbering with a unique-index retry loop.
    let invoice: Awaited<ReturnType<typeof prisma.invoice.create>> | null = null;
    for (let attempt = 0; attempt < 3 && !invoice; attempt += 1) {
      const last = await prisma.invoice.aggregate({
        where: { issuerCompanyId: membership.companyId },
        _max: { seq: true },
      });
      const seq = (last._max.seq ?? 0) + 1;
      try {
        invoice = await prisma.invoice.create({
          data: {
            invoiceNo: `INV-${order.sellerCompany.name
              .replace(/[^A-Za-z]/g, "")
              .slice(0, 4)
              .toUpperCase()}-${String(seq).padStart(5, "0")}`,
            seq,
            issuerCompanyId: membership.companyId,
            recipientCompanyId: order.buyerCompanyId,
            orderId,
            lines: lines as Prisma.InputJsonValue,
            subtotal,
            dutyAmount,
            vatAmount,
            total,
            currency: order.currency,
            hsCode,
            originCountry,
            destCountry,
            dutyRatePct: rule ? dutyRatePct : null,
            vatRatePct: rule ? vatRatePct : null,
            fxRateToUsd: rateToUsd,
            fxStampedAt: rateToUsd === null ? null : new Date(),
            paymentTermsDays: input.paymentTermsDays ?? null,
            issuedById: user.id,
          },
        });
      } catch {
        // unique (issuer, seq) race — recompute and retry
      }
    }
    if (!invoice) throw conflict("Could not allocate an invoice number — retry");

    // Ledger both sides (Phase 3 §2).
    await prisma.$transaction([
      prisma.ledgerEntry.create({
        data: {
          companyId: membership.companyId,
          kind: "INVOICE_ISSUED",
          amount: total,
          currency: order.currency,
          refType: "Invoice",
          refId: invoice.id,
          note: invoice.invoiceNo,
        },
      }),
      prisma.ledgerEntry.create({
        data: {
          companyId: order.buyerCompanyId,
          kind: "INVOICE_RECEIVED",
          amount: -total,
          currency: order.currency,
          refType: "Invoice",
          refId: invoice.id,
          note: invoice.invoiceNo,
        },
      }),
    ]);

    // Store the invoice PDF as a versioned order document (Phase 3 §2).
    const pdf = renderPdf(this.invoicePdfTable(invoice, order));
    const fileName = `${invoice.invoiceNo}.pdf`;
    const storageKey = buildStorageKey(membership.companyId, fileName);
    try {
      await putObject(storageKey, pdf, "application/pdf");
      const doc = await prisma.document.create({
        data: {
          ownerCompanyId: membership.companyId,
          uploadedById: user.id,
          kind: "COMMERCIAL_INVOICE",
          fileName,
          contentType: "application/pdf",
          size: pdf.byteLength,
          storageKey,
          orderId,
          uploadCompletedAt: new Date(),
          scanStatus: "CLEAN",
        },
      });
      await prisma.invoice.update({ where: { id: invoice.id }, data: { documentId: doc.id } });
    } catch (err) {
      // The invoice record is authoritative; a storage hiccup only costs the
      // convenience PDF. Callers can re-export it any time.
      console.error("[finance] invoice pdf store failed:", err);
    }

    void emitWebhookEvent([order.buyerCompanyId, order.sellerCompanyId], "invoice.issued", {
      invoiceId: invoice.id,
      invoiceNo: invoice.invoiceNo,
      orderNo: order.orderNo,
      total: String(invoice.total),
      currency: invoice.currency,
    });
    await notify({
      companyId: order.buyerCompanyId,
      roles: ["COMPANY_ADMIN", "FINANCE"],
      type: "ACCOUNT_UPDATE",
      title: `Invoice ${invoice.invoiceNo} received`,
      body: `${order.sellerCompany.name} invoiced ${order.currency} ${total.toFixed(2)} on order ${order.orderNo}.`,
      href: `/orders/${order.id}`,
      emailContent: genericEventEmail({
        title: `New invoice — ${invoice.invoiceNo}`,
        body: `${order.sellerCompany.name} issued ${order.currency} ${total.toFixed(2)} (duty ${dutyAmount.toFixed(2)}, VAT ${vatAmount.toFixed(2)}) on order ${order.orderNo}.`,
        url: `${env.APP_URL}/orders/${order.id}`,
        cta: "View invoice",
      }),
    });
    return invoice;
  }

  private invoicePdfTable(
    invoice: { invoiceNo: string; lines: unknown; currency: string } & Record<string, unknown>,
    order: { orderNo: string; buyerCompany: { name: string }; sellerCompany: { name: string } },
  ): PdfTable {
    const lines = invoice.lines as Array<{ description: string; amount: number }>;
    return {
      title: `Invoice ${invoice.invoiceNo}`,
      subtitle: `${order.sellerCompany.name} → ${order.buyerCompany.name} · order ${order.orderNo}`,
      columns: ["Description", `Amount (${invoice.currency})`],
      rows: [
        ...lines.map((l) => [l.description, Number(l.amount).toFixed(2)]),
        ["Duty", Number(invoice.dutyAmount).toFixed(2)],
        ["VAT", Number(invoice.vatAmount).toFixed(2)],
        ["TOTAL", Number(invoice.total).toFixed(2)],
      ],
    };
  }

  async listInvoices(membership: Membership) {
    return prisma.invoice.findMany({
      where: {
        OR: [
          { issuerCompanyId: membership.companyId },
          { recipientCompanyId: membership.companyId },
        ],
      },
      include: {
        issuer: { select: { id: true, name: true } },
        recipient: { select: { id: true, name: true } },
        order: { select: { id: true, orderNo: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 300,
    });
  }

  async voidInvoice(membership: Membership, invoiceId: string) {
    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice || invoice.issuerCompanyId !== membership.companyId) {
      throw notFound("Invoice not found");
    }
    if (invoice.status === "PAID") throw conflict("Paid invoices cannot be voided");
    return prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: "VOID", voidedAt: new Date() },
    });
  }

  // ─── Ledger & reports (Phase 3 §2/§4) ──────────────────────────────────────

  async ledger(membership: Membership, query: ReportQuery) {
    const where: Prisma.LedgerEntryWhereInput = {
      companyId: membership.companyId,
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const entries = await prisma.ledgerEntry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 1000,
    });
    return entries;
  }

  async companyFinanceReport(membership: Membership, query: ReportQuery) {
    const range = {
      ...(query.from ? { gte: new Date(query.from) } : {}),
      ...(query.to ? { lte: new Date(query.to) } : {}),
    };
    const hasRange = query.from || query.to;
    const [paymentsOut, paymentsIn, invoicesIssued, invoicesReceived, outstanding, ledger] =
      await prisma.$transaction([
        prisma.payment.findMany({
          where: {
            payerCompanyId: membership.companyId,
            ...(hasRange ? { createdAt: range } : {}),
          },
          include: { order: { select: { orderNo: true } } },
          orderBy: { createdAt: "desc" },
          take: 500,
        }),
        prisma.payment.findMany({
          where: {
            order: { sellerCompanyId: membership.companyId },
            ...(hasRange ? { createdAt: range } : {}),
          },
          include: { order: { select: { orderNo: true } } },
          orderBy: { createdAt: "desc" },
          take: 500,
        }),
        prisma.invoice.findMany({
          where: {
            issuerCompanyId: membership.companyId,
            ...(hasRange ? { createdAt: range } : {}),
          },
          orderBy: { createdAt: "desc" },
          take: 500,
        }),
        prisma.invoice.findMany({
          where: {
            recipientCompanyId: membership.companyId,
            ...(hasRange ? { createdAt: range } : {}),
          },
          orderBy: { createdAt: "desc" },
          take: 500,
        }),
        prisma.invoice.findMany({
          where: {
            OR: [
              { issuerCompanyId: membership.companyId },
              { recipientCompanyId: membership.companyId },
            ],
            status: "ISSUED",
          },
          orderBy: { createdAt: "asc" },
        }),
        prisma.ledgerEntry.findMany({
          where: {
            companyId: membership.companyId,
            ...(hasRange ? { createdAt: range } : {}),
          },
          orderBy: { createdAt: "desc" },
          take: 1000,
        }),
      ]);
    return { paymentsOut, paymentsIn, invoicesIssued, invoicesReceived, outstanding, ledger };
  }

  /** Company report rendered to the shared table shape for CSV/XLS/PDF. */
  companyReportTable(
    companyName: string,
    report: Awaited<ReturnType<FinanceService["companyFinanceReport"]>>,
  ): PdfTable {
    const rows: string[][] = report.ledger.map((e) => [
      e.createdAt.toISOString().slice(0, 10),
      LEDGER_ENTRY_LABELS[e.kind],
      toNum(e.amount).toFixed(2),
      e.currency,
      e.note ?? "",
    ]);
    return {
      title: "Account ledger & transaction history",
      subtitle: `${companyName} · ${new Date().toISOString().slice(0, 10)} · ${report.outstanding.length} outstanding invoice(s)`,
      columns: ["Date", "Kind", "Amount", "Currency", "Reference"],
      rows,
    };
  }

  async platformFinanceReport(query: ReportQuery) {
    const range = {
      ...(query.from ? { gte: new Date(query.from) } : {}),
      ...(query.to ? { lte: new Date(query.to) } : {}),
    };
    const hasRange = query.from || query.to;
    const [creditFees, commissions, paymentVolume, orders, invoices] = await Promise.all([
      prisma.creditRequest.groupBy({
        by: ["currency"],
        where: { status: "CONFIRMED", ...(hasRange ? { createdAt: range } : {}) },
        _sum: { fee: true },
        _count: true,
        orderBy: { currency: "asc" },
      }),
      prisma.ledgerEntry.groupBy({
        by: ["currency"],
        where: { kind: "PLATFORM_FEE", ...(hasRange ? { createdAt: range } : {}) },
        _sum: { amount: true },
        _count: true,
        orderBy: { currency: "asc" },
      }),
      prisma.payment.groupBy({
        by: ["currency", "status"],
        where: hasRange ? { createdAt: range } : {},
        _sum: { amount: true },
        _count: true,
        orderBy: [{ currency: "asc" }, { status: "asc" }],
      }),
      prisma.order.count({ where: hasRange ? { createdAt: range } : {} }),
      prisma.invoice.count({ where: hasRange ? { createdAt: range } : {} }),
    ]);
    return {
      revenue: {
        creditFees: creditFees.map((c) => ({
          currency: c.currency,
          total: toNum(c._sum?.fee ?? 0),
          count: c._count,
        })),
        commissions: commissions.map((c) => ({
          currency: c.currency,
          total: Math.abs(toNum(c._sum?.amount ?? 0)),
          count: c._count,
        })),
      },
      volumes: {
        payments: paymentVolume.map((p) => ({
          currency: p.currency,
          status: p.status,
          total: toNum(p._sum?.amount ?? 0),
          count: p._count,
        })),
        orders,
        invoices,
      },
    };
  }

  platformReportTable(
    report: Awaited<ReturnType<FinanceService["platformFinanceReport"]>>,
  ): PdfTable {
    const rows: string[][] = [
      ...report.revenue.creditFees.map((r) => [
        "Credit fees",
        r.currency,
        r.total.toFixed(2),
        String(r.count),
      ]),
      ...report.revenue.commissions.map((r) => [
        "Commission",
        r.currency,
        r.total.toFixed(2),
        String(r.count),
      ]),
      ...report.volumes.payments.map((p) => [
        `Payments ${p.status}`,
        p.currency,
        p.total.toFixed(2),
        String(p.count),
      ]),
      ["Orders", "—", "—", String(report.volumes.orders)],
      ["Invoices", "—", "—", String(report.volumes.invoices)],
    ];
    return {
      title: "Platform financial report",
      subtitle: `Generated ${new Date().toISOString()}`,
      columns: ["Line", "Currency", "Total", "Count"],
      rows,
    };
  }

  // ─── Reconciliation (Phase 3 §1) ───────────────────────────────────────────

  /** Gateway-vs-platform reconciliation: webhook-settled payments carry the
   *  provider payload; mismatches = stale pending or unmatched settlements. */
  async reconciliation() {
    const [pendingStale, confirmed, failed] = await prisma.$transaction([
      prisma.payment.findMany({
        where: {
          status: "PENDING",
          createdAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
        include: { order: { select: { orderNo: true } } },
        orderBy: { createdAt: "asc" },
        take: 200,
      }),
      prisma.payment.findMany({
        where: { status: "CONFIRMED" },
        include: { order: { select: { orderNo: true } } },
        orderBy: { confirmedAt: "desc" },
        take: 200,
      }),
      prisma.payment.findMany({
        where: { status: "FAILED" },
        include: { order: { select: { orderNo: true } } },
        orderBy: { updatedAt: "desc" },
        take: 100,
      }),
    ]);
    return {
      staleOver7Days: pendingStale,
      confirmed: confirmed.map((p) => ({
        ...p,
        settledBy: p.webhookPayload ? "webhook" : "manual",
      })),
      failed,
    };
  }
}
