import { cn } from "@pharmachain/ui/lib/utils";
import { ChevronRight, OctagonAlert, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { fmtNumber } from "@/lib/format";

/*
 * Server-rendered SVG charts. Four rules hold across all of them:
 *
 *  1. No client JavaScript. These are React Server Components emitting plain
 *     SVG; the crosshair and tooltip are CSS hover on an invisible hit-rect
 *     (see .chart-slot / .chart-hover in globals.css), so a dashboard full of
 *     charts ships zero extra bytes to the browser.
 *  2. Colour does one job. --chart-N is categorical (series identity, fixed
 *     slot order, never cycled); --ramp-N is ordinal (stages whose order means
 *     something). Both sets are contrast- and CVD-validated per theme.
 *  3. Identity is never colour alone — every multi-series chart ships a legend
 *     carrying the series' latest value, and every slice its label and count.
 *  4. Hover enhances, never gates. Every value is also in the chart's table
 *     view, a native <details> under the plot — the path for touch, keyboard
 *     and screen readers alike.
 *
 * Strokes are non-scaling: the viewBox stretches with the panel, but a 2px
 * line stays 2px and a hairline stays a hairline at any width.
 */

const SERIES_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];
const RAMP_COLORS = [
  "var(--ramp-1)",
  "var(--ramp-2)",
  "var(--ramp-3)",
  "var(--ramp-4)",
  "var(--ramp-5)",
];

export const seriesColor = (i: number) => SERIES_COLORS[i % SERIES_COLORS.length] as string;
export const rampColor = (i: number) => RAMP_COLORS[i % RAMP_COLORS.length] as string;

/** Round the axis top to a 1/2/5 × 10ⁿ step so ticks read as clean numbers. */
function niceScale(max: number, ticks = 4): { top: number; step: number } {
  if (max <= 0) return { top: ticks, step: 1 };
  const rough = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  return { top: step * ticks, step };
}

/** 1_284 → "1,284"; 12_900 → "12.9K"; 4_200_000 → "4.2M". */
export function compact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (Math.abs(value) >= 10_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return fmtNumber(value);
}

/**
 * Thin the x-axis to every other label, counted back from the last so the
 * latest period is always named — counting from the first drops it whenever
 * the count is odd (12 months measured + 3 projected).
 */
const showAxisLabel = (i: number, count: number) => count <= 6 || (count - 1 - i) % 2 === 0;

/**
 * Geist sets the decimal point tight against the flat foot of a 2, and at
 * axis size the two merge: "12.5" reads as "125". A hair of tracking on the
 * tick labels keeps every point visible.
 */
const TICK_TRACKING = "0.06em";

/**
 * The plot keeps a legible floor width and scrolls inside its own box on a
 * narrow screen: squeezing a 12-week axis into 350px would render the tick
 * labels at ~5px, and WCAG 1.4.10 exempts data visualisations from reflow
 * precisely so they can stay readable. dir="rtl" puts the scroll origin at
 * the right edge, so a phone opens on the latest periods — the ones the
 * legend reports — instead of the oldest; each SVG resets to ltr so its text
 * anchors keep their meaning.
 *
 * Opening on the right would leave the y-axis scrolled out of view, so a copy
 * of its tick labels is pinned to the left edge. It shows only while the box
 * is narrower than the plot's floor width (a container query) — exactly when
 * the plot renders AT that floor, so the copy's fixed scale lines up.
 */
function PlotScroll({
  children,
  axis,
}: {
  children: ReactNode;
  /** A PinnedAxis for the plot inside. */
  axis: ReactNode;
}) {
  return (
    <div className="@container relative">
      <div dir="rtl" className="-mx-1 overflow-x-auto overflow-y-hidden px-1">
        {children}
      </div>
      {axis}
    </div>
  );
}

