import { Injectable } from "@nestjs/common";
import type { OrderStatusUpdate } from "@pharmachain/core";
import { canTransitionOrder, ORDER_STATUS_LABELS } from "@pharmachain/core";
import { prisma } from "@pharmachain/db";
import { genericEventEmail } from "@pharmachain/email";
import { notify } from "@pharmachain/notifications";
import { conflict, forbidden, notFound } from "../../common/errors";
import { env } from "../../env";
import type { AuthUser, Membership } from "../../lib/context";

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
   * Basic shipment visibility (US-701..703): the 6-stage lifecycle lives on
   * the order. Seller staff move it strictly forward; super admins may
   * correct any stage (the correction is audited like everything else).
   */
  async updateStatus(
    user: AuthUser,
    membership: Membership | undefined,
    orderId: string,
    body: OrderStatusUpdate,
  ) {
    const order = await this.loadOrder(orderId);

    const isSeller = membership?.companyId === order.sellerCompanyId;
    if (!isSeller && !user.isSuperAdmin) {
      throw forbidden("Only the supplier can update shipment status");
    }
    if (isSeller && membership && membership.role === "FINANCE") {
      throw forbidden(); // US-204: finance staff don't drive shipments
    }
    if (!canTransitionOrder(order.status, body.status, { isSuperAdmin: user.isSuperAdmin })) {
      throw conflict(
        `Cannot move from ${ORDER_STATUS_LABELS[order.status]} to ${ORDER_STATUS_LABELS[body.status]}`,
      );
    }

    const eta = body.eta ? new Date(body.eta) : undefined;
    const updated = await prisma.$transaction(async (tx) => {
      // Conditional on the status we validated against — a concurrent update
      // in between surfaces as a 409 instead of silently skipping stages.
      const transitioned = await tx.order.updateMany({
        where: { id: order.id, status: order.status },
        data: { status: body.status, ...(eta ? { eta } : {}) },
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

    // US-703: buyer notified on every transition (email/WhatsApp respect prefs)
    await notify({
      companyId: order.buyerCompanyId,
      type: "SHIPMENT_STATUS_CHANGE",
      title: `Order ${order.orderNo}: ${ORDER_STATUS_LABELS[body.status]}`,
      body: body.note ?? `Shipment status updated to ${ORDER_STATUS_LABELS[body.status]}.`,
      href: `/orders/${order.id}`,
      emailContent: genericEventEmail({
        title: `Order ${order.orderNo} — ${ORDER_STATUS_LABELS[body.status]}`,
        body: `${body.note ?? "Shipment status updated."}${updated.eta ? `\nETA: ${updated.eta.toDateString()}` : ""}`,
        url: `${env.APP_URL}/orders/${order.id}`,
        cta: "Track order",
      }),
      whatsappText: `PharmaChain: order ${order.orderNo} is now "${ORDER_STATUS_LABELS[body.status]}". ${env.APP_URL}/orders/${order.id}`,
    });

    return {
      updated,
      correction: user.isSuperAdmin && !isSeller,
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
    const isSeller = membership?.companyId === order.sellerCompanyId;
    if (!isSeller && !user.isSuperAdmin) {
      throw forbidden("Only the supplier can update the ETA");
    }
    if (isSeller && membership && membership.role === "FINANCE") {
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
    await notify({
      companyId: order.buyerCompanyId,
      type: "SHIPMENT_STATUS_CHANGE",
      title: `Order ${order.orderNo}: ETA updated`,
      body: `New estimated delivery: ${eta.toDateString()}.`,
      href: `/orders/${order.id}`,
    });
    return { updated, previousEta: order.eta };
  }
}
