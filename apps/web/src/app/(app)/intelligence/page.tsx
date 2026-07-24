import { Badge } from "@pharmachain/ui/components/badge";
import { Button } from "@pharmachain/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pharmachain/ui/components/card";
import { Download, Sparkles } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { apiServer } from "@/lib/api/server";
import { fmtNumber } from "@/lib/format";

export const metadata = { title: "Intelligence" };

interface Forecast {
  months: string[];
  series: number[];
  forecast: number[];
  accuracyMapePct: number | null;
  sampleSize: number;
}
interface PriceTrend {
  months: string[];
  series: number[];
  direction: string;
  sampleSize: number;
}
interface DelayRisk {
  orderId: string;
  orderNo: string;
  status: string;
  elapsedDays: number;
  baselineDays: number | null;
  pastEta: boolean;
  baselineSamples: number;
  risk: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
}
interface Stockout {
  material: string;
  product: string;
  quantityPerUnit: string;
  unit: string;
  reason: string;
}
interface Recommendation {
  id: string;
  name: string;
  country: string;
  score: number | null;
  reasons: string[];
  trustedBadgeAt: string | null;
}

/** Inline series chart: history solid, forecast dashed — pure server SVG. */
function SeriesChart({ history, projected }: { history: number[]; projected: number[] }) {
  const all = [...history, ...projected];
  const max = Math.max(...all, 1);
  const w = 320;
  const h = 96;
  const step = w / Math.max(1, all.length - 1);
  const y = (v: number) => h - 8 - (v / max) * (h - 20);
  const point = (v: number, i: number) => `${(i * step).toFixed(1)},${y(v).toFixed(1)}`;
  const historyPath = history.map((v, i) => `${i === 0 ? "M" : "L"}${point(v, i)}`).join(" ");
  const projectedPath = [history[history.length - 1] ?? 0, ...projected]
    .map((v, i) => `${i === 0 ? "M" : "L"}${point(v, history.length - 1 + i)}`)
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full"
      role="img"
      aria-label="Demand series with forecast"
    >
      <path d={historyPath} fill="none" stroke="var(--color-primary)" strokeWidth="2" />
      <path
        d={projectedPath}
        fill="none"
        stroke="var(--color-info)"
        strokeWidth="2"
        strokeDasharray="5 4"
      />
    </svg>
  );
}

export default async function IntelligencePage() {
  const api = await apiServer();
  const [demand, prices, delayRisk, stockouts, recommendations, insights] = await Promise.all([
    api.get<Forecast>("/intelligence/demand"),
    api.get<PriceTrend>("/intelligence/prices"),
    api.get<DelayRisk[]>("/intelligence/delay-risk"),
    api.get<Stockout[]>("/intelligence/stockout-risk"),
    api.get<Recommendation[]>("/intelligence/supplier-recommendations"),
    api.get<{ categories: unknown[] }>("/intelligence/market-report").catch(() => null),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Intelligence"
        title="Market & supply intelligence"
        description="Transparent statistics over live platform data — every forecast ships its own backtest accuracy."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Demand forecast (all categories)</CardTitle>
            <CardDescription>
              Monthly RFQ volume, 12 months history + 3 forecast (dashed).{" "}
              {demand.accuracyMapePct === null
                ? "Backtest pending — more history needed."
                : `Backtest accuracy: ${demand.accuracyMapePct.toFixed(1)}% MAPE on held-out months.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SeriesChart history={demand.series} projected={demand.forecast} />
            <p className="mt-1 text-xs text-muted-foreground">
              Next 3 months: {demand.forecast.map((v) => fmtNumber(v)).join(" · ")} (from{" "}
              {demand.sampleSize} RFQs)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Price trend</CardTitle>
            <CardDescription>
              Average quoted unit price by month across {prices.sampleSize} quotation(s) — currently{" "}
              <span className="font-medium">{prices.direction}</span>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SeriesChart history={prices.series} projected={[]} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Shipment delay risk</CardTitle>
            <CardDescription>
              Active shipments vs the historical time-to-delivered baseline for their freight mode.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {delayRisk.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active shipments.</p>
            ) : (
              <ul className="space-y-1.5">
                {delayRisk.map((r) => (
                  <li key={r.orderId} className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`/orders/${r.orderId}`} className="text-primary hover:underline">
                      {r.orderNo}
                    </Link>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      {r.elapsedDays}d elapsed
                      {r.baselineDays !== null
                        ? ` / ~${r.baselineDays}d typical (n=${r.baselineSamples})`
                        : ""}
                      {r.risk === "UNKNOWN" ? (
                        <Badge variant="secondary">No baseline yet</Badge>
                      ) : (
                        <Badge
                          variant={
                            r.risk === "HIGH"
                              ? "destructive"
                              : r.risk === "MEDIUM"
                                ? "warning"
                                : "success"
                          }
                        >
                          {r.risk}
                        </Badge>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Stockout risk (BOM materials)</CardTitle>
            <CardDescription>Active-BOM materials with no live sourcing.</CardDescription>
          </CardHeader>
          <CardContent>
            {stockouts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Every BOM material has sourcing activity.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {stockouts.map((s) => (
                  <li key={`${s.product}-${s.material}`} className="text-sm">
                    <span className="font-medium">{s.material}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      for {s.product} · {s.reason}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Recommended suppliers</CardTitle>
          <CardDescription>
            Composite of verified ratings, on-time delivery and quotation win rate.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recommendations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Not enough trading history yet.</p>
          ) : (
            <ul className="space-y-2">
              {recommendations.map((r, i) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-display w-7 text-xl text-muted-foreground">{i + 1}</span>
                    <Link href={`/companies/${r.id}`} className="font-medium hover:underline">
                      {r.name}
                    </Link>
                    <span className="text-xs text-muted-foreground">{r.country}</span>
                    {r.trustedBadgeAt && <Badge variant="success">Trusted</Badge>}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {r.score !== null && (
                      <span className="text-display mr-2 text-base text-foreground">{r.score}</span>
                    )}
                    {r.reasons.join(" · ") || "no signals yet"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm">Market data insights</CardTitle>
            <CardDescription>
              Anonymised category-level pricing, demand and trade-volume report — a subscription
              data product.
            </CardDescription>
          </div>
          {insights ? (
            <div className="flex gap-2">
              {(["csv", "pdf"] as const).map((format) => (
                <Button key={format} asChild size="sm" variant="outline">
                  <a href={`/api/proxy/intelligence/market-report?format=${format}`} download>
                    <Download className="size-3.5" /> {format.toUpperCase()}
                  </a>
                </Button>
              ))}
            </div>
          ) : (
            <Button asChild size="sm">
              <Link href="/company/usage">
                <Sparkles className="size-4" /> Subscribe under Usage & credits
              </Link>
            </Button>
          )}
        </CardHeader>
        {insights && (
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Subscription active — {insights.categories.length} category segment(s) in the current
              report.
            </p>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
