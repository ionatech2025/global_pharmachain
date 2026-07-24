import { Injectable } from "@nestjs/common";
import type { PdfTable } from "@pharmachain/core";
import { backtestMape, forecast, orderStatusIndex } from "@pharmachain/core";
import { prisma } from "@pharmachain/db";
import { forbidden } from "../../common/errors";
import type { Membership } from "../../lib/context";

const DAY = 24 * 60 * 60 * 1000;

function monthKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}

function lastMonths(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i -= 1) {
    out.push(monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
  }
  return out;
}

/**
 * Intelligence engine (Phase 5 §1): transparent statistics over live
 * platform data. Every forecast ships its own backtest accuracy (MAPE over
 * held-out months) — the eval travels with the prediction.
 */
@Injectable()
export class IntelligenceService {
  /** Monthly demand (RFQ quantity) per category, with a 3-month forecast. */
  async demandForecast(categoryId?: string) {
    const months = lastMonths(12);
    const rfqs = await prisma.rfq.findMany({
      where: {
        createdAt: { gte: new Date(Date.now() - 366 * DAY) },
        ...(categoryId ? { categoryId } : {}),
      },
      select: { createdAt: true, quantity: true, category: { select: { name: true } } },
    });
    const byMonth = new Map<string, number>(months.map((m) => [m, 0]));
    for (const rfq of rfqs) {
      const key = monthKey(rfq.createdAt);
      if (byMonth.has(key)) byMonth.set(key, (byMonth.get(key) ?? 0) + Number(rfq.quantity));
    }
    const series = months.map((m) => byMonth.get(m) ?? 0);
    return {
      months,
      series,
      forecast: forecast(series, 3).map((v) => Math.round(v * 100) / 100),
      accuracyMapePct: backtestMape(series, 3),
      sampleSize: rfqs.length,
    };
  }

  /** Monthly average quoted unit price (market price trend). */
  async priceTrends(categoryId?: string) {
    const months = lastMonths(12);
    const quotes = await prisma.quotation.findMany({
      where: {
        createdAt: { gte: new Date(Date.now() - 366 * DAY) },
        status: { not: "SUPERSEDED" },
        ...(categoryId ? { rfq: { categoryId } } : {}),
      },
      select: { createdAt: true, unitPrice: true, currency: true },
    });
    const sums = new Map<string, { total: number; count: number }>();
    for (const q of quotes) {
      const key = monthKey(q.createdAt);
      const bucket = sums.get(key) ?? { total: 0, count: 0 };
      bucket.total += Number(q.unitPrice);
      bucket.count += 1;
      sums.set(key, bucket);
    }
    const series = months.map((m) => {
      const bucket = sums.get(m);
      return bucket ? Math.round((bucket.total / bucket.count) * 100) / 100 : 0;
    });
    const known = series.filter((v) => v > 0);
    const direction =
      known.length >= 2
        ? (known[known.length - 1] as number) > (known[0] as number) * 1.03
          ? "rising"
          : (known[known.length - 1] as number) < (known[0] as number) * 0.97
            ? "falling"
            : "stable"
        : "insufficient data";
    return { months, series, direction, sampleSize: quotes.length };
  }

