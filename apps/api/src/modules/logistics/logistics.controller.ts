import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import {
  type AppointmentInput,
  appointmentRoleParamSchema,
  appointmentSchema,
  type DriverProfileInput,
  driverProfileSchema,
  idParamSchema,
  LOGISTICS_ROLES,
  type LocationPingInput,
  type LogisticsRole,
  locationPingSchema,
  type PodInput,
  paginationQuerySchema,
  podSchema,
  type ShipmentMetaInput,
  shipmentMetaSchema,
} from "@pharmachain/core";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import {
  CurrentMembership,
  CurrentUser,
  OptionalMembership,
  RequireCompany,
  setAudit,
} from "../../common/decorators";
import { zodPipe } from "../../common/pipes/zod.pipe";
import type { AuthUser, Membership } from "../../lib/context";
import { LogisticsService } from "./logistics.service";

const roleQuerySchema = z.object({ role: z.enum(LOGISTICS_ROLES) });

@Controller()
export class LogisticsController {
  constructor(private readonly logisticsService: LogisticsService) {}

  /** Verified companies a buyer can appoint for a role. */
  @RequireCompany()
  @Get("logistics/companies")
  listCompanies(@Query(zodPipe(roleQuerySchema)) query: { role: LogisticsRole }) {
    return this.logisticsService.listAppointableCompanies(query.role);
  }

  /** Shipments this logistics company is appointed on. */
  @RequireCompany()
  @Get("shipments")
  listShipments(
    @CurrentMembership() membership: Membership,
    @Query(zodPipe(paginationQuerySchema)) query: { page: number; pageSize: number },
  ) {
    return this.logisticsService.listAppointedShipments(membership, query.page, query.pageSize);
  }

  @RequireCompany()
  @HttpCode(201)
  @Post("orders/:id/appointments")
  async appoint(
    @CurrentUser() user: AuthUser,
    @CurrentMembership() membership: Membership,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Body(zodPipe(appointmentSchema)) body: AppointmentInput,
    @Req() req: FastifyRequest,
  ) {
    const appointment = await this.logisticsService.appoint(user, membership, params.id, body);
    setAudit(req, {
      action: "order.appoint",
      entityType: "Order",
      entityId: params.id,
      newValues: { role: body.role, companyId: body.companyId },
    });
    return appointment;
  }

  @RequireCompany()
  @HttpCode(200)
  @Delete("orders/:id/appointments/:role")
  async revoke(
    @CurrentMembership() membership: Membership,
    @Param(zodPipe(appointmentRoleParamSchema)) params: { id: string; role: LogisticsRole },
    @Req() req: FastifyRequest,
  ) {
    const result = await this.logisticsService.revoke(membership, params.id, params.role);
    setAudit(req, {
      action: "order.appointment-revoke",
      entityType: "Order",
      entityId: params.id,
      newValues: { role: params.role },
    });
    return result;
  }

  @RequireCompany()
  @Patch("orders/:id/shipment")
  async updateMeta(
    @CurrentUser() user: AuthUser,
    @OptionalMembership() membership: Membership | undefined,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Body(zodPipe(shipmentMetaSchema)) body: ShipmentMetaInput,
    @Req() req: FastifyRequest,
  ) {
    const { updated, previous } = await this.logisticsService.updateShipmentMeta(
      user,
      membership,
      params.id,
      body,
    );
    setAudit(req, {
      action: "order.shipment-meta",
      entityType: "Order",
      entityId: params.id,
      oldValues: previous,
      newValues: body,
    });
    return updated;
  }

  @RequireCompany()
  @HttpCode(201)
  @Post("orders/:id/locations")
  recordLocation(
    @CurrentUser() user: AuthUser,
    @OptionalMembership() membership: Membership | undefined,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Body(zodPipe(locationPingSchema)) body: LocationPingInput,
  ) {
    return this.logisticsService.recordLocation(user, membership, params.id, body);
  }

  @Get("orders/:id/locations")
  listLocations(
    @CurrentUser() user: AuthUser,
    @OptionalMembership() membership: Membership | undefined,
    @Param(zodPipe(idParamSchema)) params: { id: string },
  ) {
    return this.logisticsService.listLocations(user, membership, params.id);
  }

  @RequireCompany()
  @HttpCode(201)
  @Post("orders/:id/pod")
  async capturePod(
    @CurrentUser() user: AuthUser,
    @OptionalMembership() membership: Membership | undefined,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Body(zodPipe(podSchema)) body: PodInput,
    @Req() req: FastifyRequest,
  ) {
    const pod = await this.logisticsService.capturePod(user, membership, params.id, body);
    setAudit(req, {
      action: "order.pod-capture",
      entityType: "Order",
      entityId: params.id,
      newValues: { signedByName: body.signedByName, photoDocumentId: body.photoDocumentId ?? null },
    });
    return pod;
  }

  // ─── Driver profiles ───────────────────────────────────────────────────────

  @RequireCompany()
  @Get("logistics/drivers")
  listDrivers(@CurrentMembership() membership: Membership) {
    return this.logisticsService.listDrivers(membership);
  }

  @RequireCompany()
  @HttpCode(200)
  @Post("logistics/drivers")
  async upsertDriver(
    @CurrentMembership() membership: Membership,
    @Body(zodPipe(driverProfileSchema)) body: DriverProfileInput,
    @Req() req: FastifyRequest,
  ) {
    const driver = await this.logisticsService.upsertDriver(membership, body);
    setAudit(req, {
      action: "logistics.driver-upsert",
      entityType: "DriverProfile",
      entityId: driver.id,
      newValues: { userId: body.userId, vehicleReg: body.vehicleReg },
    });
    return driver;
  }
}
