import { Injectable } from "@nestjs/common";
import type { PdfTable } from "@pharmachain/core";
import { backtestMape, forecast, orderStatusIndex } from "@pharmachain/core";
import { type Prisma, prisma } from "@pharmachain/db";
import { forbidden } from "../../common/errors";
import type { Membership } from "../../lib/context";
import {
  categoryPriceTrends,
  completedMonths,
  dealTotal,
  lastCompletedQuarter,
  lastMonths,
  monthlyCounts,
  publishedAverage,
  quoteStanding,
} from "./series";

const DAY = 24 * 60 * 60 * 1000;
const monthStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));

/** Quotations as the published price figures see them: see PartiedQuote in series.ts. */
async function partiedQuotes(where: Prisma.QuotationWhereInput) {
  const now = new Date();
  // One snapshot: the RFQ, its order and its live quotes are read by separate statements,
  // and an award landing between them could show a winning quote as a settled loss.
  const rows = await prisma.$transaction(
    (tx) =>
      tx.quotation.findMany({
        // A replaced version can no longer move a published month (it is replaced only while
        // its RFQ is open), so leave it out rather than let old offers skew the average.
        where: { ...where, status: { not: "SUPERSEDED" } },
        select: {
          createdAt: true,
          unitPrice: true,
          currency: true,
          status: true,
          supplierCompanyId: true,
          rfq: {
            select: {
              unit: true,
              status: true,
              buyerCompanyId: true,
              category: { select: { id: true, name: true, slug: true } },
              order: { select: { sellerCompanyId: true } },
              // A closed RFQ can still be awarded while a quote on it is live.
              quotations: {
                where: { status: "ACTIVE", validUntil: { gt: now } },
                select: { id: true },
                take: 1,
              },
            },
          },
        },
      }),
    { isolationLevel: "RepeatableRead" },
  );
  return rows.map((q) => ({
    createdAt: q.createdAt,
    unitPrice: q.unitPrice,
    currency: q.currency,
    unit: q.rfq.unit,
    category: q.rfq.category,
    supplierCompanyId: q.supplierCompanyId,
    buyerCompanyId: q.rfq.buyerCompanyId,
    ...quoteStanding({
      status: q.status,
      supplierCompanyId: q.supplierCompanyId,
      rfq: {
        status: q.rfq.status,
        hasLiveQuote: q.rfq.quotations.length > 0,
        winnerCompanyId: q.rfq.order?.sellerCompanyId ?? null,
      },
    }),
  }));
}

/**
 * Intelligence engine (Phase 5 §1): transparent statistics over live
 * platform data. Every forecast ships its own backtest accuracy (MAPE over
 * held-out months) — the eval travels with the prediction.
 */
@Injectable()
export class IntelligenceService {
  /**
   * Monthly demand as the number of RFQs raised, with a 3-month forecast.
   * A count is the only demand measure that adds up across the platform: each
   * RFQ quantity carries its own free-text unit (kg, tablets, litres), so a
   * sum of quantities is a number with no unit at all.
   */
  async demandForecast(categoryId?: string) {
    const months = lastMonths(12);
    const rfqs = await prisma.rfq.findMany({
      where: {
        createdAt: { gte: new Date(Date.now() - 366 * DAY) },
        ...(categoryId ? { categoryId } : {}),
      },
      select: { createdAt: true },
    });
    const series = monthlyCounts(
      rfqs.map((r) => r.createdAt),
      months,
    );
    return {
      months,
      series,
      forecast: forecast(series, 3).map((v) => Math.round(v * 100) / 100),
      accuracyMapePct: backtestMape(series, 3),
      // The RFQs the series actually counts — the window is whole months.
      sampleSize: series.reduce((sum, v) => sum + v, 0),
    };
  }

