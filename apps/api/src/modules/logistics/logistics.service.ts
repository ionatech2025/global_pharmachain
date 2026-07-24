import { Injectable } from "@nestjs/common";
import type {
  AppointmentInput,
  DriverProfileInput,
  LocationPingInput,
  LogisticsRole,
  PodInput,
  ShipmentMetaInput,
} from "@pharmachain/core";
import {
  isLogisticsCompanyType,
  LOGISTICS_ROLE_COMPANY_TYPE,
  LOGISTICS_ROLE_LABELS,
  PARAM_KEYS,
} from "@pharmachain/core";
import { prisma } from "@pharmachain/db";
import { genericEventEmail } from "@pharmachain/email";
import { notify } from "@pharmachain/notifications";
import { badRequest, conflict, forbidden, notFound } from "../../common/errors";
import { env } from "../../env";
import type { AuthUser, Membership } from "../../lib/context";
import { getParam } from "../../lib/params";
import { resolveShipmentRole, shipmentPartyUserIds } from "../../lib/shipment-access";

@Injectable()
export class LogisticsService {
  private async loadOrder(orderId: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw notFound("Order not found");
    return order;
  }

  /** Verified logistics companies a buyer can appoint for a role. */
  async listAppointableCompanies(role: LogisticsRole) {
    return prisma.company.findMany({
      where: { type: LOGISTICS_ROLE_COMPANY_TYPE[role], verificationStatus: "VERIFIED" },
      select: { id: true, name: true, country: true, countriesOfOperation: true },
      orderBy: { name: "asc" },
      take: 100,
    });
  }

  /**
   * Phase 2 §2: the buyer appoints one forwarder / clearing agent /
   * transporter per shipment; appointing again replaces the ACTIVE row.
   * Appointees gain scoped access to exactly this shipment.
   */
  async appoint(user: AuthUser, membership: Membership, orderId: string, body: AppointmentInput) {
    const order = await this.loadOrder(orderId);
    if (order.buyerCompanyId !== membership.companyId) {
      throw forbidden("Only the buyer appoints logistics partners");
    }
    if (order.status === "DELIVERY_CONFIRMED") {
      throw conflict("This shipment is already complete");
    }
    const company = await prisma.company.findUnique({
      where: { id: body.companyId },
      select: { id: true, name: true, type: true, verificationStatus: true },
    });
    if (!company || company.type !== LOGISTICS_ROLE_COMPANY_TYPE[body.role]) {
      throw badRequest(`Pick a verified ${LOGISTICS_ROLE_LABELS[body.role].toLowerCase()}`);
    }
    if (company.verificationStatus !== "VERIFIED") {
      throw badRequest("This company has not passed verification yet");
    }

    const appointment = await prisma.$transaction(async (tx) => {
      await tx.shipmentAppointment.updateMany({
        where: { orderId, role: body.role, status: "ACTIVE" },
        data: { status: "REVOKED", revokedAt: new Date() },
      });
      return tx.shipmentAppointment.create({
        data: {
          orderId,
          role: body.role,
          companyId: company.id,
          appointedById: user.id,
        },
        include: { company: { select: { id: true, name: true } } },
      });
    });

    // Phase 5 §4: parameterised lead-generation fee recorded against the
    // appointed logistics partner's ledger (facilitation monetisation).
    try {
      const leadFee = Number(await getParam(PARAM_KEYS.LOGISTICS_LEAD_FEE_USD));
      if (leadFee > 0) {
        await prisma.ledgerEntry.create({
          data: {
            companyId: company.id,
            kind: "PLATFORM_FEE",
            amount: -leadFee,
            currency: "USD",
            refType: "ShipmentAppointment",
            refId: appointment.id,
            note: `Lead-generation fee · order ${order.orderNo}`,
          },
        });
      }
    } catch {
      // fee recording is best-effort; the appointment stands
    }
    await notify({
      companyId: company.id,
      type: "SHIPMENT_STATUS_CHANGE",
      title: `Appointed as ${LOGISTICS_ROLE_LABELS[body.role].toLowerCase()}`,
      body: `${membership.company.name} appointed you on order ${order.orderNo} — ${order.title}.`,
      href: `/orders/${order.id}`,
      emailContent: genericEventEmail({
        title: `New appointment: order ${order.orderNo}`,
        body: `${membership.company.name} appointed your company as ${LOGISTICS_ROLE_LABELS[body.role].toLowerCase()} on order ${order.orderNo} — ${order.title}. You now have access to this shipment.`,
        url: `${env.APP_URL}/orders/${order.id}`,
        cta: "Open the shipment",
      }),
      whatsappText: `PharmaChain: appointed as ${LOGISTICS_ROLE_LABELS[body.role].toLowerCase()} on order ${order.orderNo}.`,
    });
    return appointment;
  }

