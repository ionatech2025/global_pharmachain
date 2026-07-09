import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from "@nestjs/common";
import {
  type BomCreate,
  type BomEdit,
  bomCreateSchema,
  bomEditSchema,
  idParamSchema,
} from "@pharmachain/core";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import {
  CurrentMembership,
  CurrentUser,
  RequirePermission,
  setAudit,
} from "../../common/decorators";
import { zodPipe } from "../../common/pipes/zod.pipe";
import type { AuthUser, Membership } from "../../lib/context";
import type { BomService } from "./bom.service";

const byProductQuerySchema = z.object({ productListingId: z.uuid() });

@Controller("boms")
export class BomController {
  constructor(private readonly bomService: BomService) {}

  @RequirePermission("bom:read")
  @Get()
  listForProduct(
    @CurrentMembership() membership: Membership,
    @Query(zodPipe(byProductQuerySchema)) query: { productListingId: string },
  ) {
    return this.bomService.listForProduct(membership, query.productListingId);
  }

  @RequirePermission("bom:write")
  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @CurrentMembership() membership: Membership,
    @Body(zodPipe(bomCreateSchema)) body: BomCreate,
    @Req() req: FastifyRequest,
  ) {
    const bom = await this.bomService.create(user, membership, body);
    setAudit(req, {
      action: "bom.create",
      entityType: "Bom",
      entityId: bom.id,
      newValues: { version: bom.version, items: body.items.length },
    });
    return bom;
  }

  @RequirePermission("bom:read")
  @Get(":id")
  getById(
    @CurrentMembership() membership: Membership,
    @Param(zodPipe(idParamSchema)) params: { id: string },
  ) {
    return this.bomService.getById(membership, params.id);
  }

  @RequirePermission("bom:write")
  @Post(":id/new-version")
  async newVersion(
    @CurrentUser() user: AuthUser,
    @CurrentMembership() membership: Membership,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Body(zodPipe(bomEditSchema)) body: BomEdit,
    @Req() req: FastifyRequest,
  ) {
    const { bom, fromVersion } = await this.bomService.newVersion(
      user,
      membership,
      params.id,
      body,
    );
    setAudit(req, {
      action: "bom.new-version",
      entityType: "Bom",
      entityId: bom.id,
      oldValues: { fromVersion },
      newValues: { version: bom.version },
    });
    return bom;
  }

  @RequirePermission("bom:write")
  @HttpCode(200)
  @Post(":id/activate")
  async activate(
    @CurrentMembership() membership: Membership,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Req() req: FastifyRequest,
  ) {
    const bom = await this.bomService.activate(membership, params.id);
    setAudit(req, {
      action: "bom.activate",
      entityType: "Bom",
      entityId: bom.id,
      newValues: { version: bom.version },
    });
    return bom;
  }
}
