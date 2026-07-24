import { Injectable } from "@nestjs/common";
import { DASHBOARD_WIDGETS, DEFAULT_WIDGETS, isLogisticsCompanyType } from "@pharmachain/core";
import { prisma } from "@pharmachain/db";
import type { AuthUser, Membership } from "../../lib/context";

export interface KpiValue {
  key: string;
  label: string;
  value: string;
  detail: string;
  href?: string;
}

const DAY = 24 * 60 * 60 * 1000;
const hours = (ms: number) => ms / (60 * 60 * 1000);

// Per-instance 60s KPI cache (review finding: the engine re-computed a dozen
// query groups on every dashboard render). Instance-local is fine — staleness
// is bounded at a minute and dashboards already offer manual refresh.
const KPI_CACHE_TTL_MS = 60_000;
const kpiCache = new Map<string, { at: number; value: KpiValue[] }>();

/**
 * Role-aware KPI engine (Phase 4 §2): every number is computed from live
 * platform data — order timelines, quotation outcomes, shipment events,
 * ratings and document expiries. No sampling, no cached aggregates.
 */
@Injectable()
export class AnalyticsService {
  async kpis(user: AuthUser, membership: Membership | undefined): Promise<KpiValue[]> {
    if (!membership) return this.platformKpis(user);
    const cached = kpiCache.get(membership.companyId);
    if (cached && Date.now() - cached.at < KPI_CACHE_TTL_MS) return cached.value;
    const value = await this.computeCompanyKpis(membership);
    kpiCache.set(membership.companyId, { at: Date.now(), value });
    if (kpiCache.size > 500) kpiCache.clear(); // bounded
    return value;
  }