  async revoke(membership: Membership, orderId: string, role: LogisticsRole) {
    const order = await this.loadOrder(orderId);
    if (order.buyerCompanyId !== membership.companyId) {
      throw forbidden("Only the buyer manages appointments");
    }
    const result = await prisma.shipmentAppointment.updateMany({
      where: { orderId, role, status: "ACTIVE" },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    if (result.count === 0) throw notFound("No active appointment for that role");
    return { revoked: true };
  }

  /** Shipments an appointed logistics company can see (Phase 2 §2). */
  async listAppointedShipments(membership: Membership, page: number, pageSize: number) {
    if (!isLogisticsCompanyType(membership.company.type)) {
      throw forbidden("Only logistics companies have an appointed-shipments view");
    }
    const where = {
      status: "ACTIVE" as const,
      companyId: membership.companyId,
    };
    const [items, total] = await prisma.$transaction([
      prisma.shipmentAppointment.findMany({
        where,
        include: {
          order: {
            include: {
              buyerCompany: { select: { id: true, name: true, country: true } },
              sellerCompany: { select: { id: true, name: true, country: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.shipmentAppointment.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  /** Freight mode / cold chain / dispatch date (seller or forwarder). */
  async updateShipmentMeta(
    user: AuthUser,
    membership: Membership | undefined,
    orderId: string,
    body: ShipmentMetaInput,
  ) {
    const order = await this.loadOrder(orderId);
    const role = await resolveShipmentRole(user, membership, order);
    if (role !== "seller" && role !== "FORWARDER" && role !== "admin") {
      throw forbidden("Only the supplier or appointed forwarder manages freight details");
    }
    const previous = {
      freightMode: order.freightMode,
      coldChain: order.coldChain,
      dispatchDate: order.dispatchDate,
      eta: order.eta,
    };
    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        ...(body.freightMode !== undefined ? { freightMode: body.freightMode } : {}),
        ...(body.coldChain !== undefined ? { coldChain: body.coldChain } : {}),
        ...(body.dispatchDate !== undefined ? { dispatchDate: new Date(body.dispatchDate) } : {}),
        ...(body.eta !== undefined ? { eta: new Date(body.eta) } : {}),
      },
    });
    // Phase 2 §3: cold-chain flag is visible to all parties — tell them when
    // it turns on so handling requirements are never a surprise.
    if (body.coldChain === true && !previous.coldChain) {
      await notify({
        userIds: await shipmentPartyUserIds(order),
        type: "SHIPMENT_STATUS_CHANGE",
        title: `Order ${order.orderNo}: cold chain required`,
        body: "This shipment is flagged for specialised cold-chain transport (2–8 °C).",
        href: `/orders/${order.id}`,
      });
    }
    return { updated, previous };
  }

  /** GPS ping on a road leg (transporter/forwarder staff). */
  async recordLocation(
    user: AuthUser,
    membership: Membership | undefined,
    orderId: string,
    body: LocationPingInput,
  ) {
    const order = await this.loadOrder(orderId);
    const role = await resolveShipmentRole(user, membership, order);
    if (role !== "TRANSPORTER" && role !== "FORWARDER" && role !== "seller" && role !== "admin") {
      throw forbidden("Only the transport parties record locations");
    }
    return prisma.shipmentLocation.create({
      data: {
        orderId,
        lat: body.lat,
        lng: body.lng,
        note: body.note,
        recordedById: user.id,
      },
    });
  }

  async listLocations(user: AuthUser, membership: Membership | undefined, orderId: string) {
    const order = await this.loadOrder(orderId);
    const role = await resolveShipmentRole(user, membership, order);
    if (!role) throw notFound("Order not found");
    return prisma.shipmentLocation.findMany({
      where: { orderId },
      include: { recordedBy: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
      take: 500,
    });
  }

  /**
   * Phase 2 §3: proof of delivery — typed signature (plus optional drawn
   * signature and photo document), once per order, at the delivery stages.
   */
  async capturePod(
    user: AuthUser,
    membership: Membership | undefined,
    orderId: string,
    body: PodInput,
  ) {
    const order = await this.loadOrder(orderId);
    const role = await resolveShipmentRole(user, membership, order);
    if (role !== "TRANSPORTER" && role !== "FORWARDER" && role !== "seller" && role !== "admin") {
      throw forbidden("Only the delivering parties capture proof of delivery");
    }
    if (!["OUT_FOR_DELIVERY", "DELIVERED", "DELIVERY_CONFIRMED"].includes(order.status)) {
      throw conflict("Proof of delivery is captured at the delivery stages");
    }
    if (body.photoDocumentId) {
      const doc = await prisma.document.findUnique({ where: { id: body.photoDocumentId } });
      if (!doc || doc.orderId !== orderId) throw badRequest("Photo must be an order document");
    }
    const existing = await prisma.proofOfDelivery.findUnique({ where: { orderId } });
    if (existing) throw conflict("Proof of delivery was already captured for this order");

    const pod = await prisma.proofOfDelivery.create({
      data: {
        orderId,
        signedByName: body.signedByName,
        signatureData: body.signatureData,
        photoDocumentId: body.photoDocumentId,
        note: body.note,
        capturedById: user.id,
      },
    });
    await notify({
      userIds: await shipmentPartyUserIds(order),
      type: "SHIPMENT_STATUS_CHANGE",
      title: `Order ${order.orderNo}: proof of delivery captured`,
      body: `Received by ${body.signedByName}.`,
      href: `/orders/${order.id}`,
      emailContent: genericEventEmail({
        title: `Proof of delivery — order ${order.orderNo}`,
        body: `Delivery was signed for by ${body.signedByName}.`,
        url: `${env.APP_URL}/orders/${order.id}`,
        cta: "View the shipment",
      }),
    });
    return pod;
  }

  // ─── Driver profiles (transporter companies) ───────────────────────────────

  async listDrivers(membership: Membership) {
    if (membership.company.type !== "TRANSPORTER") {
      throw forbidden("Driver profiles belong to transporter companies");
    }
    return prisma.driverProfile.findMany({
      where: { user: { membership: { companyId: membership.companyId } } },
      include: { user: { select: { id: true, name: true, email: true, status: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  async upsertDriver(membership: Membership, body: DriverProfileInput) {
    if (membership.company.type !== "TRANSPORTER") {
      throw forbidden("Driver profiles belong to transporter companies");
    }
    const member = await prisma.companyUserRole.findUnique({ where: { userId: body.userId } });
    if (!member || member.companyId !== membership.companyId) {
      throw badRequest("Drivers must be members of your company — invite them first");
    }
    return prisma.driverProfile.upsert({
      where: { userId: body.userId },
      update: {
        licenceNo: body.licenceNo,
        vehicleReg: body.vehicleReg,
        vehicleType: body.vehicleType,
        coldChainCapable: body.coldChainCapable ?? false,
      },
      create: {
        userId: body.userId,
        licenceNo: body.licenceNo,
        vehicleReg: body.vehicleReg,
        vehicleType: body.vehicleType,
        coldChainCapable: body.coldChainCapable ?? false,
      },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
  }
}
