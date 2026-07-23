import type { LogisticsRole } from "@pharmachain/core";
import { prisma } from "@pharmachain/db";
import type { AuthUser, Membership } from "./context";

/** How the caller relates to a shipment. Appointed logistics companies see
 *  exactly the shipments they are appointed to (Phase 2 §2). */
export type ShipmentRole = "buyer" | "seller" | "admin" | LogisticsRole;

export async function resolveShipmentRole(
  user: AuthUser,
  membership: Membership | undefined,
  order: { id: string; buyerCompanyId: string; sellerCompanyId: string },
): Promise<ShipmentRole | null> {
  if (membership?.companyId === order.buyerCompanyId) return "buyer";
  if (membership?.companyId === order.sellerCompanyId) return "seller";
  if (membership) {
    const appointment = await prisma.shipmentAppointment.findFirst({
      where: { orderId: order.id, companyId: membership.companyId, status: "ACTIVE" },
      select: { role: true },
    });
    if (appointment) return appointment.role;
  }
  return user.isSuperAdmin ? "admin" : null;
}

/** All user ids that should hear about shipment events: buyer + seller staff
 *  plus every ACTIVE appointed logistics company's staff. */
export async function shipmentPartyUserIds(order: {
  id: string;
  buyerCompanyId: string;
  sellerCompanyId: string;
}): Promise<string[]> {
  const appointments = await prisma.shipmentAppointment.findMany({
    where: { orderId: order.id, status: "ACTIVE" },
    select: { companyId: true },
  });
  const companyIds = [
    order.buyerCompanyId,
    order.sellerCompanyId,
    ...appointments.map((a) => a.companyId),
  ];
  const members = await prisma.companyUserRole.findMany({
    where: { companyId: { in: companyIds }, user: { status: "ACTIVE" } },
    select: { userId: true },
  });
  return [...new Set(members.map((m) => m.userId))];
}