  private async computeCompanyKpis(membership: Membership): Promise<KpiValue[]> {
    const companyId = membership.companyId;
    const since90 = new Date(Date.now() - 90 * DAY);
    const isLogistics = isLogisticsCompanyType(membership.company.type);

    const [
      buyerOrders,
      deliveredEvents,
      quotations,
      bomItemsTotal,
      bomItemsSourced,
      ratingsReceived,
      expiringDocs,
      activeAppointments,
      customsEvents,
    ] = await Promise.all([
      prisma.order.findMany({
        where: { buyerCompanyId: companyId, createdAt: { gte: since90 } },
        include: { rfq: { select: { createdAt: true } } },
      }),
      prisma.orderStatusEvent.findMany({
        where: {
          status: "DELIVERED",
          order: { OR: [{ buyerCompanyId: companyId }, { sellerCompanyId: companyId }] },
        },
        include: { order: { select: { eta: true } } },
      }),
      prisma.quotation.findMany({
        where: { supplierCompanyId: companyId, status: { not: "SUPERSEDED" } },
        include: { rfq: { select: { createdAt: true } } },
      }),
      prisma.bomItem.count({
        where: { bom: { status: "ACTIVE", productListing: { companyId } } },
      }),
      prisma.bomItem.count({
        where: {
          bom: { status: "ACTIVE", productListing: { companyId } },
          rfqs: { some: {} },
        },
      }),
      prisma.rating.aggregate({
        where: { targetCompanyId: companyId, status: "PUBLISHED" },
        _avg: { stars: true },
        _count: true,
      }),
      prisma.document.count({
        where: {
          ownerCompanyId: companyId,
          status: "ACTIVE",
          expiresAt: { gte: new Date(), lte: new Date(Date.now() + 30 * DAY) },
        },
      }),
      prisma.shipmentAppointment.count({ where: { companyId, status: "ACTIVE" } }),
      // Customs dwell in ONE windowed query (review finding: this was up to
      // 500 sequential findFirst calls): LEAD() pairs each customs event
      // with the next non-exception event on the same order.
      prisma.$queryRaw<Array<{ dwellms: number }>>`
        SELECT EXTRACT(EPOCH FROM (next_at - "createdAt")) * 1000 AS dwellms
        FROM (
          SELECT e."createdAt", e."status",
                 LEAD(e."createdAt") OVER (PARTITION BY e."orderId" ORDER BY e."createdAt") AS next_at
          FROM "OrderStatusEvent" e
          JOIN "Order" o ON o."id" = e."orderId"
          WHERE e."exception" IS NULL
            AND (
              o."buyerCompanyId" = ${companyId}::uuid
              OR o."sellerCompanyId" = ${companyId}::uuid
              OR EXISTS (
                SELECT 1 FROM "ShipmentAppointment" a
                WHERE a."orderId" = o."id" AND a."companyId" = ${companyId}::uuid
                  AND a."status" = 'ACTIVE'
              )
            )
        ) t
        WHERE t."status" IN ('CUSTOMS_ORIGIN', 'CUSTOMS_DESTINATION') AND next_at IS NOT NULL
        LIMIT 500
      `,
    ]);

    const kpis: KpiValue[] = [];

    // Procurement lead time: RFQ raised → order confirmed (buyer side).
    const leadTimes = buyerOrders.map((o) => o.createdAt.getTime() - o.rfq.createdAt.getTime());
    kpis.push({
      key: "kpi-lead-time",
      label: "Procurement lead time",
      value: leadTimes.length
        ? `${(leadTimes.reduce((s, v) => s + v, 0) / leadTimes.length / DAY).toFixed(1)}d`
        : "—",
      detail: `RFQ → order across ${leadTimes.length} order(s), last 90 days`,
      href: "/orders",
    });

    // Fulfilment: buyer orders that reached DELIVERED / all buyer orders.
    const totalBuyerOrders = await prisma.order.count({ where: { buyerCompanyId: companyId } });
    const fulfilled = await prisma.order.count({
      where: { buyerCompanyId: companyId, status: { in: ["DELIVERED", "DELIVERY_CONFIRMED"] } },
    });
    kpis.push({
      key: "kpi-fulfilment",
      label: "Order fulfilment rate",
      value: totalBuyerOrders ? `${Math.round((fulfilled / totalBuyerOrders) * 100)}%` : "—",
      detail: `${fulfilled}/${totalBuyerOrders} order(s) delivered`,
      href: "/orders",
    });

    // On-time: DELIVERED events at or before the order's ETA.
    const withEta = deliveredEvents.filter((e) => e.order.eta);
    const onTime = withEta.filter(
      (e) => e.createdAt.getTime() <= (e.order.eta as Date).getTime() + DAY,
    );
    kpis.push({
      key: "kpi-on-time",
      label: "On-time delivery rate",
      value: withEta.length ? `${Math.round((onTime.length / withEta.length) * 100)}%` : "—",
      detail: `${onTime.length}/${withEta.length} delivery(ies) within ETA (+1 day grace)`,
    });

    // Customs dwell aggregated from the windowed query above.
    const dwell = customsEvents.map((row) => Number(row.dwellms)).filter((v) => Number.isFinite(v));
    kpis.push({
      key: "kpi-customs-delay",
      label: "Customs dwell time",
      value: dwell.length
        ? `${(dwell.reduce((s, v) => s + v, 0) / dwell.length / (60 * 60 * 1000)).toFixed(1)}h`
        : "—",
      detail: `Average across ${dwell.length} customs passage(s)`,
    });

    // Quotation win rate + response time (seller side).
    const accepted = quotations.filter((q) => q.status === "ACCEPTED").length;
    kpis.push({
      key: "kpi-quote-win",
      label: "Quotation win rate",
      value: quotations.length ? `${Math.round((accepted / quotations.length) * 100)}%` : "—",
      detail: `${accepted}/${quotations.length} quotation(s) accepted`,
      href: "/quotes",
    });
    const responses = quotations.map((q) => q.createdAt.getTime() - q.rfq.createdAt.getTime());
    kpis.push({
      key: "kpi-response-time",
      label: "Quote response time",
      value: responses.length
        ? `${hours(responses.reduce((s, v) => s + v, 0) / responses.length).toFixed(1)}h`
        : "—",
      detail: `RFQ published → quote submitted, ${responses.length} quote(s)`,
    });

    // Stockout risk: active-BOM materials without any sourcing RFQ.
    kpis.push({
      key: "kpi-stockout-risk",
      label: "Stockout risk (BOM)",
      value: String(Math.max(0, bomItemsTotal - bomItemsSourced)),
      detail: `${bomItemsSourced}/${bomItemsTotal} BOM material(s) have sourcing RFQs`,
      href: "/catalogue",
    });

    // Supplier performance score = published rating average.
    kpis.push({
      key: "kpi-supplier-score",
      label: "Supplier performance score",
      value: ratingsReceived._count ? `${(ratingsReceived._avg.stars ?? 0).toFixed(1)}★` : "—",
      detail: `${ratingsReceived._count} verified rating(s) received`,
    });

    // Compliance status: expiring documents within 30 days.
    kpis.push({
      key: "kpi-compliance",
      label: "Compliance status",
      value: expiringDocs === 0 ? "OK" : `${expiringDocs} expiring`,
      detail:
        expiringDocs === 0
          ? "No compliance documents expiring in 30 days"
          : `${expiringDocs} document(s) expire within 30 days`,
      href: "/company/verification",
    });

    kpis.push({
      key: "kpi-active-shipments",
      label: "Active shipments",
      value: String(
        isLogistics
          ? activeAppointments
          : await prisma.order.count({
              where: {
                OR: [{ buyerCompanyId: companyId }, { sellerCompanyId: companyId }],
                status: { notIn: ["DELIVERED", "DELIVERY_CONFIRMED"] },
              },
            }),
      ),
      detail: isLogistics ? "Appointed and in progress" : "Orders not yet delivered",
      href: isLogistics ? "/shipments" : "/orders",
    });

    return kpis;
  }