  /** Delay risk on active shipments from historical stage timing. */
  async delayRisk(membership: Membership) {
    const active = await prisma.order.findMany({
      where: {
        status: { notIn: ["DELIVERED", "DELIVERY_CONFIRMED"] },
        OR: [
          { buyerCompanyId: membership.companyId },
          { sellerCompanyId: membership.companyId },
          { appointments: { some: { companyId: membership.companyId, status: "ACTIVE" } } },
        ],
      },
      select: {
        id: true,
        orderNo: true,
        status: true,
        eta: true,
        createdAt: true,
        freightMode: true,
      },
    });
    // Historical mean time-to-DELIVERED across the platform (per freight mode
    // when known) — the baseline each active shipment is compared against.
    const delivered = await prisma.orderStatusEvent.findMany({
      where: { status: "DELIVERED" },
      include: { order: { select: { createdAt: true, freightMode: true } } },
    });
    const durationsByMode = new Map<string, number[]>();
    for (const e of delivered) {
      const mode = e.order.freightMode ?? "ANY";
      const days = (e.createdAt.getTime() - e.order.createdAt.getTime()) / DAY;
      durationsByMode.set(mode, [...(durationsByMode.get(mode) ?? []), days]);
      durationsByMode.set("ANY", [...(durationsByMode.get("ANY") ?? []), days]);
    }
    const mean = (values: number[] | undefined) =>
      values && values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
    // Statistical honesty (review finding): a baseline built on fewer than
    // MIN_BASELINE_SAMPLES deliveries — or shorter than a day, an artefact
    // of same-day demo corrections — must not raise alarms. Past-ETA stays a
    // hard signal regardless of history.
    const MIN_BASELINE_SAMPLES = 5;
    const MIN_BASELINE_DAYS = 1;

    return active.map((order) => {
      const modeSamples = durationsByMode.get(order.freightMode ?? "ANY") ?? [];
      const anySamples = durationsByMode.get("ANY") ?? [];
      const samples = modeSamples.length >= MIN_BASELINE_SAMPLES ? modeSamples : anySamples;
      const rawBaseline = mean(samples);
      const baseline =
        rawBaseline !== null &&
        samples.length >= MIN_BASELINE_SAMPLES &&
        rawBaseline >= MIN_BASELINE_DAYS
          ? rawBaseline
          : null;
      const elapsedDays = (Date.now() - order.createdAt.getTime()) / DAY;
      const pastEta = order.eta ? Date.now() > order.eta.getTime() : false;
      const ratio = baseline ? elapsedDays / baseline : null;
      const risk = pastEta
        ? "HIGH"
        : ratio !== null && ratio > 1.25
          ? "HIGH"
          : ratio !== null && ratio > 0.9 && orderStatusIndex(order.status) < 10
            ? "MEDIUM"
            : ratio !== null
              ? "LOW"
              : "UNKNOWN";
      return {
        orderId: order.id,
        orderNo: order.orderNo,
        status: order.status,
        elapsedDays: Math.round(elapsedDays * 10) / 10,
        baselineDays: baseline === null ? null : Math.round(baseline * 10) / 10,
        baselineSamples: samples.length,
        pastEta,
        risk,
      };
    });
  }

  /** Materials on active BOMs with no sourcing activity (stockout risk). */
  async stockoutRisk(membership: Membership) {
    const items = await prisma.bomItem.findMany({
      where: { bom: { status: "ACTIVE", productListing: { companyId: membership.companyId } } },
      include: {
        rfqs: { select: { id: true, status: true } },
        bom: { select: { productListing: { select: { name: true } } } },
      },
    });
    return items
      .filter((item) => !item.rfqs.some((r) => r.status === "OPEN" || r.status === "AWARDED"))
      .map((item) => ({
        material: item.materialName,
        product: item.bom.productListing.name,
        quantityPerUnit: String(item.quantityPerUnit),
        unit: item.unit,
        reason: item.rfqs.length === 0 ? "never sourced on-platform" : "no open or awarded RFQ",
      }));
  }

