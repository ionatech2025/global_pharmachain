import { Badge } from "@pharmachain/ui/components/badge";
import { Button } from "@pharmachain/ui/components/button";
import { Download, PackageX, Sparkles, TrendingDown, TrendingUp, Truck, Users } from "lucide-react";
import Link from "next/link";
import { ForecastChart } from "@/components/dashboard/charts";
import { Panel, PanelBody, PanelHeader, Provenance } from "@/components/dashboard/panel";
import { StatGrid, StatTile } from "@/components/dashboard/stat-tile";
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

/** Month keys arrive as YYYY-MM; the axis wants "Aug" (with the year on turn). */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function monthLabel(key: string): string {
  const [year, month] = key.split("-");
  const name = MONTHS[Number(month) - 1] ?? key;
  return month === "01" ? `${name} ${year?.slice(2) ?? ""}` : name;
}

/** Labels for a series that continues past its measured months. */
function projectedLabels(months: string[], extra: number): string[] {
  const labels = months.map(monthLabel);
  const last = months.at(-1);
  if (!last || extra === 0) return labels;
  const [year, month] = last.split("-").map(Number);
  for (let i = 1; i <= extra; i++) {
    const d = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1 + i, 1));
    labels.push(
      monthLabel(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`),
    );
  }
  return labels;
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

  const nextQuarter = demand.forecast.reduce((sum, v) => sum + v, 0);
  const lastQuarter = demand.series.slice(-3).reduce((sum, v) => sum + v, 0);
  const atRisk = delayRisk.filter((r) => r.risk === "HIGH" || r.risk === "MEDIUM").length;
  const priceRising = prices.direction.toLowerCase().includes("ris");
  const topScore = recommendations.find((r) => r.score !== null)?.score ?? null;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Intelligence"
        title="Market & supply intelligence"
        description="Transparent statistics over live platform data — every forecast ships its own backtest accuracy, and every list its sample size."
      />

      <StatGrid>
        <StatTile
          // A projected count of RFQs is a whole number of RFQs; the model's
          // fractional output is an artefact of the arithmetic, not a quantity
          // anyone can act on.
          label="Forecast demand"
          value={fmtNumber(Math.round(nextQuarter))}
          icon={TrendingUp}
          delta={{ current: nextQuarter, previous: lastQuarter }}
          caption="RFQs projected over the next 3 months"
        />
        <StatTile
          // Named for what it measures. MAPE is an ERROR: labelling it
          // "accuracy" makes 100% read as flawless when it means the forecast
          // was off by its own magnitude.
          label="Forecast error"
          value={demand.accuracyMapePct === null ? "—" : `${demand.accuracyMapePct.toFixed(1)}%`}
          icon={Sparkles}
          goodDirection="down"
          caption={
            demand.accuracyMapePct === null
              ? "backtest pending — more history needed"
              : "mean absolute % error on held-out months — lower is better"
          }
        />
        <StatTile
          label="Shipments at risk"
          value={fmtNumber(atRisk)}
          icon={Truck}
          goodDirection="down"
          caption={`of ${delayRisk.length} active shipment(s) tracked`}
          tone={atRisk > 0 ? "warning" : "default"}
        />
        <StatTile
          label="Unsourced materials"
          value={fmtNumber(stockouts.length)}
          icon={PackageX}
          href="/catalogue"
          goodDirection="down"
          caption="active-BOM materials with no live sourcing"
          tone={stockouts.length > 0 ? "warning" : "default"}
        />
      </StatGrid>

      <div className="grid gap-3 xl:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Demand forecast"
            description="Monthly RFQ volume across all categories: 12 months measured, 3 months projected."
          />
          <PanelBody>
            <ForecastChart
              labels={projectedLabels(demand.months, demand.forecast.length)}
              history={demand.series}
              forecast={demand.forecast}
              emptyNote="No RFQ history to forecast from yet."
            />
            <Provenance>
              {demand.accuracyMapePct === null
                ? `Backtest pending — more history needed. Based on ${fmtNumber(demand.sampleSize)} RFQ(s).`
                : `Backtest accuracy ${demand.accuracyMapePct.toFixed(1)}% MAPE on held-out months, from ${fmtNumber(demand.sampleSize)} RFQ(s).`}
            </Provenance>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            title="Price trend"
            description="Average quoted unit price by month."
            action={
              <Badge variant={priceRising ? "warning" : "success"}>
                {priceRising ? (
                  <TrendingUp className="size-3" />
                ) : (
                  <TrendingDown className="size-3" />
                )}
                {prices.direction}
              </Badge>
            }
          />
          <PanelBody>
            <ForecastChart
              labels={prices.months.map(monthLabel)}
              history={prices.series}
              baseline="fit"
              emptyNote="No quotations priced yet."
            />
            <Provenance>
              Across {fmtNumber(prices.sampleSize)} quotation(s). Unit prices are normalised to the
              quoted currency at issue — no FX re-basing.
            </Provenance>
          </PanelBody>
        </Panel>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Shipment delay risk"
            description="Active shipments measured against the historical time-to-delivered baseline for their freight mode."
          />
          <PanelBody>
            {delayRisk.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active shipments.</p>
            ) : (
              <ul className="divide-y">
                {delayRisk.map((r) => (
                  <li key={r.orderId} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <Link
                        href={`/orders/${r.orderId}`}
                        className="touch-target min-h-6 text-sm font-medium hover:underline"
                      >
                        {r.orderNo}
                      </Link>
                      <p className="num-col text-xs text-muted-foreground">
                        {r.elapsedDays}d elapsed
                        {r.baselineDays !== null
                          ? ` · ~${r.baselineDays}d typical (n=${r.baselineSamples})`
                          : " · no baseline yet"}
                      </p>
                    </div>
                    {r.risk === "UNKNOWN" ? (
                      <Badge variant="secondary">No baseline</Badge>
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
                  </li>
                ))}
              </ul>
            )}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            title="Stockout risk"
            description="Materials on an active bill of materials with no live sourcing RFQ behind them."
          />
          <PanelBody>
            {stockouts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Every BOM material has sourcing activity.
              </p>
            ) : (
              <ul className="divide-y">
                {stockouts.map((s) => (
                  <li key={`${s.product}-${s.material}`} className="py-2.5">
                    <p className="text-sm font-medium">{s.material}</p>
                    <p className="text-xs text-muted-foreground">
                      for {s.product} · {s.reason}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </PanelBody>
        </Panel>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Recommended suppliers"
            description="A composite of verified ratings, on-time delivery and quotation win rate — every input is a recorded outcome, never a paid placement."
          />
          <PanelBody>
            {recommendations.length === 0 ? (
              <p className="text-sm text-muted-foreground">Not enough trading history yet.</p>
            ) : (
              <ul className="divide-y">
                {recommendations.map((r, i) => (
                  <li key={r.id} className="flex items-center gap-3 py-2.5">
                    <span className="num-col w-5 shrink-0 text-sm font-semibold text-muted-foreground">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <Link
                          href={`/companies/${r.id}`}
                          className="touch-target min-h-6 truncate text-sm font-medium hover:underline"
                        >
                          {r.name}
                        </Link>
                        {r.trustedBadgeAt && <Badge variant="success">Trusted</Badge>}
                      </span>
                      <p className="truncate text-xs text-muted-foreground">
                        {r.country} · {r.reasons.join(" · ") || "no signals yet"}
                      </p>
                    </div>
                    {r.score !== null && (
                      <div className="flex w-28 shrink-0 items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-primary/12">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{
                              width: `${Math.min(100, (r.score / Math.max(1, topScore ?? r.score)) * 100)}%`,
                            }}
                          />
                        </div>
                        <span className="num-col w-7 text-right text-xs font-semibold">
                          {r.score}
                        </span>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            title="Market data insights"
            description="Anonymised category-level pricing, demand and trade-volume report — a subscription data product."
          />
          <PanelBody className="space-y-3">
            {insights ? (
              <>
                <div className="flex items-center gap-2">
                  <Users className="size-4 text-muted-foreground" aria-hidden="true" />
                  <p className="text-sm">
                    Subscription active —{" "}
                    <span className="font-medium">{insights.categories.length}</span> category
                    segment(s) in the current report.
                  </p>
                </div>
                <div className="flex gap-2">
                  {(["csv", "pdf"] as const).map((format) => (
                    <Button key={format} asChild size="sm" variant="outline">
                      <a href={`/api/proxy/intelligence/market-report?format=${format}`} download>
                        <Download className="size-3.5" /> {format.toUpperCase()}
                      </a>
                    </Button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Category-level benchmarks across the whole network, with your own company's data
                  anonymised into the aggregate.
                </p>
                <Button asChild size="sm">
                  <Link href="/company/usage">
                    <Sparkles className="size-4" /> Subscribe under Usage & credits
                  </Link>
                </Button>
              </>
            )}
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}
