import { Body, Controller, HttpCode, Param, Patch, Post, Req } from "@nestjs/common";
import {
  idParamSchema,
  type OrderStatusUpdate,
  orderEtaSchema,
  orderStatusUpdateSchema,
  type ShipmentExceptionInput,
  shipmentExceptionSchema,
} from "@pharmachain/core";
import type { FastifyRequest } from "fastify";
import { CurrentUser, OptionalMembership, RequireCompany, setAudit } from "../../common/decorators";
import { zodPipe } from "../../common/pipes/zod.pipe";
import type { AuthUser, Membership } from "../../lib/context";
import { ShipmentService } from "./shipment.service";

@Controller("orders")
export class ShipmentController {
  constructor(private readonly shipmentService: ShipmentService) {}

  @RequireCompany()
  @HttpCode(200)
  @Post(":id/status")
  async updateStatus(
    @CurrentUser() user: AuthUser,
    @OptionalMembership() membership: Membership | undefined,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Body(zodPipe(orderStatusUpdateSchema)) body: OrderStatusUpdate,
    @Req() req: FastifyRequest,
  ) {
    const { updated, correction, previousStatus } = await this.shipmentService.updateStatus(
      user,
      membership,
      params.id,
      body,
    );
    setAudit(req, {
      action: correction ? "order.status-correct" : "order.status-update",
      entityType: "Order",
      entityId: updated.id,
      oldValues: { status: previousStatus },
      newValues: { status: body.status, note: body.note ?? null },
      // US-701 TC4: corrections carry their reason in the dedicated column.
      ...(correction && body.note ? { reason: body.note } : {}),
    });
    return updated;
  }

  /** Phase 2 §4: delay / customs-rejection / failed-delivery annotations. */
  @RequireCompany()
  @HttpCode(201)
  @Post(":id/exceptions")
  async recordException(
    @CurrentUser() user: AuthUser,
    @OptionalMembership() membership: Membership | undefined,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Body(zodPipe(shipmentExceptionSchema)) body: ShipmentExceptionInput,
    @Req() req: FastifyRequest,
  ) {
    const event = await this.shipmentService.recordException(user, membership, params.id, body);
    setAudit(req, {
      action: "order.exception",
      entityType: "Order",
      entityId: params.id,
      newValues: { kind: body.kind, note: body.note },
    });
    return event;
  }

  @RequireCompany()
  @Patch(":id/eta")
  async updateEta(
    @CurrentUser() user: AuthUser,
    @OptionalMembership() membership: Membership | undefined,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Body(zodPipe(orderEtaSchema)) body: { eta: string },
    @Req() req: FastifyRequest,
  ) {
    const { updated, previousEta } = await this.shipmentService.updateEta(
      user,
      membership,
      params.id,
      body.eta,
    );
    setAudit(req, {
      action: "order.eta-update",
      entityType: "Order",
      entityId: updated.id,
      oldValues: { eta: previousEta },
      newValues: { eta: updated.eta },
    });
    return updated;
  }
}
