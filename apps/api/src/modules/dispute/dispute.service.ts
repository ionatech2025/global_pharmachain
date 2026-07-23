import { Injectable } from "@nestjs/common";
import type { DisputeCreateInput } from "@pharmachain/core";
import { prisma } from "@pharmachain/db";
import { genericEventEmail } from "@pharmachain/email";
import { notify } from "@pharmachain/notifications";
import { conflict, forbidden, notFound } from "../../common/errors";
import { env } from "../../env";
import type { AuthUser, Membership } from "../../lib/context";
import { resolveShipmentRole, shipmentPartyUserIds } from "../../lib/shipment-access";

@Injectable()
export class DisputeService {
  /**
   * Phase 2 §4: any shipment party can raise a complaint against a shipment;
   * every update notifies the parties and lands on the audit trail.
   */
  async raise(user: AuthUser, membership: Membership, orderId: string, body: DisputeCreateInput) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw notFound("Order not found");
    const role = await resolveShipmentRole(user, membership, order);
    if (!role || role === "admin") throw forbidden("Only shipment parties raise disputes");

    const dispute = await prisma.dispute.create({
      data: {
        orderId,
        raisedByCompanyId: membership.companyId,
        raisedById: user.id,
        subject: body.subject,
        body: body.body,
        legalReference: body.legalReference,
      },
    });
    await notify({
      userIds: await shipmentPartyUserIds(order),
      type: "DISPUTE_UPDATE",
      title: `Dispute raised on order ${order.orderNo}`,
      body: `${membership.company.name}: ${body.subject}`,
      href: `/orders/${order.id}`,
      emailContent: genericEventEmail({
        title: `Dispute raised — order ${order.orderNo}`,
        body: `${membership.company.name} raised a dispute: ${body.subject}\n\n${body.body}`,
        url: `${env.APP_URL}/orders/${order.id}`,
        cta: "Open the shipment",
      }),
    });
    return dispute;
  }

  /** Disputes involving my company (raised by us or on our shipments). */
  async listMine(membership: Membership) {
    return prisma.dispute.findMany({
      where: {
        OR: [
          { raisedByCompanyId: membership.companyId },
          { order: { buyerCompanyId: membership.companyId } },
          { order: { sellerCompanyId: membership.companyId } },
          {
            order: {
              appointments: { some: { companyId: membership.companyId, status: "ACTIVE" } },
            },
          },
        ],
      },
      include: {
        order: { select: { id: true, orderNo: true, title: true } },
        company: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  async listForOrder(user: AuthUser, membership: Membership | undefined, orderId: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw notFound("Order not found");
    const role = await resolveShipmentRole(user, membership, order);
    if (!role) throw notFound("Order not found");
    return prisma.dispute.findMany({
      where: { orderId },
      include: { company: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Raiser escalates an open dispute to the platform admins. */
  async escalate(membership: Membership, disputeId: string) {
    const dispute = await prisma.dispute.findUnique({
      where: { id: disputeId },
      include: { order: true },
    });
    if (!dispute || dispute.raisedByCompanyId !== membership.companyId) {
      throw notFound("Dispute not found");
    }
    if (dispute.status !== "OPEN") throw conflict("Only open disputes can be escalated");

    const updated = await prisma.dispute.update({
      where: { id: disputeId },
      data: { status: "ESCALATED", escalatedAt: new Date() },
    });
    const superAdmins = await prisma.user.findMany({
      where: { isSuperAdmin: true, status: "ACTIVE" },
      select: { id: true },
    });
    await notify({
      userIds: superAdmins.map((u) => u.id),
      type: "DISPUTE_UPDATE",
      title: `Dispute escalated: order ${dispute.order.orderNo}`,
      body: `${membership.company.name} escalated "${dispute.subject}" to platform review.`,
      href: "/admin/disputes",
      emailContent: genericEventEmail({
        title: "A dispute was escalated to the platform",
        body: `${membership.company.name} escalated "${dispute.subject}" on order ${dispute.order.orderNo}.`,
        url: `${env.APP_URL}/admin/disputes`,
        cta: "Review disputes",
      }),
    });
    await notify({
      userIds: await shipmentPartyUserIds(dispute.order),
      type: "DISPUTE_UPDATE",
      title: `Dispute escalated on order ${dispute.order.orderNo}`,
      body: `"${dispute.subject}" is now with the platform team.`,
      href: `/orders/${dispute.orderId}`,
    });
    return updated;
  }

  async withdraw(user: AuthUser, membership: Membership, disputeId: string) {
    const dispute = await prisma.dispute.findUnique({ where: { id: disputeId } });
    if (!dispute || dispute.raisedByCompanyId !== membership.companyId) {
      throw notFound("Dispute not found");
    }
    if (dispute.status === "RESOLVED") throw conflict("This dispute is already resolved");
    return prisma.dispute.update({
      where: { id: disputeId },
      data: { status: "WITHDRAWN", resolvedAt: new Date(), resolvedById: user.id },
    });
  }

  // ─── Platform admin ────────────────────────────────────────────────────────

  async adminList(status?: string) {
    return prisma.dispute.findMany({
      where: status ? { status: status as never } : { status: { in: ["OPEN", "ESCALATED"] } },
      include: {
        order: { select: { id: true, orderNo: true, title: true } },
        company: { select: { id: true, name: true } },
        raisedBy: { select: { name: true, email: true } },
      },
      orderBy: [{ status: "desc" }, { createdAt: "asc" }],
      take: 200,
    });
  }

  async adminResolve(user: AuthUser, disputeId: string, resolution: string) {
    const dispute = await prisma.dispute.findUnique({
      where: { id: disputeId },
      include: { order: true },
    });
    if (!dispute) throw notFound("Dispute not found");
    if (dispute.status === "RESOLVED" || dispute.status === "WITHDRAWN") {
      throw conflict("This dispute is already closed");
    }
    const updated = await prisma.dispute.update({
      where: { id: disputeId },
      data: {
        status: "RESOLVED",
        resolution,
        resolvedAt: new Date(),
        resolvedById: user.id,
      },
    });
    await notify({
      userIds: await shipmentPartyUserIds(dispute.order),
      type: "DISPUTE_UPDATE",
      title: `Dispute resolved: order ${dispute.order.orderNo}`,
      body: resolution,
      href: `/orders/${dispute.orderId}`,
      emailContent: genericEventEmail({
        title: `Dispute resolved — order ${dispute.order.orderNo}`,
        body: `Platform resolution for "${dispute.subject}":\n\n${resolution}`,
        url: `${env.APP_URL}/orders/${dispute.orderId}`,
        cta: "Open the shipment",
      }),
    });
    return updated;
  }
}
