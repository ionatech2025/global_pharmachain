import { Controller, Get, Param, Query, Res } from "@nestjs/common";
import { idParamSchema, renderCsv, renderPdf } from "@pharmachain/core";
import type { FastifyReply } from "fastify";
import QRCode from "qrcode";
import { z } from "zod";
import {
  CurrentMembership,
  CurrentUser,
  OptionalMembership,
  Public,
  RequireCompany,
} from "../../common/decorators";
import { zodPipe } from "../../common/pipes/zod.pipe";
import type { AuthUser, Membership } from "../../lib/context";
import { IntelligenceService } from "./intelligence.service";
import { TraceService } from "./trace.service";

const categoryQuerySchema = z.object({ categoryId: z.uuid().optional() });
const formatQuerySchema = z.object({ format: z.enum(["json", "csv", "pdf"]).default("json") });
const publicVerifySchema = z.object({
  orderNo: z.string().min(4).max(40),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
});

@Controller()
export class IntelligenceController {
  constructor(
    private readonly intelligenceService: IntelligenceService,
    private readonly traceService: TraceService,
  ) {}

  // ─── Predictive analytics (Phase 5 §1) ─────────────────────────────────────

  @RequireCompany()
  @Get("intelligence/demand")
  demand(@Query(zodPipe(categoryQuerySchema)) query: { categoryId?: string }) {
    return this.intelligenceService.demandForecast(query.categoryId);
  }

  @RequireCompany()
  @Get("intelligence/prices")
  prices(@Query(zodPipe(categoryQuerySchema)) query: { categoryId?: string }) {
    return this.intelligenceService.priceTrends(query.categoryId);
  }

  @RequireCompany()
  @Get("intelligence/delay-risk")
  delayRisk(@CurrentMembership() membership: Membership) {
    return this.intelligenceService.delayRisk(membership);
  }

  @RequireCompany()
  @Get("intelligence/stockout-risk")
  stockoutRisk(@CurrentMembership() membership: Membership) {
    return this.intelligenceService.stockoutRisk(membership);
  }

  @RequireCompany()
  @Get("intelligence/supplier-recommendations")
  recommendations(@Query(zodPipe(categoryQuerySchema)) query: { categoryId?: string }) {
    return this.intelligenceService.supplierRecommendations(query.categoryId);
  }

  /** Sellable anonymised market data product — subscription-gated. */
  @Get("intelligence/market-report")
  async marketReport(
    @CurrentUser() user: AuthUser,
    @OptionalMembership() membership: Membership | undefined,
    @Query(zodPipe(formatQuerySchema)) query: { format: "json" | "csv" | "pdf" },
    @Res({ passthrough: false }) res: FastifyReply,
  ) {
    const report = await this.intelligenceService.marketReport(membership, user.isSuperAdmin);
    if (query.format === "json") return res.send(report);
    const table = this.intelligenceService.marketReportTable(report);
    if (query.format === "csv") {
      res.header("content-type", "text/csv; charset=utf-8");
      res.header("content-disposition", 'attachment; filename="market-intelligence.csv"');
      return res.send(renderCsv(table));
    }
    res.header("content-type", "application/pdf");
    res.header("content-disposition", 'attachment; filename="market-intelligence.pdf"');
    return res.send(Buffer.from(renderPdf(table)));
  }

  // ─── Traceability (Phase 5 §2) ─────────────────────────────────────────────

  @Get("orders/:id/trace")
  trace(
    @CurrentUser() user: AuthUser,
    @OptionalMembership() membership: Membership | undefined,
    @Param(zodPipe(idParamSchema)) params: { id: string },
  ) {
    return this.traceService.chainFor(user, membership, params.id);
  }

  @Get("orders/:id/trace/report")
  async traceReport(
    @CurrentUser() user: AuthUser,
    @OptionalMembership() membership: Membership | undefined,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Res({ passthrough: false }) res: FastifyReply,
  ) {
    const data = await this.traceService.chainFor(user, membership, params.id);
    const table = this.traceService.reportTable(data);
    // QR → public /verify prefilled with this chain's head hash: scanning the
    // paperwork replaces typing 64 hex characters (review UX finding).
    const headHash = String(data.verification.headHash);
    if (/^[0-9a-f]{64}$/.test(headHash)) {
      const verifyUrl = `${process.env.APP_URL ?? "https://pharmachain-seven.vercel.app"}/verify?orderNo=${encodeURIComponent(data.orderNo)}&hash=${headHash}`;
      const code = QRCode.create(verifyUrl, { errorCorrectionLevel: "M" });
      const size = code.modules.size;
      const modules: boolean[][] = [];
      for (let r = 0; r < size; r += 1) {
        const row: boolean[] = [];
        for (let c = 0; c < size; c += 1) row.push(Boolean(code.modules.get(r, c)));
        modules.push(row);
      }
      table.qr = { modules, caption: "Scan to verify authenticity" };
    }
    res.header("content-type", "application/pdf");
    res.header("content-disposition", `attachment; filename="trace-${data.orderNo}.pdf"`);
    return res.send(Buffer.from(renderPdf(table)));
  }

  /** Public anti-counterfeit verification — rate-limited, reveals stage+time
   *  only. The foundation for regulator portal integrations. */
  @Public()
  @Get("trace/verify")
  publicVerify(@Query(zodPipe(publicVerifySchema)) query: { orderNo: string; hash: string }) {
    return this.traceService.publicVerify(query.orderNo, query.hash);
  }

  /** Platform-wide chain coverage (target ≥95%). */
  @Get("admin/trace/coverage")
  coverage(@CurrentUser() user: AuthUser) {
    if (!user.isSuperAdmin) return { orders: 0, intactChains: 0, coveragePct: 0 };
    return this.traceService.coverage();
  }
}
