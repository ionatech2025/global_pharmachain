import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import {
  currencyPreferenceSchema,
  type InvoiceCreateInput,
  idParamSchema,
  invoiceCreateSchema,
  type KycRiskLevel,
  kycReviewSchema,
  type PaymentCreateInput,
  type PdfTable,
  paymentConfirmSchema,
  paymentCreateSchema,
  type ReportQuery,
  renderCsv,
  renderExcelXml,
  renderPdf,
  reportQuerySchema,
  type ScheduledReportInput,
  scheduledReportSchema,
  type TaxRuleInput,
  taxRuleSchema,
} from "@pharmachain/core";
import { prisma } from "@pharmachain/db";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  CurrentMembership,
  CurrentUser,
  OptionalMembership,
  Public,
  RequirePermission,
  SuperAdminOnly,
  setAudit,
} from "../../common/decorators";
import { notFound } from "../../common/errors";
import { zodPipe } from "../../common/pipes/zod.pipe";
import type { AuthUser, Membership } from "../../lib/context";
import { FinanceService } from "./finance.service";

function sendExport(res: FastifyReply, table: PdfTable, format: string, baseName: string) {
  if (format === "csv") {
    res.header("content-type", "text/csv; charset=utf-8");
    res.header("content-disposition", `attachment; filename="${baseName}.csv"`);
    return res.send(renderCsv(table));
  }
  if (format === "xls") {
    res.header("content-type", "application/vnd.ms-excel");
    res.header("content-disposition", `attachment; filename="${baseName}.xls"`);
    return res.send(renderExcelXml(table));
  }
  res.header("content-type", "application/pdf");
  res.header("content-disposition", `attachment; filename="${baseName}.pdf"`);
  return res.send(Buffer.from(renderPdf(table)));
}

