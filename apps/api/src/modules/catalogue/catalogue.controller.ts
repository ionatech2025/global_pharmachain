import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from "@nestjs/common";
import {
  type CatalogueSearch,
  catalogueSearchSchema,
  idParamSchema,
  type ListingCreate,
  type ListingUpdate,
  listingCreateSchema,
  listingUpdateSchema,
} from "@pharmachain/core";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import {
  CurrentMembership,
  CurrentUser,
  OptionalMembership,
  RequirePermission,
  setAudit,
} from "../../common/decorators";
import { zodPipe } from "../../common/pipes/zod.pipe";
import type { AuthUser, Membership } from "../../lib/context";
import type { CatalogueService } from "./catalogue.service";

const myListingsQuerySchema = z.object({
  status: z.enum(["DRAFT", "PUBLISHED", "DEACTIVATED"]).optional(),
  kind: z.enum(["RAW_MATERIAL", "FINISHED_PRODUCT"]).optional(),
});
type MyListingsQuery = z.infer<typeof myListingsQuerySchema>;

@Controller("catalogue")
export class CatalogueController {
  constructor(private readonly catalogueService: CatalogueService) {}

  @Get("search")
  search(@Query(zodPipe(catalogueSearchSchema)) query: CatalogueSearch) {
    return this.catalogueService.search(query);
  }

  @Get("categories")
  categories() {
    return this.catalogueService.listCategories();
  }

  @Get("exchange-rates")
  exchangeRates() {
    return this.catalogueService.listExchangeRates();
  }

  @RequirePermission("catalogue:read")
  @Get()
  listMine(
    @CurrentMembership() membership: Membership,
    @Query(zodPipe(myListingsQuerySchema)) query: MyListingsQuery,
  ) {
    return this.catalogueService.listMine(membership, query);
  }

  @RequirePermission("catalogue:write")
  @Post()
  async create(
    @CurrentMembership() membership: Membership,
    @Body(zodPipe(listingCreateSchema)) body: ListingCreate,
    @Req() req: FastifyRequest,
  ) {
    const listing = await this.catalogueService.create(membership, body);
    setAudit(req, {
      action: "listing.create",
      entityType: "Listing",
      entityId: listing.id,
      newValues: { name: listing.name, kind: listing.kind },
    });
    return listing;
  }

  @Get(":id")
  getById(
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @OptionalMembership() membership: Membership | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.catalogueService.getById(params.id, membership, user.isSuperAdmin);
  }

  @RequirePermission("catalogue:write")
  @Patch(":id")
  async update(
    @CurrentMembership() membership: Membership,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Body(zodPipe(listingUpdateSchema)) body: ListingUpdate,
    @Req() req: FastifyRequest,
  ) {
    const { updated, oldValues } = await this.catalogueService.update(membership, params.id, body);
    // Edit history retained for audit (US-306)
    setAudit(req, {
      action: "listing.update",
      entityType: "Listing",
      entityId: updated.id,
      oldValues,
      newValues: body,
    });
    return updated;
  }

  @RequirePermission("catalogue:write")
  @HttpCode(200)
  @Post(":id/publish")
  async publish(
    @CurrentMembership() membership: Membership,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Req() req: FastifyRequest,
  ) {
    const listing = await this.catalogueService.publish(membership, params.id);
    setAudit(req, { action: "listing.publish", entityType: "Listing", entityId: listing.id });
    return listing;
  }

  @RequirePermission("catalogue:write")
  @HttpCode(200)
  @Post(":id/deactivate")
  async deactivate(
    @CurrentMembership() membership: Membership,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Req() req: FastifyRequest,
  ) {
    const listing = await this.catalogueService.setActive(membership, params.id, false);
    setAudit(req, { action: "listing.deactivate", entityType: "Listing", entityId: listing.id });
    return listing;
  }

  @RequirePermission("catalogue:write")
  @HttpCode(200)
  @Post(":id/reactivate")
  async reactivate(
    @CurrentMembership() membership: Membership,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Req() req: FastifyRequest,
  ) {
    const listing = await this.catalogueService.setActive(membership, params.id, true);
    setAudit(req, { action: "listing.reactivate", entityType: "Listing", entityId: listing.id });
    return listing;
  }
}