  /** Composite supplier recommendations (Phase 5 §1). */
  async supplierRecommendations(categoryId?: string) {
    const sellers = await prisma.company.findMany({
      where: {
        verificationStatus: "VERIFIED",
        profileStatus: "PUBLISHED",
        type: { in: ["RAW_MATERIAL_MANUFACTURER", "FINISHED_PRODUCT_MANUFACTURER", "SUPPLIER"] },
        listings: {
          some: { status: "PUBLISHED", ...(categoryId ? { categoryId } : {}) },
        },
      },
      select: { id: true, name: true, country: true, trustedBadgeAt: true },
      take: 30,
    });
    const results = [];
    for (const seller of sellers) {
      const [rating, quotes, deliveredOnTime] = await Promise.all([
        prisma.rating.aggregate({
          where: { targetCompanyId: seller.id, status: "PUBLISHED" },
          _avg: { stars: true },
          _count: true,
        }),
        prisma.quotation.findMany({
          where: { supplierCompanyId: seller.id, status: { not: "SUPERSEDED" } },
          select: { status: true },
        }),
        prisma.orderStatusEvent.findMany({
          where: { status: "DELIVERED", order: { sellerCompanyId: seller.id, eta: { not: null } } },
          include: { order: { select: { eta: true } } },
        }),
      ]);
      const won = quotes.filter((q) => q.status === "ACCEPTED").length;
      const winRate = quotes.length ? won / quotes.length : null;
      const onTime = deliveredOnTime.length
        ? deliveredOnTime.filter(
            (e) => e.createdAt.getTime() <= (e.order.eta as Date).getTime() + DAY,
          ).length / deliveredOnTime.length
        : null;
      const stars = rating._count ? (rating._avg.stars ?? 0) / 5 : null;
      const parts = [stars, onTime, winRate].filter((v): v is number => v !== null);
      const score = parts.length
        ? Math.round((parts.reduce((s, v) => s + v, 0) / parts.length) * 1000) / 10
        : null;
      const reasons: string[] = [];
      if (rating._count)
        reasons.push(
          `${(rating._avg.stars ?? 0).toFixed(1)}★ across ${rating._count} verified rating(s)`,
        );
      if (onTime !== null) reasons.push(`${Math.round(onTime * 100)}% on-time deliveries`);
      if (winRate !== null) reasons.push(`${Math.round(winRate * 100)}% quotation win rate`);
      if (seller.trustedBadgeAt) reasons.push("Trusted Supplier badge");
      results.push({ ...seller, score, reasons });
    }
    return results.sort((a, b) => (b.score ?? -1) - (a.score ?? -1)).slice(0, 10);
  }

  /** Anonymised market data product (Phase 5 §1): gated on an active
   *  data-insights subscription (or platform admin). */
  async marketReport(membership: Membership | undefined, isSuperAdmin: boolean) {
    const subscribed =
      isSuperAdmin ||
      (membership &&
        (await prisma.company.findFirst({
          where: { id: membership.companyId, insightsUntil: { gt: new Date() } },
          select: { id: true },
        })) !== null);
    if (!subscribed) {
      throw forbidden(
        "Market data insights require an active subscription — purchase it under Usage & credits",
      );
    }
    const categories = await prisma.category.findMany({ select: { id: true, name: true } });
    const rows = [];
    for (const category of categories) {
      const [demand, price] = await Promise.all([
        prisma.rfq.aggregate({
          where: { categoryId: category.id, createdAt: { gte: new Date(Date.now() - 90 * DAY) } },
          _sum: { quantity: true },
          _count: true,
        }),
        prisma.quotation.aggregate({
          where: {
            rfq: { categoryId: category.id },
            createdAt: { gte: new Date(Date.now() - 90 * DAY) },
          },
          _avg: { unitPrice: true },
          _count: true,
        }),
      ]);
      if (demand._count === 0 && price._count === 0) continue;
      rows.push({
        category: category.name,
        rfqCount90d: demand._count,
        demandVolume90d: String(demand._sum.quantity ?? 0),
        avgQuotedUnitPrice: price._avg.unitPrice
          ? Math.round(Number(price._avg.unitPrice) * 100) / 100
          : null,
        quoteCount90d: price._count,
      });
    }
    const lanes = await prisma.order.groupBy({
      by: ["currency"],
      _count: true,
      _sum: { totalAmount: true },
      orderBy: { currency: "asc" },
    });
    return {
      generatedAt: new Date().toISOString(),
      anonymisation:
        "Category-level aggregates only; no company identities or per-deal values are included.",
      categories: rows,
      tradeVolumes: lanes.map((l) => ({
        currency: l.currency,
        orders: l._count,
        totalValue: String(l._sum?.totalAmount ?? 0),
      })),
    };
  }

  marketReportTable(report: Awaited<ReturnType<IntelligenceService["marketReport"]>>): PdfTable {
    return {
      title: "PharmaChain market intelligence",
      subtitle: `Generated ${report.generatedAt} · ${report.anonymisation}`,
      columns: ["Category", "RFQs (90d)", "Demand volume", "Avg quoted price", "Quotes (90d)"],
      rows: report.categories.map((c) => [
        c.category,
        String(c.rfqCount90d),
        c.demandVolume90d,
        c.avgQuotedUnitPrice === null ? "—" : String(c.avgQuotedUnitPrice),
        String(c.quoteCount90d),
      ]),
    };
  }
}