  /**
   * Quoted-price trends per category, each in its most-quoted unit and
   * currency — see categoryPriceTrends. One query for the whole window, over
   * completed months only; which quotations count, and when a month may be
   * shown, is publishableQuotes's rule (ADR-0007).
   */
  async priceTrends(categoryId?: string) {
    const months = completedMonths(12);
    const quotes = await partiedQuotes({
      createdAt: { gte: new Date(`${months[0]}-01T00:00:00Z`), lt: monthStart(new Date()) },
      ...(categoryId ? { rfq: { categoryId } } : {}),
    });
    return { months, ...categoryPriceTrends(quotes, months) };
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
      values?.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
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

  /** Composite supplier recommendations (Phase 5 §1). Batched (review
   *  finding: the per-seller loop issued ~3 × N queries): three grouped
   *  queries cover every candidate at once. */
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
    if (sellers.length === 0) return [];
    const sellerIds = sellers.map((s) => s.id);
    const [ratings, quotes, delivered] = await Promise.all([
      prisma.rating.groupBy({
        by: ["targetCompanyId"],
        where: { targetCompanyId: { in: sellerIds }, status: "PUBLISHED" },
        _avg: { stars: true },
        _count: true,
        orderBy: { targetCompanyId: "asc" },
      }),
      prisma.quotation.groupBy({
        by: ["supplierCompanyId", "status"],
        where: { supplierCompanyId: { in: sellerIds }, status: { not: "SUPERSEDED" } },
        _count: true,
        orderBy: [{ supplierCompanyId: "asc" }, { status: "asc" }],
      }),
      prisma.orderStatusEvent.findMany({
        where: {
          status: "DELIVERED",
          order: { sellerCompanyId: { in: sellerIds }, eta: { not: null } },
        },
        select: { createdAt: true, order: { select: { sellerCompanyId: true, eta: true } } },
      }),
    ]);
    const ratingBySeller = new Map(ratings.map((r) => [r.targetCompanyId, r]));
    const quotesBySeller = new Map<string, { total: number; won: number }>();
    for (const q of quotes) {
      const bucket = quotesBySeller.get(q.supplierCompanyId) ?? { total: 0, won: 0 };
      bucket.total += q._count;
      if (q.status === "ACCEPTED") bucket.won += q._count;
      quotesBySeller.set(q.supplierCompanyId, bucket);
    }
    const deliveriesBySeller = new Map<string, { total: number; onTime: number }>();
    for (const e of delivered) {
      const sellerId = e.order.sellerCompanyId;
      const bucket = deliveriesBySeller.get(sellerId) ?? { total: 0, onTime: 0 };
      bucket.total += 1;
      if (e.createdAt.getTime() <= (e.order.eta as Date).getTime() + DAY) bucket.onTime += 1;
      deliveriesBySeller.set(sellerId, bucket);
    }

    const results = sellers.map((seller) => {
      const rating = ratingBySeller.get(seller.id);
      const quoteStats = quotesBySeller.get(seller.id);
      const deliveryStats = deliveriesBySeller.get(seller.id);
      const winRate = quoteStats?.total ? quoteStats.won / quoteStats.total : null;
      const onTime = deliveryStats?.total ? deliveryStats.onTime / deliveryStats.total : null;
      const stars = rating?._count ? (rating._avg?.stars ?? 0) / 5 : null;
      const parts = [stars, onTime, winRate].filter((v): v is number => v !== null);
      const score = parts.length
        ? Math.round((parts.reduce((s, v) => s + v, 0) / parts.length) * 1000) / 10
        : null;
      const reasons: string[] = [];
      if (rating?._count)
        reasons.push(
          `${(rating._avg?.stars ?? 0).toFixed(1)}/5 across ${rating._count} verified rating(s)`,
        );
      if (onTime !== null) reasons.push(`${Math.round(onTime * 100)}% on-time deliveries`);
      if (winRate !== null) reasons.push(`${Math.round(winRate * 100)}% quotation win rate`);
      if (seller.trustedBadgeAt) reasons.push("Trusted Supplier badge");
      return { ...seller, score, reasons };
    });
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
    // A closed quarter: two downloads either match or cover different quarters,
    // so no single new record can be read off their difference.
    const period = lastCompletedQuarter();
    const createdAt = { gte: period.from, lt: period.to };
    const months = lastMonths(3, new Date(period.to.getTime() - 1));
    const [categories, rfqCounts, quotes, orders] = await Promise.all([
      prisma.category.findMany({ select: { id: true, name: true } }),
      prisma.rfq.groupBy({
        by: ["categoryId"],
        where: { createdAt, categoryId: { not: null } },
        _count: true,
      }),
      partiedQuotes({ createdAt }),
      prisma.order.findMany({
        where: { createdAt },
        select: {
          id: true,
          currency: true,
          totalAmount: true,
          status: true,
          buyerCompanyId: true,
          sellerCompanyId: true,
          appointments: { select: { companyId: true } },
        },
      }),
    ]);

    const rows = [];
    for (const category of categories) {
      const rfqCount = rfqCounts.find((r) => r.categoryId === category.id)?._count ?? 0;
      const own = quotes.filter((q) => q.category?.id === category.id);
      if (rfqCount === 0 && own.length === 0) continue;
      const price = publishedAverage(own, months);
      // The *90d names predate the quarterly period; kept so subscribers' parsers still work.
      rows.push({
        category: category.name,
        rfqCount90d: rfqCount,
        // Withheld: quantities carry free-text units, so their sum is no quantity, and
        // every supplier of the targeted type sees each one.
        demandVolume90d: null,
        avgQuotedUnitPrice: price?.average ?? null,
        currency: price?.currency ?? null,
        unit: price?.unit ?? null,
        /** The quotations behind avgQuotedUnitPrice; quoteCount90d counts every one. */
        pricedQuoteCount: price?.quotations ?? 0,
        quoteCount90d: own.length,
      });
    }

    const byCurrency = new Map<string, typeof orders>();
    for (const order of orders) {
      byCurrency.set(order.currency, [...(byCurrency.get(order.currency) ?? []), order]);
    }
    return {
      generatedAt: new Date().toISOString(),
      period: {
        label: period.label,
        from: period.from.toISOString(),
        to: period.to.toISOString(),
      },
      anonymisation:
        "Category-level aggregates only; no company identities or per-deal values are included. Figures cover the last completed quarter. Prices come only from quotations that did not win, once their RFQs are settled; a figure that would let any one company work out another company's price or deal value is withheld.",
      categories: rows,
      tradeVolumes: [...byCurrency.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([currency, list]) => {
          const total = dealTotal(
            list.map((o) => ({
              id: o.id,
              value: o.totalAmount.toNumber(),
              settled: o.status === "DELIVERY_CONFIRMED",
              parties: [
                o.buyerCompanyId,
                o.sellerCompanyId,
                ...o.appointments.map((a) => a.companyId),
              ],
            })),
          );
          return {
            currency,
            orders: list.length,
            totalValue: total === null ? null : String(total),
          };
        }),
    };
  }

  marketReportTable(report: Awaited<ReturnType<IntelligenceService["marketReport"]>>): PdfTable {
    return {
      title: "Global PharmaChain market intelligence",
      subtitle: `${report.period.label} · generated ${report.generatedAt} · ${report.anonymisation}`,
      columns: ["Category", "RFQs", "Avg quoted price", "Priced from", "Quotes"],
      rows: report.categories.map((c) => [
        c.category,
        String(c.rfqCount90d),
        c.avgQuotedUnitPrice === null
          ? "—"
          : `${c.avgQuotedUnitPrice} ${c.currency}${c.unit ? `/${c.unit}` : ""}`,
        String(c.pricedQuoteCount),
        String(c.quoteCount90d),
      ]),
    };
  }
}
