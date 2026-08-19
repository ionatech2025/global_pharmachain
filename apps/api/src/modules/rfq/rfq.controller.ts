import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from "@nestjs/common";
import {
  idParamSchema,
  type PaginationQuery,
  paginationQuerySchema,
  type QuotationSubmit,
  quotationSubmitSchema,
  type RfqCreate,
  rfqCreateSchema,
} from "@pharmachain/core";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import {
  CurrentMembership,
  CurrentUser,
  OptionalMembership,
  RequirePermission,
  RequireVerified,
  setAudit,
} from "../../common/decorators";
import { zodPipe } from "../../common/pipes/zod.pipe";
import type { AuthUser, Membership } from "../../lib/context";
import { RfqService } from "./rfq.service";

const quotationSortSchema = z.object({
  sort: z.enum(["price", "leadTime"]).default("price"),
  direction: z.enum(["asc", "desc"]).default("asc"),
});
type QuotationSort = z.infer<typeof quotationSortSchema>;

@Controller("rfqs")
export class RfqController {
  constructor(private readonly rfqService: RfqService) {}

  @RequirePermission("rfq:read")
  @Get()
  listMine(
    @CurrentMembership() membership: Membership,
    @Query(zodPipe(paginationQuerySchema)) query: PaginationQuery,
  ) {
    return this.rfqService.listMine(membership, query);
  }

  @RequirePermission("rfq:write")
  @RequireVerified()
  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @CurrentMembership() membership: Membership,
    @Body(zodPipe(rfqCreateSchema)) body: RfqCreate,
    @Req() req: FastifyRequest,
  ) {
    const rfq = await this.rfqService.createRfq(user, membership, body);
    setAudit(req, {
      action: "rfq.create",
      entityType: "Rfq",
      entityId: rfq.id,
      newValues: { refNo: rfq.refNo, title: rfq.title },
    });
    return rfq;
  }

  @RequirePermission("quotation:read")
  @RequireVerified()
  @Get("inbox")
  inbox(
    @CurrentMembership() membership: Membership,
    @Query(zodPipe(paginationQuerySchema)) query: PaginationQuery,
  ) {
    return this.rfqService.inbox(membership, query);
  }

  @Get(":id")
  getById(
    @CurrentUser() user: AuthUser,
    @OptionalMembership() membership: Membership | undefined,
    @Param(zodPipe(idParamSchema)) params: { id: string },
  ) {
    return this.rfqService.getRfq(user, membership, params.id);
  }

  @RequirePermission("rfq:write")
  @HttpCode(200)
  @Post(":id/cancel")
  async cancel(
    @CurrentUser() user: AuthUser,
    @CurrentMembership() membership: Membership,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Req() req: FastifyRequest,
  ) {
    const rfq = await this.rfqService.cancelRfq(user, membership, params.id);
    setAudit(req, {
      action: "rfq.cancel",
      entityType: "Rfq",
      entityId: rfq.id,
      oldValues: { status: "OPEN" },
      newValues: { status: rfq.status },
    });
    return rfq;
  }

  @RequirePermission("quotation:read")
  @Get(":id/quotations")
  listQuotations(
    @CurrentMembership() membership: Membership,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Query(zodPipe(quotationSortSchema)) query: QuotationSort,
  ) {
    return this.rfqService.listQuotationsForBuyer(
      membership,
      params.id,
      query.sort,
      query.direction,
    );
  }

  @RequirePermission("quotation:write")
  @RequireVerified()
  @Post(":id/quotations")
  async submitQuotation(
    @CurrentUser() user: AuthUser,
    @CurrentMembership() membership: Membership,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Body(zodPipe(quotationSubmitSchema)) body: QuotationSubmit,
    @Req() req: FastifyRequest,
  ) {
    const quotation = await this.rfqService.submitQuotation(user, membership, params.id, body);
    setAudit(req, {
      action: "quotation.submit",
      entityType: "Quotation",
      entityId: quotation.id,
      newValues: { refNo: quotation.refNo, rfqId: quotation.rfqId },
    });
    return quotation;
  }
}

@Controller("quotations")
export class QuotationController {
  constructor(private readonly rfqService: RfqService) {}

  /** Quotations this company has sent (any status but SUPERSEDED). */
  @RequirePermission("quotation:read")
  @Get("mine")
  listMine(
    @CurrentMembership() membership: Membership,
    @Query(zodPipe(paginationQuerySchema)) query: PaginationQuery,
  ) {
    return this.rfqService.myQuotations(membership, query);
  }

  @RequirePermission("quotation:write")
  @RequireVerified()
  @Post(":id/resubmit")
  async resubmit(
    @CurrentUser() user: AuthUser,
    @CurrentMembership() membership: Membership,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Body(zodPipe(quotationSubmitSchema)) body: QuotationSubmit,
    @Req() req: FastifyRequest,
  ) {
    const quotation = await this.rfqService.resubmitQuotation(user, membership, params.id, body);
    setAudit(req, {
      action: "quotation.resubmit",
      entityType: "Quotation",
      entityId: quotation.id,
      newValues: { version: quotation.version },
    });
    return quotation;
  }

  @RequirePermission("quotation:write")
  @HttpCode(200)
  @Post(":id/withdraw")
  async withdraw(
    @CurrentMembership() membership: Membership,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Req() req: FastifyRequest,
  ) {
    const quotation = await this.rfqService.withdrawQuotation(membership, params.id);
    setAudit(req, {
      action: "quotation.withdraw",
      entityType: "Quotation",
      entityId: quotation.id,
    });
    return quotation;
  }

  @RequirePermission("rfq:write")
  @Post(":id/accept")
  async accept(
    @CurrentUser() user: AuthUser,
    @CurrentMembership() membership: Membership,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Req() req: FastifyRequest,
  ) {
    const order = await this.rfqService.acceptQuotation(user, membership, params.id);
    setAudit(req, {
      action: "quotation.accept",
      entityType: "Order",
      entityId: order.id,
      newValues: { orderNo: order.orderNo, quotationId: order.quotationId },
    });
    return order;
  }
}
