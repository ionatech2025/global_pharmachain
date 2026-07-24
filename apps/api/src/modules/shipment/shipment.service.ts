import { Injectable } from "@nestjs/common";
import type { OrderStatusUpdate, ShipmentExceptionInput } from "@pharmachain/core";
import {
  canActorSetStage,
  canTransitionOrder,
  ORDER_STATUS_LABELS,
  SHIPMENT_EXCEPTION_LABELS,
} from "@pharmachain/core";
import { prisma } from "@pharmachain/db";
import { genericEventEmail } from "@pharmachain/email";
import { notify } from "@pharmachain/notifications";
import { badRequest, conflict, forbidden, notFound } from "../../common/errors";
import { env } from "../../env";
import type { AuthUser, Membership } from "../../lib/context";
import { resolveShipmentRole, shipmentPartyUserIds } from "../../lib/shipment-access";
import { emitWebhookEvent } from "../../lib/webhooks";

const EXCEPTION_NOTIFICATION = {
  DELAYED: "SHIPMENT_DELAYED",
  CUSTOMS_REJECTED: "CUSTOMS_ALERT",
  DELIVERY_FAILED: "DELIVERY_FAILED",
} as const;

@Injectable()
export class ShipmentService {
  private async loadOrder(orderId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { buyerCompany: { select: { name: true } } },
    });
    if (!order) throw notFound("Order not found");
    return order;
  }

  /**
   * Full 13-stage lifecycle (Phase 2 §1): seller staff and the appointed
   * forwarder run it end to end, transporters drive the road legs, clearing
   * agents the customs stages, and the buyer confirms final receipt. Super
   * admins may correct any stage (audited with a mandatory reason).
   */
  async updateStatus(
    user: AuthUser,
    membership: Membership | undefined,
    orderId: string,
    body: OrderStatusUpdate,
  ) {
    const order = await this.loadOrder(orderId);
    const role = await resolveShipmentRole(user, membership, order);
    if (!role) throw forbidden("You are not a party to this shipment");
    if (membership && membership.role === "FINANCE" && !user.isSuperAdmin) {
      throw forbidden(); // US-204: finance staff don't drive shipments
    }
    const isCorrection = role === "admin";
    if (!isCorrection && !canActorSetStage(role, body.status)) {
      throw forbidden(`Your role cannot set the stage to ${ORDER_STATUS_LABELS[body.status]}`);
    }
    if (!canTransitionOrder(order.status, body.status, { isSuperAdmin: isCorrection })) {
      throw conflict(
        `Cannot move from ${ORDER_STATUS_LABELS[order.status]} to ${ORDER_STATUS_LABELS[body.status]}`,
      );
    }
    // US-701 TC4: an out-of-sequence super-admin correction must say why —
    // the reason lands in the audit log's reason column via the controller.
    if (isCorrection && (!body.note || body.note.trim().length < 5)) {
      throw badRequest("A correction reason (min 5 characters) is required");
    }

    const eta = body.eta ? new Date(body.eta) : undefined;
    const updated = await prisma.$transaction(async (tx) => {
      // Conditional on the status we validated against — a concurrent update
      // in between surfaces as a 409 instead of silently skipping stages.
      const transitioned = await tx.order.updateMany({
        where: { id: order.id, status: order.status },
        data: {
          status: body.status,
          ...(eta ? { eta } : {}),
          ...(body.status === "DELIVERY_CONFIRMED" ? { deliveryConfirmedAt: new Date() } : {}),
        },
      });
      if (transitioned.count === 0) {
        throw conflict("The order status changed while you were updating it — reload and retry");
      }
      await tx.orderStatusEvent.create({
        data: {
          orderId: order.id,
          status: body.status,
          note: body.note,
          eta,
          actorUserId: user.id,
        },
      });
      return tx.order.findUniqueOrThrow({ where: { id: order.id } });
    });

    // Phase 5 §3: partner systems hear about the transition too.
    void emitWebhookEvent([order.buyerCompanyId, order.sellerCompanyId], "order.status_changed", {
      orderId: order.id,
      orderNo: order.orderNo,
      status: body.status,
      note: body.note ?? null,
    });
    // Phase 2 §1: every transition notifies buyer, seller AND the appointed
    // logistics parties, on every channel their preferences allow.
    const etaLine = updated.eta ? ` ETA ${updated.eta.toDateString()}.` : "";
    await notify({
      userIds: await shipmentPartyUserIds(order),
      type: "SHIPMENT_STATUS_CHANGE",
      title: `Order ${order.orderNo}: ${ORDER_STATUS_LABELS[body.status]}`,
      body: `${body.note ?? `Shipment status updated to ${ORDER_STATUS_LABELS[body.status]}.`}${etaLine}`,
      href: `/orders/${order.id}`,
      emailContent: genericEventEmail({
        title: `Order ${order.orderNo} — ${ORDER_STATUS_LABELS[body.status]}`,
        body: `${body.note ?? "Shipment status updated."}${updated.eta ? `\nETA: ${updated.eta.toDateString()}` : ""}`,
        url: `${env.APP_URL}/orders/${order.id}`,
        cta: "Track order",
      }),
      whatsappText: `PharmaChain: order ${order.orderNo} is now "${ORDER_STATUS_LABELS[body.status]}".${etaLine} ${env.APP_URL}/orders/${order.id}`,
    });

    return {
      updated,
      correction: isCorrection,
      previousStatus: order.status,
    };
  }

  async updateEta(
    user: AuthUser,
    membership: Membership | undefined,
    orderId: string,
    etaIso: string,
  ) {
    const order = await this.loadOrder(orderId);
    const role = await resolveShipmentRole(user, membership, order);
    // ETA is transport planning: seller, forwarder or admin (Phase 2 §2).
    if (role !== "seller" && role !== "FORWARDER" && role !== "admin") {
      throw forbidden("Only the supplier or appointed forwarder can update the ETA");
    }
    if (membership && membership.role === "FINANCE" && !user.isSuperAdmin) {
      throw forbidden(); // US-204: same rule as status updates
    }
    const eta = new Date(etaIso);
    // Recorded as a same-status event so buyers keep a history of ETA changes.
    const [updated] = await prisma.$transaction([
      prisma.order.update({ where: { id: order.id }, data: { eta } }),
      prisma.orderStatusEvent.create({
        data: {
          orderId: order.id,
          status: order.status,
          note: "ETA updated",
          eta,
          actorUserId: user.id,
        },
      }),
    ]);
    // US-703: an ETA change is planning-critical for the buyer — it goes
    // off-platform too, not in-app only.
    await notify({
      userIds: await shipmentPartyUserIds(order),
      type: "SHIPMENT_STATUS_CHANGE",
      title: `Order ${order.orderNo}: ETA updated`,
      body: `New estimated delivery: ${eta.toDateString()}.`,
      href: `/orders/${order.id}`,
      emailContent: genericEventEmail({
        title: `Order ${order.orderNo} — ETA updated`,
        body: `New estimated delivery: ${eta.toDateString()}.`,
        url: `${env.APP_URL}/orders/${order.id}`,
        cta: "Track order",
      }),
      whatsappText: `PharmaChain: order ${order.orderNo} ETA updated to ${eta.toDateString()}.`,
    });
    return { updated, previousEta: order.eta };
  }

  /**
   * Phase 2 §4: recordable exceptions (delay, customs rejection, failed
   * delivery attempt) annotate the timeline at the current stage and alert
   * every party over their preferred channels.
   */
  async recordException(
    user: AuthUser,
    membership: Membership | undefined,
    orderId: string,
    body: ShipmentExceptionInput,
  ) {
    const order = await this.loadOrder(orderId);
    const role = await resolveShipmentRole(user, membership, order);
    if (!role) throw forbidden("You are not a party to this shipment");
    if (order.status === "DELIVERY_CONFIRMED") {
      throw conflict("This shipment is complete — raise a dispute instead");
    }

    const event = await prisma.orderStatusEvent.create({
      data: {
        orderId: order.id,
        status: order.status,
        note: body.note,
        exception: body.kind,
        actorUserId: user.id,
      },
    });
    void emitWebhookEvent([order.buyerCompanyId, order.sellerCompanyId], "shipment.exception", {
      orderId: order.id,
      orderNo: order.orderNo,
      kind: body.kind,
      note: body.note,
    });
    const label = SHIPMENT_EXCEPTION_LABELS[body.kind];
    await notify({
      userIds: await shipmentPartyUserIds(order),
      type: EXCEPTION_NOTIFICATION[body.kind],
      title: `Order ${order.orderNo}: ${label}`,
      body: body.note,
      href: `/orders/${order.id}`,
      emailContent: genericEventEmail({
        title: `Order ${order.orderNo} — ${label}`,
        body: body.note,
        url: `${env.APP_URL}/orders/${order.id}`,
        cta: "Open the shipment",
      }),
      whatsappText: `PharmaChain: ${label} on order ${order.orderNo} — ${body.note}`,
    });
    return event;
  }
}
