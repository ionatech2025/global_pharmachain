import { Controller, Get, Param, Query } from "@nestjs/common";
import { idParamSchema, paginate, paginationQuerySchema, skipTake } from "@pharmachain/core";
import type { Prisma } from "@pharmachain/db";
import { prisma } from "@pharmachain/db";
import { z } from "zod";
import {
  CurrentMembership,
  CurrentUser,
  OptionalMembership,
  RequirePermission,
} from "../../common/decorators";
import { notFound } from "../../common/errors";
import { zodPipe } from "../../common/pipes/zod.pipe";
import type { AuthUser, Membership } from "../../lib/context";
import { DocumentService } from "../document/document.service";

const orderListQuerySchema = paginationQuerySchema.extend({
  role: z.enum(["buyer", "seller"]).optional(),
});
type OrderListQuery = z.infer<typeof orderListQuerySchema>;

@Controller("orders")
export class OrderController {
  constructor(private readonly documentService: DocumentService) {}

  @RequirePermission("order:read")
  @Get()
  async list(
    @CurrentMembership() membership: Membership,
    @Query(zodPipe(orderListQuerySchema)) query: OrderListQuery,
  ) {
    const where: Prisma.OrderWhereInput =
      query.role === "buyer"
        ? { buyerCompanyId: membership.companyId }
        : query.role === "seller"
          ? { sellerCompanyId: membership.companyId }
          : {
              OR: [
                { buyerCompanyId: membership.companyId },
                { sellerCompanyId: membership.companyId },
              ],
            };
    const [items, total] = await prisma.$transaction([
      prisma.order.findMany({
        where,
        include: {
          buyerCompany: { select: { id: true, name: true } },
          sellerCompany: { select: { id: true, name: true } },
          rfq: { select: { refNo: true } },
        },
        orderBy: { createdAt: "desc" },
        ...skipTake(query),
      }),
      prisma.order.count({ where }),
    ]);
    return paginate(items, total, query);
  }

  @Get(":id")
  async getById(
    @CurrentUser() user: AuthUser,
    @OptionalMembership() membership: Membership | undefined,
    @Param(zodPipe(idParamSchema)) params: { id: string },
  ) {
    const order = await prisma.order.findUnique({
      where: { id: params.id },
      include: {
        buyerCompany: { select: { id: true, name: true, country: true } },
        sellerCompany: { select: { id: true, name: true, country: true } },
        rfq: { select: { id: true, refNo: true, title: true } },
        quotation: { select: { id: true, refNo: true, leadTimeDays: true, validUntil: true } },
        statusEvents: {
          include: { actor: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
        },
        thread: { select: { id: true } },
      },
    });
    if (!order) throw notFound("Order not found");
    const isParty =
      membership !== undefined &&
      (order.buyerCompanyId === membership.companyId ||
        order.sellerCompanyId === membership.companyId);
    if (!isParty && !user.isSuperAdmin) throw notFound("Order not found");
    return {
      ...order,
      viewerIsSeller: membership?.companyId === order.sellerCompanyId,
      viewerIsBuyer: membership?.companyId === order.buyerCompanyId,
    };
  }

  /** Order document space (US-501/502). */
  @RequirePermission("document:read")
  @Get(":id/documents")
  documents(
    @CurrentMembership() membership: Membership,
    @Param(zodPipe(idParamSchema)) params: { id: string },
  ) {
    return this.documentService.listOrderDocuments(membership, params.id);
  }
}