/** The y tick labels, drawn at the plot's floor-width scale for PlotScroll. */
function PinnedAxis({
  ticks,
  y,
  width,
  height,
  left,
  floorRem,
  hideClass,
}: {
  ticks: number[];
  y: (v: number) => number;
  /** The plot's viewBox width and height. */
  width: number;
  height: number;
  /** The plot's left padding, where its own labels sit. */
  left: number;
  /** The plot's min-width in rem: the width it renders at while scrolling. */
  floorRem: number;
  /** The container query that hides the copy once the plot fits. */
  hideClass: string;
}) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${left} ${height}`}
      className={cn("pointer-events-none absolute top-0 left-0", hideClass)}
      style={{
        width: `calc(${floorRem}rem * ${left / width})`,
        height: `calc(${floorRem}rem * ${height / width})`,
      }}
    >
      <rect width={left} height={height} fill="var(--card)" />
      {ticks.map((t) => (
        <text
          key={t}
          x={left - 8}
          y={y(t) + 3.5}
          textAnchor="end"
          fontSize="12"
          letterSpacing={TICK_TRACKING}
          className="num-col fill-muted-foreground"
        >
          {compact(t)}
        </text>
      ))}
    </svg>
  );
}

/**
 * A chart's table view: the same numbers as text, for anyone who cannot
 * hover — touch, keyboard, screen reader. A native <details>, so it opens
 * without client JavaScript and announces itself as a disclosure; the caption
 * names the chart, since one page can carry several of these.
 */
function ChartTable({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <details className="chart-table group mt-2">
      <summary className="touch-target min-h-8 w-fit cursor-pointer select-none gap-1 rounded-md text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50">
        <ChevronRight
          aria-hidden="true"
          className="size-3.5 transition-transform group-open:rotate-90"
        />
        View as table<span className="sr-only">: {caption}</span>
      </summary>
      <div className="mt-1 overflow-x-auto">
        <table className="w-full text-xs">
          <caption className="sr-only">{caption}</caption>
          {children}
        </table>
      </div>
    </details>
  );
}

const TH_COL = "py-1.5 font-medium text-muted-foreground";
const TH_ROW = "py-1.5 pr-4 text-left font-normal text-muted-foreground";
const TD_NUM = "num-col py-1.5 pl-4 text-right";
const TR = "border-b border-border/60 last:border-0";

export interface TrendSeries {
  key: string;
  label: string;
}
export interface TrendPoint {
  start: string;
  label: string;
  values: Record<string, number>;
}

/**
 * Multi-series trend over evenly spaced buckets. The first series carries a
 * gradient wash so the eye has an anchor; the rest are 2px lines — three
 * stacked translucent areas would just muddy each other.
 */
export function TrendChart({
  points,
  series,
  emptyNote = "No activity in this window yet.",
  height = 240,
  caption = "Weekly trend",
}: {
  points: TrendPoint[];
  series: TrendSeries[];
  emptyNote?: string;
  height?: number;
  /** Names the chart for its table view. */
  caption?: string;
}) {
  const W = 740;
  const H = height;
  // right padding holds the final x-axis label: the plot now lives in a scroll
  // box, so anything past the viewBox edge is clipped rather than overflowing.
  const pad = { top: 14, right: 30, bottom: 28, left: 40 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const all = points.flatMap((p) => series.map((s) => p.values[s.key] ?? 0));
  const total = all.reduce((sum, v) => sum + v, 0);
  const { top, step } = niceScale(Math.max(...all, 0));

  const x = (i: number) =>
    pad.left + (points.length < 2 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v: number) => pad.top + plotH - (v / top) * plotH;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const slotW = points.length < 2 ? plotW : plotW / (points.length - 1);
  // The readout sizes to its content: key, a value column as wide as the
  // longest figure in the window, then the longest series name.
  const valueRight = 28 + Math.max(1, ...all.map((v) => fmtNumber(v).length)) * 6.6;
  const boxW = Math.round(
    valueRight + 16 + Math.max(4, ...series.map((s) => s.label.length)) * 6.2,
  );

  const line = (key: string) =>
    points
      .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.values[key] ?? 0).toFixed(1)}`)
      .join(" ");
  const area = (key: string) =>
    `${line(key)} L${x(points.length - 1).toFixed(1)},${(pad.top + plotH).toFixed(1)} L${pad.left},${(pad.top + plotH).toFixed(1)} Z`;

  const summary = series
    .map(
      (s) => `${s.label}: ${fmtNumber(points.reduce((sum, p) => sum + (p.values[s.key] ?? 0), 0))}`,
    )
    .join("; ");

  return (
    <figure className="m-0">
      {/* Legend carries each series' latest value: identity plus the number,
          without end-labels colliding when the lines converge near zero. */}
      <figcaption className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1.5">
        {series.map((s, i) => (
          <span key={s.key} className="flex items-center gap-2 text-xs">
            {/* A line-key, not a dot: it carries the same chart-series-N class
                as the line itself, so under forced-colors — where every stroke
                collapses to one system colour — the legend picks up the same
                dash pattern the line does and identity survives. */}
            <svg
              aria-hidden="true"
              focusable="false"
              width="16"
              height="10"
              viewBox="0 0 16 10"
              className="shrink-0 overflow-visible"
            >
              <line
                x1="0"
                y1="5"
                x2="16"
                y2="5"
                stroke={seriesColor(i)}
                strokeWidth="2.5"
                strokeLinecap="round"
                className={`chart-series-${i + 1}`}
              />
            </svg>
            <span className="text-muted-foreground">{s.label}</span>
            <span className="num-col font-semibold text-foreground">
              {fmtNumber(points.at(-1)?.values[s.key] ?? 0)}
            </span>
          </span>
        ))}
        <span className="ml-auto text-[11px] text-muted-foreground">latest week</span>
      </figcaption>

      <PlotScroll
        axis={
          <PinnedAxis
            ticks={ticks}
            y={y}
            width={W}
            height={H}
            left={pad.left}
            floorRem={30}
            hideClass="@min-[30rem]:hidden"
          />
        }
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full min-w-[30rem] [direction:ltr]"
          role="img"
          aria-label={`Weekly trend over ${points.length} weeks. ${summary}.`}
        >
          <defs>
            <linearGradient id="trend-wash" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={seriesColor(0)} stopOpacity="0.18" />
              <stop offset="100%" stopColor={seriesColor(0)} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Gridlines + y ticks — recessive, hairline, solid */}
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={pad.left}
                x2={W - pad.right}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--border)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={pad.left - 8}
                y={y(t) + 3.5}
                textAnchor="end"
                fontSize="12"
                letterSpacing={TICK_TRACKING}
                className="num-col fill-muted-foreground"
              >
                {compact(t)}
              </text>
            </g>
          ))}

          {points.map((p, i) =>
            showAxisLabel(i, points.length) ? (
              <text
                key={p.start}
                x={x(i)}
                y={H - 9}
                textAnchor="middle"
                fontSize="12"
                className="fill-muted-foreground"
              >
                {p.label}
              </text>
            ) : null,
          )}

          {total === 0 ? (
            <text
              x={pad.left + plotW / 2}
              y={pad.top + plotH / 2}
              textAnchor="middle"
              fontSize="12"
              className="fill-muted-foreground"
            >
              {emptyNote}
            </text>
          ) : (
            <>
              <path d={area(series[0]?.key ?? "")} fill="url(#trend-wash)" className="chart-wash" />
              {series.map((s, i) => (
                <path
                  key={s.key}
                  d={line(s.key)}
                  fill="none"
                  stroke={seriesColor(i)}
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  className={`chart-series-${i + 1}`}
                />
              ))}
              {/* End markers: 2px surface ring keeps them legible where lines cross */}
              {series.map((s, i) => (
                <circle
                  key={s.key}
                  cx={x(points.length - 1)}
                  cy={y(points.at(-1)?.values[s.key] ?? 0)}
                  r="4"
                  fill={seriesColor(i)}
                  stroke="var(--card)"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </>
          )}

          {/* Hover layer: one slot per bucket, revealing its own crosshair and
            readout. Pure CSS — no client bundle. */}
          {points.map((p, i) => {
            const right = x(i) > pad.left + plotW * 0.6;
            const boxH = 22 + series.length * 16;
            const boxX = right ? x(i) - boxW - 10 : x(i) + 10;
            return (
              <g key={p.start} className="chart-slot">
                <rect
                  className="chart-hit"
                  x={x(i) - slotW / 2}
                  y={pad.top}
                  width={slotW}
                  height={plotH}
                />
                <title>
                  {`${p.label} — ${series.map((s) => `${s.label}: ${p.values[s.key] ?? 0}`).join(", ")}`}
                </title>
                <g className="chart-hover">
                  <line
                    x1={x(i)}
                    x2={x(i)}
                    y1={pad.top}
                    y2={pad.top + plotH}
                    stroke="var(--muted-foreground)"
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                  />
                  {series.map((s, si) => (
                    <circle
                      key={s.key}
                      cx={x(i)}
                      cy={y(p.values[s.key] ?? 0)}
                      r="4"
                      fill={seriesColor(si)}
                      stroke="var(--card)"
                      strokeWidth="2"
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                  <rect
                    x={boxX}
                    y={pad.top + 4}
                    width={boxW}
                    height={boxH}
                    rx="8"
                    fill="var(--popover)"
                    stroke="var(--border)"
                    vectorEffect="non-scaling-stroke"
                  />
                  <text
                    x={boxX + 10}
                    y={pad.top + 20}
                    fontSize="12"
                    className="fill-muted-foreground"
                  >
                    {p.label}
                  </text>
                  {/* Values lead, names follow: the reader already knows the
                      series and came for the number. Rows key with a short
                      stroke of the series colour — a line, like the legend. */}
                  {series.map((s, si) => (
                    <g key={s.key}>
                      <line
                        x1={boxX + 10}
                        x2={boxX + 22}
                        y1={pad.top + 32 + si * 16}
                        y2={pad.top + 32 + si * 16}
                        stroke={seriesColor(si)}
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                        className={`chart-series-${si + 1}`}
                      />
                      <text
                        x={boxX + valueRight}
                        y={pad.top + 35.5 + si * 16}
                        textAnchor="end"
                        fontSize="11"
                        fontWeight="600"
                        className="num-col fill-popover-foreground"
                      >
                        {fmtNumber(p.values[s.key] ?? 0)}
                      </text>
                      <text
                        x={boxX + valueRight + 6}
                        y={pad.top + 35.5 + si * 16}
                        fontSize="11"
                        className="fill-muted-foreground"
                      >
                        {s.label}
                      </text>
                    </g>
                  ))}
                </g>
              </g>
            );
          })}
        </svg>
      </PlotScroll>

      <ChartTable caption={caption}>
        <thead>
          <tr className={TR}>
            <th scope="col" className={cn(TH_COL, "pr-4 text-left")}>
              Week starting
            </th>
            {series.map((s) => (
              <th key={s.key} scope="col" className={cn(TH_COL, "pl-4 text-right")}>
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.start} className={TR}>
              <th scope="row" className={TH_ROW}>
                {p.label}
              </th>
              {series.map((s) => (
                <td key={s.key} className={TD_NUM}>
                  {fmtNumber(p.values[s.key] ?? 0)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </ChartTable>
    </figure>
  );
}

/**
 * One measured series, optionally continued by a projection. The projection is
 * drawn dashed beyond a labelled boundary so a reader can never mistake a
 * model's output for a recorded fact — the distinction a forecast lives or
 * dies on. A single series needs no legend: the panel title names it.
 *
 * A null in `history` is a period with nothing to measure — a month without a
 * quotation has no average price — so the line breaks there instead of
 * diving to a zero that never happened.
 */
export function ForecastChart({
  labels,
  history,
  forecast = [],
  height = 220,
  emptyNote = "Not enough history yet.",
  baseline = "zero",
  format = fmtNumber,
  gapNote = "no data",
  caption = "Series values",
}: {
  /** One label per point, history first then forecast. */
  labels: string[];
  history: (number | null)[];
  forecast?: number[];
  height?: number;
  emptyNote?: string;
  /**
   * "zero" for counts, where the distance from nothing is the point. "fit" for
   * a price or rate, where zero is not a meaningful floor and a zero-based
   * axis flattens the whole story into the middle third. A fitted axis drops
   * the area wash — a filled region below a non-zero baseline would overstate
   * the magnitude it appears to encode.
   */
  baseline?: "zero" | "fit";
  /** Formats a value for the readout and the table — money, say. */
  format?: (value: number) => string;
  /** What a gap means, for the readout and the table: "no quotations". */
  gapNote?: string;
  /** Names the chart for its table view. */
  caption?: string;
}) {
  // Sized for the half-width panels it lives in, so its 12-unit labels render
  // near 12px there instead of shrinking to ~8px in a 740-unit box.
  const W = 600;
  const H = height;
  // right padding holds the final x-axis label: the plot now lives in a scroll
  // box, so anything past the viewBox edge is clipped rather than overflowing.
  const pad = { top: 14, right: 30, bottom: 28, left: 40 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const measured = history.filter((v): v is number => v !== null);
  const values = [...measured, ...forecast];
  if (values.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{emptyNote}</p>;
  }

  const count = history.length + forecast.length;
  const dataMax = Math.max(...values, 0);
  const dataMin = Math.min(...values, dataMax);
  const fitted = baseline === "fit" && dataMin > 0 && dataMax - dataMin < dataMin;
  const { top, step } = fitted ? niceScale(dataMax - dataMin, 4) : niceScale(dataMax);
  const bottom = fitted ? Math.max(0, Math.floor(dataMin / step) * step) : 0;
  const ceiling = fitted ? bottom + top : top;

  const x = (i: number) => pad.left + (count < 2 ? plotW / 2 : (i / (count - 1)) * plotW);
  const y = (v: number) =>
    pad.top + plotH - ((v - bottom) / Math.max(1e-6, ceiling - bottom)) * plotH;
  // Rounded, not truncated: (ceiling - bottom) / step can land a hair under a
  // whole number in floating point and silently drop the top tick.
  const ticks = Array.from(
    { length: Math.round((ceiling - bottom) / step) + 1 },
    (_, i) => bottom + i * step,
  );
  const slotW = count < 2 ? plotW : plotW / (count - 1);
  const color = seriesColor(0);
  // Axis positions carry their own identity: month labels repeat across years
  // ("Aug" twice), so a stable id is minted here rather than keyed on the label.
  const slots = [...history, ...forecast].map((value, i) => ({
    id: `slot-${i}`,
    value,
    i,
    label: labels[i] ?? "",
    projected: i > history.length - 1,
  }));

  // Consecutive measured points form a run; each run is its own line and a
  // run of one is a dot, so a gap in the data stays a gap on the page.
  const runs: Array<Array<{ i: number; v: number }>> = [];
  history.forEach((v, i) => {
    if (v === null) return;
    const run = runs.at(-1);
    if (run && run.at(-1)?.i === i - 1) run.push({ i, v });
    else runs.push([{ i, v }]);
  });
  const lastIndex = history.findLastIndex((v) => v !== null);
  const lastValue = history[lastIndex] ?? null;
  const path = (points: Array<{ i: number; v: number }>) =>
    points
      .map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`)
      .join(" ");
  // The projection starts at the last measured point so the two paths meet —
  // unless that period is a gap, in which case it starts on its own.
  const projected = forecast.length
    ? path([
        ...(lastIndex === history.length - 1 && lastValue !== null
          ? [{ i: lastIndex, v: lastValue }]
          : []),
        ...forecast.map((v, k) => ({ i: history.length + k, v })),
      ])
    : "";
  const gaps = history.length - measured.length;

  return (
    <figure className="m-0">
      <PlotScroll
        axis={
          <PinnedAxis
            ticks={ticks}
            y={y}
            width={W}
            height={H}
            left={pad.left}
            floorRem={26}
            hideClass="@min-[26rem]:hidden"
          />
        }
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full min-w-[26rem] [direction:ltr]"
          role="img"
          aria-label={`${measured.length} measured point${measured.length === 1 ? "" : "s"}${
            gaps ? ` (${gaps} period${gaps === 1 ? "" : "s"} with ${gapNote})` : ""
          }${forecast.length ? `, then ${forecast.length} projected` : ""}.${
            lastValue === null ? "" : ` Latest measured value ${format(lastValue)}.`
          }`}
        >
          <defs>
            <linearGradient id="forecast-wash" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.18" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>

          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={pad.left}
                x2={W - pad.right}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--border)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={pad.left - 8}
                y={y(t) + 3.5}
                textAnchor="end"
                fontSize="12"
                letterSpacing={TICK_TRACKING}
                className="num-col fill-muted-foreground"
              >
                {compact(t)}
              </text>
            </g>
          ))}

          {slots.map(({ id, label, i }) =>
            showAxisLabel(i, count) ? (
              <text
                key={id}
                x={x(i)}
                y={H - 9}
                textAnchor="middle"
                fontSize="12"
                className="fill-muted-foreground"
              >
                {label}
              </text>
            ) : null,
          )}

          {!fitted &&
            runs
              .filter((run) => run.length > 1)
              .map((run) => (
                <path
                  key={`wash-${run[0]?.i}`}
                  d={`${path(run)} L${x(run.at(-1)?.i ?? 0).toFixed(1)},${(pad.top + plotH).toFixed(1)} L${x(run[0]?.i ?? 0).toFixed(1)},${(pad.top + plotH).toFixed(1)} Z`}
                  fill="url(#forecast-wash)"
                  className="chart-wash"
                />
              ))}
          {runs.map((run) =>
            run.length > 1 ? (
              <path
                key={`run-${run[0]?.i}`}
                d={path(run)}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ) : null,
          )}
          {/* Where the data has gaps, every run's ends are marked (a run of
              one is just its dot), so a reader sees where each stretch of
              measurement starts and stops. The latest point gets the end
              marker below either way. */}
          {runs
            .flatMap((run) =>
              gaps > 0 || run.length === 1 ? [run[0], run.length > 1 ? run.at(-1) : undefined] : [],
            )
            .filter((p): p is { i: number; v: number } => p !== undefined && p.i !== lastIndex)
            .map((p) => (
              <circle
                key={`end-${p.i}`}
                cx={x(p.i)}
                cy={y(p.v)}
                r="4"
                fill={color}
                stroke="var(--card)"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          {forecast.length > 0 && (
            <>
              {/* Boundary between what happened and what is projected */}
              <line
                x1={x(history.length - 1)}
                x2={x(history.length - 1)}
                y1={pad.top}
                y2={pad.top + plotH}
                stroke="var(--border)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={x(history.length - 1) + 6}
                y={pad.top + 11}
                fontSize="11"
                className="fill-muted-foreground"
              >
                projected
              </text>
              <path
                d={projected}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeDasharray="6 5"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                opacity="0.85"
              />
            </>
          )}
          {lastValue !== null && (
            <circle
              cx={x(lastIndex)}
              cy={y(lastValue)}
              r="4"
              fill={color}
              stroke="var(--card)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          )}

          {slots.map(({ id, value: v, i, label, projected: isProjected }) => {
            const right = x(i) > pad.left + plotW * 0.6;
            const boxW = 116;
            const boxX = right ? x(i) - boxW - 10 : x(i) + 10;
            return (
              <g key={id} className="chart-slot">
                <rect
                  className="chart-hit"
                  x={x(i) - slotW / 2}
                  y={pad.top}
                  width={slotW}
                  height={plotH}
                />
                <title>
                  {`${label}: ${v === null ? gapNote : format(v)}${isProjected ? " (projected)" : ""}`}
                </title>
                <g className="chart-hover">
                  <line
                    x1={x(i)}
                    x2={x(i)}
                    y1={pad.top}
                    y2={pad.top + plotH}
                    stroke="var(--muted-foreground)"
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                  />
                  {v !== null && (
                    <circle
                      cx={x(i)}
                      cy={y(v)}
                      r="4"
                      fill={color}
                      stroke="var(--card)"
                      strokeWidth="2"
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                  <rect
                    x={boxX}
                    y={pad.top + 4}
                    width={boxW}
                    height={isProjected ? 54 : 40}
                    rx="8"
                    fill="var(--popover)"
                    stroke="var(--border)"
                    vectorEffect="non-scaling-stroke"
                  />
                  <text
                    x={boxX + 10}
                    y={pad.top + 20}
                    fontSize="12"
                    className="fill-muted-foreground"
                  >
                    {label}
                  </text>
                  <text
                    x={boxX + 10}
                    y={pad.top + 36}
                    fontSize={v === null ? "12" : "13"}
                    fontWeight={v === null ? "400" : "600"}
                    className={v === null ? "fill-muted-foreground" : "fill-popover-foreground"}
                  >
                    {v === null ? gapNote : format(v)}
                  </text>
                  {isProjected && (
                    <text
                      x={boxX + 10}
                      y={pad.top + 50}
                      fontSize="10.5"
                      className="fill-muted-foreground"
                    >
                      projected
                    </text>
                  )}
                </g>
              </g>
            );
          })}
        </svg>
      </PlotScroll>

      <ChartTable caption={caption}>
        <thead>
          <tr className={TR}>
            <th scope="col" className={cn(TH_COL, "pr-4 text-left")}>
              Period
            </th>
            <th scope="col" className={cn(TH_COL, "pl-4 text-right")}>
              Value
            </th>
            {forecast.length > 0 && (
              <th scope="col" className={cn(TH_COL, "pl-4 text-right")}>
                Measured or projected
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {slots.map(({ id, label, value, projected }) => (
            <tr key={id} className={TR}>
              <th scope="row" className={TH_ROW}>
                {label}
              </th>
              <td className={cn(TD_NUM, value === null && "text-muted-foreground")}>
                {value === null ? gapNote : format(value)}
              </td>
              {forecast.length > 0 && (
                <td className="py-1.5 pl-4 text-right text-muted-foreground">
                  {projected ? "projected" : "measured"}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </ChartTable>
    </figure>
  );
}

/**
 * 12-point sparkline for a stat tile. One series, no axes — it shows shape,
 * not values; the tile's own figure carries the number. The history recedes
 * in the de-emphasis grey and only the current period wears the accent, so
 * the eye lands on where things stand now.
 */
export function Sparkline({
  points,
  className,
  accent = "var(--chart-1)",
}: {
  points: number[];
  className?: string;
  accent?: string;
}) {
  if (points.length < 2) return null;
  const W = 72;
  const H = 26;
  const max = Math.max(...points, 1);
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => H - 2 - (v / max) * (H - 6);
  const d = points
    .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      className={cn("shrink-0 overflow-visible", className)}
      aria-hidden="true"
      focusable="false"
    >
      <path d={`${d} L${W},${H} L0,${H} Z`} fill="var(--muted-foreground)" opacity="0.08" />
      <path
        d={d}
        fill="none"
        stroke="var(--muted-foreground)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={x(points.length - 1)} cy={y(points.at(-1) ?? 0)} r="3" fill={accent} />
    </svg>
  );
}

export interface Slice {
  key: string;
  label: string;
  count: number;
}

/** A stage name over two lines when it would not fit across the ring's hole. */
function splitLabel(label: string, max = 13): string[] {
  if (label.length <= max) return [label];
  const mid = label.length / 2;
  let cut = -1;
  for (let i = 0; i < label.length; i++) {
    if (label[i] === " " && (cut < 0 || Math.abs(i - mid) < Math.abs(cut - mid))) cut = i;
  }
  return cut < 0 ? [label] : [label.slice(0, cut), label.slice(cut + 1)];
}

/**
 * Stage mix as a donut with a hole big enough for the total. Slices take the
 * ORDINAL ramp because the stages are a sequence — a reader should see the
 * order in the colour — and a 2px surface gap separates them instead of a
 * stroke, which would add ink that isn't data. Hovering a slice puts its own
 * count and stage in the hole and dims the rest (CSS only); the legend below
 * carries every value as text, so hover is never the only way in.
 */
export function StageDonut({
  slices,
  centerLabel,
  emptyNote = "Nothing in the pipeline.",
}: {
  slices: Slice[];
  centerLabel: string;
  emptyNote?: string;
}) {
  const total = slices.reduce((sum, s) => sum + s.count, 0);
  const size = 168;
  const c = size / 2;
  const r = 62;
  const C = 2 * Math.PI * r;
  const gap = 2;
  const share = (count: number) => Math.round((count / total) * 100);
  let offset = 0;

  // Stacked, never side-by-side: this panel is a third of the grid, and a
  // legend squeezed beside the ring truncates its own stage names.
  return (
    <div className="flex flex-col items-center gap-5">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="donut size-[168px] shrink-0"
        role="img"
        aria-label={
          total === 0
            ? emptyNote
            : `${total} in total. ${slices
                .filter((s) => s.count > 0)
                .map((s) => `${s.label}: ${s.count}`)
                .join(", ")}.`
        }
      >
        {/* The empty ring only: with data, the gaps between slices must show
            the card itself, not a grey track behind them. */}
        {total === 0 && (
          <circle cx={c} cy={c} r={r} fill="none" stroke="var(--muted)" strokeWidth="18" />
        )}
        {total > 0 &&
          slices.map((s, i) => {
            if (s.count === 0) return null;
            const len = (s.count / total) * C;
            const dash = Math.max(len - gap, 1);
            const ring = {
              cx: c,
              cy: c,
              r,
              fill: "none",
              strokeDasharray: `${dash} ${C - dash}`,
              strokeDashoffset: -offset,
              transform: `rotate(-90 ${c} ${c})`,
            };
            offset += len;
            const lines = splitLabel(s.label);
            return (
              <g key={s.key} className="donut-slice">
                <circle {...ring} className="donut-arc" stroke={rampColor(i)} strokeWidth="18" />
                {/* Hit target wider than the painted arc, per the hover spec. */}
                <circle {...ring} className="donut-hit" stroke="transparent" strokeWidth="30" />
                <title>{`${s.label}: ${fmtNumber(s.count)} (${share(s.count)}%)`}</title>
                {/* No aria-hidden needed: role="img" on the svg already makes
                    everything inside it presentational to assistive tech. */}
                <g className="donut-detail">
                  <text
                    x={c}
                    y={lines.length > 1 ? c - 6 : c - 2}
                    textAnchor="middle"
                    fontSize="24"
                    fontWeight="600"
                    letterSpacing="-0.02em"
                    className="fill-foreground"
                  >
                    {compact(s.count)}
                  </text>
                  {lines.map((part, k) => (
                    <text
                      key={part}
                      x={c}
                      y={(lines.length > 1 ? c + 11 : c + 15) + k * 13}
                      textAnchor="middle"
                      fontSize="11"
                      className="fill-muted-foreground"
                    >
                      {part}
                    </text>
                  ))}
                </g>
              </g>
            );
          })}
        <g className="donut-total">
          <text
            x={c}
            y={c - 2}
            textAnchor="middle"
            fontSize="27"
            fontWeight="600"
            letterSpacing="-0.02em"
            className="fill-foreground"
          >
            {compact(total)}
          </text>
          <text
            x={c}
            y={c + 16}
            textAnchor="middle"
            fontSize="12"
            className="fill-muted-foreground"
          >
            {centerLabel}
          </text>
        </g>
      </svg>

      <ul className="w-full min-w-0 space-y-2">
        {total === 0 ? (
          <li className="text-center text-sm text-muted-foreground">{emptyNote}</li>
        ) : (
          slices.map((s, i) => (
            <li key={s.key} className="flex items-center gap-2.5 text-xs">
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-[3px]"
                style={{ background: rampColor(i) }}
              />
              <span className="min-w-0 flex-1 text-muted-foreground">{s.label}</span>
              <span className="num-col font-semibold">{fmtNumber(s.count)}</span>
              <span className="num-col w-9 text-right text-muted-foreground">
                {share(s.count)}%
              </span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

/**
 * Labelled progress bar. The fill carries severity; the track is a lighter
 * step of the same ramp so the state reads across the whole bar. A state
 * worth flagging also gets an icon and words — colour never carries a status
 * alone — and the figures stay in text ink, not the status colour.
 */
export function Meter({
  label,
  used,
  limit,
  unlimitedNote = "unlimited on your tier",
  caption,
}: {
  label: string;
  used: number;
  limit: number | null;
  unlimitedNote?: string;
  caption?: string;
}) {
  if (limit === null) {
    return (
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">{unlimitedNote}</span>
      </div>
    );
  }
  const pct = Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  // Track is a lighter step of whatever hue the fill is wearing, so severity
  // reads across the whole bar rather than only the filled part.
  const tone =
    pct >= 100
      ? {
          fill: "bg-destructive",
          track: "bg-destructive/15",
          note: "Limit reached",
          Icon: OctagonAlert,
          ink: "text-destructive-accent",
        }
      : pct >= 80
        ? {
            fill: "bg-warning",
            track: "bg-warning/18",
            note: "Nearly used",
            Icon: TriangleAlert,
            ink: "text-warning",
          }
        : { fill: "bg-primary", track: "bg-primary/12", note: null, Icon: null, ink: "" };
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="flex items-baseline gap-2">
          {tone.note && tone.Icon && (
            <span
              className={cn("inline-flex items-center gap-1 text-[11px] font-medium", tone.ink)}
            >
              <tone.Icon aria-hidden="true" className="size-3 self-center" />
              {tone.note}
            </span>
          )}
          <span className="num-col text-xs font-medium text-muted-foreground">
            {fmtNumber(used)} / {fmtNumber(limit)}
          </span>
        </span>
      </div>
      <div
        className={cn("h-1.5 overflow-hidden rounded-full", tone.track)}
        role="progressbar"
        aria-label={label}
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuetext={`${fmtNumber(used)} of ${fmtNumber(limit)}${tone.note ? ` — ${tone.note.toLowerCase()}` : ""}`}
      >
        <div className={cn("h-full rounded-full", tone.fill)} style={{ width: `${pct}%` }} />
      </div>
      {caption && <p className="text-[11px] text-muted-foreground">{caption}</p>}
    </div>
  );
}
