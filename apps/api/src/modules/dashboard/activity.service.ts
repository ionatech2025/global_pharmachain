import { Injectable } from "@nestjs/common";
import {
  isLogisticsCompanyType,
  ORDER_PIPELINE_STAGES,
  ORDER_STAGE_BY_STATUS,
} from "@pharmachain/core";
import { type Prisma, prisma } from "@pharmachain/db";
import type { AuthUser, Membership } from "../../lib/context";

const DAY = 24 * 60 * 60 * 1000;
const WEEK_BUCKETS = 12;
const WINDOW_DAYS = 30;

export interface TrendPoint {
  /** UTC Monday that opens the bucket, YYYY-MM-DD. */
  start: string;
  label: string;
  values: Record<string, number>;
}
export interface SeriesDef {
  key: string;
  label: string;
}
export interface Delta {
  current: number;
  previous: number;
}
export interface StageSlice {
  key: string;
  label: string;
  count: number;
}
export interface DashboardActivity {
  scope: "company" | "platform";
  /** Weekly counts, oldest first — 12 real buckets, zeros included. */
  trend: TrendPoint[];
  /** Legend definitions, in the order the series should be drawn. */
  series: SeriesDef[];
  /** Trailing 30 days against the 30 before it, per series key. */
  deltas: Record<string, Delta>;
  windowDays: number;
  /** Live orders by pipeline stage — an ordinal funnel, not a category set. */
  pipeline: StageSlice[];
}

type Bucket = { bucket: string; n: number };

