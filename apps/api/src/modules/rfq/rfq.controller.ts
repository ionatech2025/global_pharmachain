import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, Sse } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  COMPANY_TYPES,
  type CompanyType,
  idParamSchema,
  optionalFilter,
  type PaginationQuery,
  paginationQuerySchema,
  type QuotationSubmit,
  quotationSubmitSchema,
  type RfqAmend,
  type RfqCreate,
  rfqAmendSchema,
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
import { changeFeed } from "../../lib/change-feed";
import type { AuthUser, Membership } from "../../lib/context";
import { RfqService } from "./rfq.service";

const quotationSortSchema = z.object({
  sort: z.enum(["price", "leadTime"]).default("price"),
  direction: z.enum(["asc", "desc"]).default("asc"),
});
type QuotationSort = z.infer<typeof quotationSortSchema>;

const reachQuerySchema = z.object({
  targetCompanyType: z.enum(COMPANY_TYPES),
  categoryId: optionalFilter(z.uuid()),
});

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

  /** Who would see an RFQ with these choices — asked by the form as the buyer picks. */
  @RequirePermission("rfq:write")
  @RequireVerified()
  @Get("reach")
  reach(
    @CurrentMembership() membership: Membership,
    @Query(zodPipe(reachQuerySchema))
    query: { targetCompanyType: CompanyType; categoryId?: string },
  ) {
    return this.rfqService.reach(membership, query.targetCompanyType, query.categoryId);
  }

  @RequirePermission("rfq:write")
  @RequireVerified()
  // Business-record creation rides the generic 300/60s default everywhere
  // else in this file/module — tightened here since it's the one endpoint
  // that mints a new RFQ, not just reads or transitions an existing one.
  @Throttle({ default: { limit: 20, ttl: 10 * 60 * 1000 } })
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

  /** Live inbox (SSE): an event whenever an RFQ arrives for this company,
   *  changes, or passes its deadline. See changeFeed. */
  @RequirePermission("quotation:read")
  @RequireVerified()
  @Sse("inbox/stream")
  async inboxStream(@CurrentMembership() membership: Membership, @Req() req: FastifyRequest) {
    const fingerprint = await this.rfqService.inboxFingerprintFor(membership);
    return changeFeed(fingerprint, lastEventId(req));
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

  @RequirePermission("rfq:write")
  @HttpCode(200)
  @Post(":id/amend")
  async amend(
    @CurrentUser() user: AuthUser,
    @CurrentMembership() membership: Membership,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Body(zodPipe(rfqAmendSchema)) body: RfqAmend,
    @Req() req: FastifyRequest,
  ) {
    const { amendment, recipients } = await this.rfqService.amendRfq(
      user,
      membership,
      params.id,
      body,
    );
    setAudit(req, {
      action: "rfq.amend",
      entityType: "Rfq",
      entityId: params.id,
      oldValues: { deadline: amendment.previousDeadline.toISOString() },
      newValues: { deadline: amendment.newDeadline.toISOString(), recipients },
      reason: body.note,
    });
    return { amendment, recipients };
  }

  /** Live RFQ page (SSE). Access is asserted before the stream opens (the same
   *  rule as reading the RFQ); afterwards it only ever says "something changed". */
  @Sse(":id/stream")
  async stream(
    @CurrentUser() user: AuthUser,
    @OptionalMembership() membership: Membership | undefined,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Req() req: FastifyRequest,
  ) {
    const rfq = await this.rfqService.getRfq(user, membership, params.id);
    const viewer = { companyId: membership?.companyId ?? null, isBuyer: rfq.viewerIsBuyer };
    return changeFeed(() => this.rfqService.rfqFingerprint(params.id, viewer), lastEventId(req));
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
  @Throttle({ default: { limit: 30, ttl: 10 * 60 * 1000 } })
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
  @Throttle({ default: { limit: 30, ttl: 10 * 60 * 1000 } })
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
  // Also creates an Order — the highest-value write in this controller.
  // The web client already guards its own accept button against
  // double-submission; this is defense in depth against a direct API call.
  @Throttle({ default: { limit: 20, ttl: 10 * 60 * 1000 } })
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

function lastEventId(req: FastifyRequest): string | undefined {
  const value = req.headers["last-event-id"];
  return typeof value === "string" && value.length > 0 && value.length <= 200 ? value : undefined;
}
