import { Body, Controller, HttpCode, Param, Patch, Post, Req } from "@nestjs/common";
import {
  idParamSchema,
  type OrderStatusUpdate,
  orderEtaSchema,
  orderStatusUpdateSchema,
} from "@pharmachain/core";
import type { FastifyRequest } from "fastify";
import { CurrentUser, OptionalMembership, RequireCompany, setAudit } from "../../common/decorators";
import { zodPipe } from "../../common/pipes/zod.pipe";
import type { AuthUser, Membership } from "../../lib/context";
import type { ShipmentService } from "./shipment.service";

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
    });
    return updated;
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