@Controller()
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  // ─── Payments ──────────────────────────────────────────────────────────────

  @RequirePermission("finance:manage")
  @HttpCode(201)
  @Post("orders/:id/payments")
  async createPayment(
    @CurrentUser() user: AuthUser,
    @CurrentMembership() membership: Membership,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Body(zodPipe(paymentCreateSchema)) body: PaymentCreateInput,
    @Req() req: FastifyRequest,
  ) {
    const result = await this.financeService.createPayment(user, membership, params.id, body);
    setAudit(req, {
      action: "payment.initiate",
      entityType: "Payment",
      entityId: result.payment.id,
      newValues: { orderId: params.id, amount: body.amount, method: body.method },
    });
    return result;
  }

  @RequirePermission("finance:read")
  @Get("orders/:id/payments")
  listOrderPayments(
    @CurrentMembership() membership: Membership,
    @Param(zodPipe(idParamSchema)) params: { id: string },
  ) {
    return this.financeService.listOrderPayments(membership, params.id);
  }

  @RequirePermission("finance:manage")
  @HttpCode(200)
  @Post("payments/:id/confirm")
  async confirmPayment(
    @CurrentUser() user: AuthUser,
    @OptionalMembership() membership: Membership | undefined,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Body(zodPipe(paymentConfirmSchema)) body: { note?: string },
    @Req() req: FastifyRequest,
  ) {
    const payment = await this.financeService.confirmPayment(
      user,
      membership,
      params.id,
      body.note,
    );
    setAudit(req, { action: "payment.confirm", entityType: "Payment", entityId: payment.id });
    return payment;
  }

  @RequirePermission("finance:manage")
  @HttpCode(200)
  @Post("payments/:id/fail")
  async failPayment(
    @CurrentUser() user: AuthUser,
    @OptionalMembership() membership: Membership | undefined,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Body(zodPipe(z.object({ reason: z.string().min(3).max(300) }))) body: { reason: string },
    @Req() req: FastifyRequest,
  ) {
    const payment = await this.financeService.failPayment(user, membership, params.id, body.reason);
    setAudit(req, {
      action: "payment.fail",
      entityType: "Payment",
      entityId: payment.id,
      reason: body.reason,
    });
    return payment;
  }

  /** Provider webhooks: signature-verified inside the gateway adapter. */
  @Public()
  @HttpCode(200)
  @Post("payments/webhook/:provider")
  async webhook(
    @Param(zodPipe(z.object({ provider: z.string().min(2).max(30) })))
    params: { provider: string },
    @Body() body: Record<string, unknown>,
    @Req() req: FastifyRequest,
  ) {
    // Flutterwave signs via header; mirror it into the payload for the adapter.
    const verifHash = req.headers["verif-hash"];
    const payment = await this.financeService.handleWebhook(params.provider, {
      ...body,
      ...(verifHash ? { _verifHash: verifHash } : {}),
    });
    return { ok: true, status: payment.status };
  }

  // ─── Invoices ──────────────────────────────────────────────────────────────

  @RequirePermission("finance:manage")
  @HttpCode(201)
  @Post("orders/:id/invoice")
  async createInvoice(
    @CurrentUser() user: AuthUser,
    @CurrentMembership() membership: Membership,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Body(zodPipe(invoiceCreateSchema)) body: InvoiceCreateInput,
    @Req() req: FastifyRequest,
  ) {
    const invoice = await this.financeService.createInvoice(user, membership, params.id, body);
    setAudit(req, {
      action: "invoice.issue",
      entityType: "Invoice",
      entityId: invoice.id,
      newValues: { invoiceNo: invoice.invoiceNo, total: String(invoice.total) },
    });
    return invoice;
  }

  @RequirePermission("finance:read")
  @Get("invoices")
  listInvoices(@CurrentMembership() membership: Membership) {
    return this.financeService.listInvoices(membership);
  }

  @RequirePermission("finance:manage")
  @HttpCode(200)
  @Post("invoices/:id/void")
  async voidInvoice(
    @CurrentMembership() membership: Membership,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Req() req: FastifyRequest,
  ) {
    const invoice = await this.financeService.voidInvoice(membership, params.id);
    setAudit(req, { action: "invoice.void", entityType: "Invoice", entityId: invoice.id });
    return invoice;
  }

  // ─── Ledger, reports & exports ─────────────────────────────────────────────

  @RequirePermission("finance:read")
  @Get("finance/ledger")
  ledger(
    @CurrentMembership() membership: Membership,
    @Query(zodPipe(reportQuerySchema)) query: ReportQuery,
  ) {
    return this.financeService.ledger(membership, query);
  }

  @RequirePermission("finance:read")
  @Get("finance/report")
  async companyReport(
    @CurrentMembership() membership: Membership,
    @Query(zodPipe(reportQuerySchema)) query: ReportQuery,
    @Res({ passthrough: false }) res: FastifyReply,
  ) {
    const report = await this.financeService.companyFinanceReport(membership, query);
    if (query.format === "json") return res.send(report);
    const table = this.financeService.companyReportTable(membership.company.name, report);
    return sendExport(res, table, query.format, "finance-report");
  }

  /** Preferred display currency (Phase 3 §3). */
  @Patch("me/currency")
  async setCurrency(
    @CurrentUser() user: AuthUser,
    @Body(zodPipe(currencyPreferenceSchema)) body: { preferredCurrency: string | null },
  ) {
    await prisma.user.update({
      where: { id: user.id },
      data: { preferredCurrency: body.preferredCurrency },
    });
    return { ok: true };
  }

  /** FX table for display conversion — any authenticated user. */
  @Get("fx/rates")
  async fxRates() {
    const rates = await prisma.exchangeRate.findMany({
      orderBy: [{ base: "asc" }, { quote: "asc" }],
    });
    return rates.map((r) => ({
      base: r.base,
      quote: r.quote,
      rate: Number(r.rate),
      source: r.source,
      updatedAt: r.updatedAt,
    }));
  }

  // ─── Scheduled report delivery (Phase 3 §4) ────────────────────────────────

  @RequirePermission("finance:read")
  @Get("finance/schedule")
  async getSchedule(@CurrentUser() user: AuthUser) {
    return prisma.scheduledReport.findMany({ where: { userId: user.id } });
  }

  @RequirePermission("finance:read")
  @HttpCode(200)
  @Post("finance/schedule")
  async setSchedule(
    @CurrentUser() user: AuthUser,
    @Body(zodPipe(scheduledReportSchema)) body: ScheduledReportInput,
  ) {
    return prisma.scheduledReport.upsert({
      where: { userId_report: { userId: user.id, report: body.report } },
      update: { frequency: body.frequency, active: body.active },
      create: {
        userId: user.id,
        report: body.report,
        frequency: body.frequency,
        active: body.active,
      },
    });
  }

  // ─── Platform admin: reports, reconciliation, tax rules, KYC ───────────────

  @SuperAdminOnly()
  @Get("admin/finance/report")
  async platformReport(
    @Query(zodPipe(reportQuerySchema)) query: ReportQuery,
    @Res({ passthrough: false }) res: FastifyReply,
  ) {
    const report = await this.financeService.platformFinanceReport(query);
    if (query.format === "json") return res.send(report);
    return sendExport(
      res,
      this.financeService.platformReportTable(report),
      query.format,
      "platform-finance",
    );
  }

  @SuperAdminOnly()
  @Get("admin/finance/reconciliation")
  reconciliation() {
    return this.financeService.reconciliation();
  }

  @SuperAdminOnly()
  @Get("admin/tax-rules")
  listTaxRules() {
    return prisma.taxRule.findMany({ orderBy: [{ destCountry: "asc" }, { hsPrefix: "asc" }] });
  }

  @SuperAdminOnly()
  @HttpCode(201)
  @Post("admin/tax-rules")
  async createTaxRule(
    @CurrentUser() user: AuthUser,
    @Body(zodPipe(taxRuleSchema)) body: TaxRuleInput,
    @Req() req: FastifyRequest,
  ) {
    const rule = await prisma.taxRule.create({
      data: { ...body, active: body.active ?? true, updatedById: user.id },
    });
    setAudit(req, {
      action: "tax-rule.create",
      entityType: "TaxRule",
      entityId: rule.id,
      newValues: body,
    });
    return rule;
  }

  @SuperAdminOnly()
  @Patch("admin/tax-rules/:id")
  async updateTaxRule(
    @CurrentUser() user: AuthUser,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Body(zodPipe(taxRuleSchema.partial())) body: Partial<TaxRuleInput>,
    @Req() req: FastifyRequest,
  ) {
    const existing = await prisma.taxRule.findUnique({ where: { id: params.id } });
    if (!existing) throw notFound("Tax rule not found");
    const rule = await prisma.taxRule.update({
      where: { id: params.id },
      data: { ...body, updatedById: user.id },
    });
    setAudit(req, {
      action: "tax-rule.update",
      entityType: "TaxRule",
      entityId: rule.id,
      oldValues: {
        dutyRatePct: String(existing.dutyRatePct),
        vatRatePct: String(existing.vatRatePct),
      },
      newValues: body,
    });
    return rule;
  }

  /** AML/KYC review on the company financial profile (Phase 3 §2). */
  @SuperAdminOnly()
  @HttpCode(200)
  @Post("admin/companies/:id/kyc")
  async reviewKyc(
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Body(zodPipe(kycReviewSchema)) body: { riskLevel: KycRiskLevel; note?: string },
    @Req() req: FastifyRequest,
  ) {
    const company = await prisma.company.findUnique({ where: { id: params.id } });
    if (!company) throw notFound("Company not found");
    const updated = await prisma.company.update({
      where: { id: params.id },
      data: { kycRiskLevel: body.riskLevel, kycReviewedAt: new Date() },
    });
    setAudit(req, {
      action: "company.kyc-review",
      entityType: "Company",
      entityId: params.id,
      newValues: { riskLevel: body.riskLevel },
      ...(body.note ? { reason: body.note } : {}),
    });
    return {
      id: updated.id,
      kycRiskLevel: updated.kycRiskLevel,
      kycReviewedAt: updated.kycReviewedAt,
    };
  }
}