/** Twelve UTC-Monday bucket keys, oldest first — the x axis, zeros and all. */
function bucketKeys(): string[] {
  const today = new Date();
  const monday = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  // getUTCDay(): 0 = Sunday. Shift so Monday is 0, matching date_trunc('week').
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return Array.from({ length: WEEK_BUCKETS }, (_, i) => {
    const d = new Date(monday.getTime() - (WEEK_BUCKETS - 1 - i) * 7 * DAY);
    return d.toISOString().slice(0, 10);
  });
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function bucketLabel(key: string): string {
  const [, month, day] = key.split("-");
  return `${MONTHS[Number(month) - 1] ?? ""} ${Number(day)}`.trim();
}

/**
 * Live dashboard series (Phase 4 §2). Every number is a real count over a real
 * window — no smoothing, no synthesised points. Weeks with no activity come
 * back as zero so the x axis stays evenly spaced and a quiet week reads as a
 * quiet week rather than a gap.
 */
@Injectable()
export class ActivityService {
  // Same 60s per-instance cache the KPI engine uses: a dashboard render fires
  // this alongside /dashboard/summary and /analytics/kpis, and manual refresh
  // is one click away, so bounded staleness is the right trade.
  private readonly cache = new Map<string, { at: number; value: DashboardActivity }>();
  private static readonly TTL_MS = 60_000;

  async activity(user: AuthUser, membership: Membership | undefined): Promise<DashboardActivity> {
    const cacheKey = membership ? `company:${membership.companyId}` : `platform:${user.id}`;
    const hit = this.cache.get(cacheKey);
    if (hit && Date.now() - hit.at < ActivityService.TTL_MS) return hit.value;

    const value = membership
      ? isLogisticsCompanyType(membership.company.type)
        ? await this.logisticsActivity(membership.companyId)
        : await this.tradeActivity(membership.companyId)
      : await this.platformActivity();

    this.cache.set(cacheKey, { at: Date.now(), value });
    if (this.cache.size > 500) this.cache.clear(); // bounded
    return value;
  }

  /** Stitches the per-series bucket rows into one point per week. */
  private assemble(series: SeriesDef[], rows: Bucket[][]): TrendPoint[] {
    const maps = rows.map((r) => new Map(r.map((row) => [row.bucket, Number(row.n)])));
    return bucketKeys().map((start) => ({
      start,
      label: bucketLabel(start),
      values: Object.fromEntries(series.map((s, i) => [s.key, maps[i]?.get(start) ?? 0])) as Record<
        string,
        number
      >,
    }));
  }

  /**
   * Open orders bucketed into the five pipeline stages. DELIVERY_CONFIRMED is
   * excluded: a closed order is history, not pipeline.
   */
  private async stageMix(scope: Prisma.OrderWhereInput): Promise<StageSlice[]> {
    const rows = await prisma.order.groupBy({
      by: ["status"],
      where: { ...scope, status: { not: "DELIVERY_CONFIRMED" } },
      _count: { _all: true },
    });
    const totals = new Map<string, number>();
    for (const row of rows) {
      const stage = ORDER_STAGE_BY_STATUS[row.status];
      totals.set(stage, (totals.get(stage) ?? 0) + row._count._all);
    }
    return ORDER_PIPELINE_STAGES.map((stage) => ({
      key: stage.key,
      label: stage.label,
      count: totals.get(stage.key) ?? 0,
    }));
  }

  private async tradeActivity(companyId: string): Promise<DashboardActivity> {
    const since = new Date(Date.now() - WEEK_BUCKETS * 7 * DAY);
    const currentFrom = new Date(Date.now() - WINDOW_DAYS * DAY);
    const previousFrom = new Date(Date.now() - 2 * WINDOW_DAYS * DAY);
    const bothSides = [{ buyerCompanyId: companyId }, { sellerCompanyId: companyId }];

    const [rfqRows, quoteRows, orderRows, pipeline, counts] = await Promise.all([
      prisma.$queryRaw<Bucket[]>`
        SELECT to_char(date_trunc('week', "createdAt" AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS bucket,
               count(*)::int AS n
        FROM "Rfq"
        WHERE "buyerCompanyId" = ${companyId}::uuid AND "createdAt" >= ${since}
        GROUP BY 1`,
      prisma.$queryRaw<Bucket[]>`
        SELECT to_char(date_trunc('week', "createdAt" AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS bucket,
               count(*)::int AS n
        FROM "Quotation"
        WHERE "supplierCompanyId" = ${companyId}::uuid AND "createdAt" >= ${since}
        GROUP BY 1`,
      prisma.$queryRaw<Bucket[]>`
        SELECT to_char(date_trunc('week', "createdAt" AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS bucket,
               count(*)::int AS n
        FROM "Order"
        WHERE ("buyerCompanyId" = ${companyId}::uuid OR "sellerCompanyId" = ${companyId}::uuid)
          AND "createdAt" >= ${since}
        GROUP BY 1`,
      this.stageMix({ OR: bothSides }),
      prisma.$transaction([
        prisma.rfq.count({ where: { buyerCompanyId: companyId, createdAt: { gte: currentFrom } } }),
        prisma.rfq.count({
          where: { buyerCompanyId: companyId, createdAt: { gte: previousFrom, lt: currentFrom } },
        }),
        prisma.quotation.count({
          where: { supplierCompanyId: companyId, createdAt: { gte: currentFrom } },
        }),
        prisma.quotation.count({
          where: {
            supplierCompanyId: companyId,
            createdAt: { gte: previousFrom, lt: currentFrom },
          },
        }),
        prisma.order.count({ where: { OR: bothSides, createdAt: { gte: currentFrom } } }),
        prisma.order.count({
          where: { OR: bothSides, createdAt: { gte: previousFrom, lt: currentFrom } },
        }),
      ]),
    ]);

    const series: SeriesDef[] = [
      { key: "rfqs", label: "RFQs raised" },
      { key: "quotations", label: "Quotations sent" },
      { key: "orders", label: "Orders" },
    ];
    return {
      scope: "company",
      series,
      trend: this.assemble(series, [rfqRows, quoteRows, orderRows]),
      deltas: {
        rfqs: { current: counts[0], previous: counts[1] },
        quotations: { current: counts[2], previous: counts[3] },
        orders: { current: counts[4], previous: counts[5] },
      },
      windowDays: WINDOW_DAYS,
      pipeline,
    };
  }

  private async logisticsActivity(companyId: string): Promise<DashboardActivity> {
    const since = new Date(Date.now() - WEEK_BUCKETS * 7 * DAY);
    const currentFrom = new Date(Date.now() - WINDOW_DAYS * DAY);
    const previousFrom = new Date(Date.now() - 2 * WINDOW_DAYS * DAY);
    const appointed = { appointments: { some: { companyId, status: "ACTIVE" as const } } };

    const [appointmentRows, deliveryRows, pipeline, counts] = await Promise.all([
      prisma.$queryRaw<Bucket[]>`
        SELECT to_char(date_trunc('week', "createdAt" AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS bucket,
               count(*)::int AS n
        FROM "ShipmentAppointment"
        WHERE "companyId" = ${companyId}::uuid AND "createdAt" >= ${since}
        GROUP BY 1`,
      prisma.$queryRaw<Bucket[]>`
        SELECT to_char(date_trunc('week', e."createdAt" AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS bucket,
               count(*)::int AS n
        FROM "OrderStatusEvent" e
        WHERE e."status" = 'DELIVERED' AND e."createdAt" >= ${since}
          AND EXISTS (
            SELECT 1 FROM "ShipmentAppointment" a
            WHERE a."orderId" = e."orderId" AND a."companyId" = ${companyId}::uuid
          )
        GROUP BY 1`,
      this.stageMix(appointed),
      prisma.$transaction([
        prisma.shipmentAppointment.count({ where: { companyId, createdAt: { gte: currentFrom } } }),
        prisma.shipmentAppointment.count({
          where: { companyId, createdAt: { gte: previousFrom, lt: currentFrom } },
        }),
        prisma.orderStatusEvent.count({
          where: { status: "DELIVERED", createdAt: { gte: currentFrom }, order: appointed },
        }),
        prisma.orderStatusEvent.count({
          where: {
            status: "DELIVERED",
            createdAt: { gte: previousFrom, lt: currentFrom },
            order: appointed,
          },
        }),
      ]),
    ]);

    const series: SeriesDef[] = [
      { key: "appointments", label: "Appointments" },
      { key: "deliveries", label: "Deliveries completed" },
    ];
    return {
      scope: "company",
      series,
      trend: this.assemble(series, [appointmentRows, deliveryRows]),
      deltas: {
        appointments: { current: counts[0], previous: counts[1] },
        deliveries: { current: counts[2], previous: counts[3] },
      },
      windowDays: WINDOW_DAYS,
      pipeline,
    };
  }

  private async platformActivity(): Promise<DashboardActivity> {
    const since = new Date(Date.now() - WEEK_BUCKETS * 7 * DAY);
    const currentFrom = new Date(Date.now() - WINDOW_DAYS * DAY);
    const previousFrom = new Date(Date.now() - 2 * WINDOW_DAYS * DAY);

    const [companyRows, rfqRows, orderRows, pipeline, counts] = await Promise.all([
      prisma.$queryRaw<Bucket[]>`
        SELECT to_char(date_trunc('week', "createdAt" AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS bucket,
               count(*)::int AS n
        FROM "Company" WHERE "createdAt" >= ${since} GROUP BY 1`,
      prisma.$queryRaw<Bucket[]>`
        SELECT to_char(date_trunc('week', "createdAt" AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS bucket,
               count(*)::int AS n
        FROM "Rfq" WHERE "createdAt" >= ${since} GROUP BY 1`,
      prisma.$queryRaw<Bucket[]>`
        SELECT to_char(date_trunc('week', "createdAt" AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS bucket,
               count(*)::int AS n
        FROM "Order" WHERE "createdAt" >= ${since} GROUP BY 1`,
      this.stageMix({}),
      prisma.$transaction([
        prisma.company.count({ where: { createdAt: { gte: currentFrom } } }),
        prisma.company.count({ where: { createdAt: { gte: previousFrom, lt: currentFrom } } }),
        prisma.rfq.count({ where: { createdAt: { gte: currentFrom } } }),
        prisma.rfq.count({ where: { createdAt: { gte: previousFrom, lt: currentFrom } } }),
        prisma.order.count({ where: { createdAt: { gte: currentFrom } } }),
        prisma.order.count({ where: { createdAt: { gte: previousFrom, lt: currentFrom } } }),
      ]),
    ]);

    const series: SeriesDef[] = [
      { key: "companies", label: "Companies joined" },
      { key: "rfqs", label: "RFQs raised" },
      { key: "orders", label: "Orders" },
    ];
    return {
      scope: "platform",
      series,
      trend: this.assemble(series, [companyRows, rfqRows, orderRows]),
      deltas: {
        companies: { current: counts[0], previous: counts[1] },
        rfqs: { current: counts[2], previous: counts[3] },
        orders: { current: counts[4], previous: counts[5] },
      },
      windowDays: WINDOW_DAYS,
      pipeline,
    };
  }
}