  private async platformKpis(_user: AuthUser): Promise<KpiValue[]> {
    const [companies, verified, orders, delivered, disputes, ratings] = await Promise.all([
      prisma.company.count(),
      prisma.company.count({ where: { verificationStatus: "VERIFIED" } }),
      prisma.order.count(),
      prisma.order.count({ where: { status: { in: ["DELIVERED", "DELIVERY_CONFIRMED"] } } }),
      prisma.dispute.count({ where: { status: { in: ["OPEN", "ESCALATED"] } } }),
      prisma.rating.aggregate({ _avg: { stars: true }, _count: true }),
    ]);
    return [
      {
        key: "kpi-fulfilment",
        label: "Order fulfilment rate",
        value: orders ? `${Math.round((delivered / orders) * 100)}%` : "—",
        detail: `${delivered}/${orders} orders delivered platform-wide`,
      },
      {
        key: "kpi-compliance",
        label: "Verified companies",
        value: `${verified}/${companies}`,
        detail: "Verification coverage across the network",
        href: "/admin/companies",
      },
      {
        key: "kpi-supplier-score",
        label: "Network rating average",
        value: ratings._count ? `${(ratings._avg.stars ?? 0).toFixed(1)}★` : "—",
        detail: `${ratings._count} verified rating(s)`,
      },
      {
        key: "kpi-active-shipments",
        label: "Open disputes",
        value: String(disputes),
        detail: "Open or escalated complaints",
        href: "/admin/disputes",
      },
    ];
  }

  /** Per-user widget layout with role-appropriate defaults (Phase 4 §2). */
  async dashboardPrefs(user: AuthUser, membership: Membership | undefined) {
    const pref = await prisma.dashboardPreference.findUnique({ where: { userId: user.id } });
    const audience =
      membership && isLogisticsCompanyType(membership.company.type) ? "logistics" : "trade";
    const widgets = (pref?.widgets as string[] | undefined) ?? [...DEFAULT_WIDGETS[audience]];
    return {
      widgets,
      available: DASHBOARD_WIDGETS.filter((w) => w.audience === "all" || w.audience === audience),
    };
  }

  async saveDashboardPrefs(user: AuthUser, widgets: string[]) {
    await prisma.dashboardPreference.upsert({
      where: { userId: user.id },
      update: { widgets },
      create: { userId: user.id, widgets },
    });
    return { widgets };
  }
}
