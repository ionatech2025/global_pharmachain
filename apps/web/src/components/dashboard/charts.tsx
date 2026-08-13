import { cn } from "@pharmachain/ui/lib/utils";
import { fmtNumber } from "@/lib/format";

/*
 * Server-rendered SVG charts. Three rules hold across all of them:
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
}: {
  points: TrendPoint[];
  series: TrendSeries[];
  emptyNote?: string;
  height?: number;
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
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  const slotW = points.length < 2 ? plotW : plotW / (points.length - 1);

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

      {/* The plot keeps a legible floor width and scrolls inside its own box
          on a narrow screen. Squeezing a 12-week axis into 350px would render
          the tick labels at ~5px; WCAG 1.4.10 exempts data visualisations from
          reflow precisely so they can stay readable. */}
      <div className="-mx-1 overflow-x-auto overflow-y-hidden px-1">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full min-w-[30rem]"
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
              />
              <text
                x={pad.left - 8}
                y={y(t) + 3.5}
                textAnchor="end"
                fontSize="12"
                className="num-col fill-muted-foreground"
              >
                {compact(t)}
              </text>
            </g>
          ))}

          {/* x labels — every other bucket, anchored so the last one always shows */}
          {points.map((p, i) =>
            i % 2 === 1 || points.length <= 6 ? (
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
                />
              ))}
            </>
          )}

          {/* Hover layer: one slot per bucket, revealing its own crosshair and
            readout. Pure CSS — no client bundle. */}
          {points.map((p, i) => {
            const right = x(i) > pad.left + plotW * 0.6;
            const boxW = 138;
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
                  />
                  <text
                    x={boxX + 10}
                    y={pad.top + 20}
                    fontSize="12"
                    className="fill-muted-foreground"
                  >
                    {p.label}
                  </text>
                  {series.map((s, si) => (
                    <g key={s.key}>
                      <circle
                        cx={boxX + 14}
                        cy={pad.top + 32 + si * 16}
                        r="3.5"
                        fill={seriesColor(si)}
                      />
                      <text
                        x={boxX + 23}
                        y={pad.top + 35.5 + si * 16}
                        fontSize="11"
                        className="fill-popover-foreground"
                      >
                        {s.label}
                      </text>
                      <text
                        x={boxX + boxW - 10}
                        y={pad.top + 35.5 + si * 16}
                        textAnchor="end"
                        fontSize="11"
                        fontWeight="600"
                        className="num-col fill-popover-foreground"
                      >
                        {fmtNumber(p.values[s.key] ?? 0)}
                      </text>
                    </g>
                  ))}
                </g>
              </g>
            );
          })}
        </svg>
      </div>

      {/* The same numbers as a real table, for screen readers and anyone who
          wants the values rather than the shape. A chart is a picture of data;
          the data itself must still be reachable.
          The wrapper carries sr-only, not the table: a table box ignores the
          1px clamp and grows to fit its content, which silently widened the
          page on a phone. */}
      <div className="sr-only">
        <table>
          <caption>Weekly trend</caption>
          <thead>
            <tr>
              <th scope="col">Week starting</th>
              {series.map((s) => (
                <th key={s.key} scope="col">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.start}>
                <th scope="row">{p.label}</th>
                {series.map((s) => (
                  <td key={s.key}>{fmtNumber(p.values[s.key] ?? 0)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

/**
 * One measured series, optionally continued by a projection. The projection is
 * drawn dashed beyond a labelled boundary so a reader can never mistake a
 * model's output for a recorded fact — the distinction a forecast lives or
 * dies on. A single series needs no legend: the panel title names it.
 */
export function ForecastChart({
  labels,
  history,
  forecast = [],
  height = 220,
  emptyNote = "Not enough history yet.",
  baseline = "zero",
}: {
  /** One label per point, history first then forecast. */
  labels: string[];
  history: number[];
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
}) {
  const W = 740;
  const H = height;
  // right padding holds the final x-axis label: the plot now lives in a scroll
  // box, so anything past the viewBox edge is clipped rather than overflowing.
  const pad = { top: 14, right: 30, bottom: 28, left: 40 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const all = [...history, ...forecast];
  const dataMax = Math.max(...all, 0);
  const dataMin = Math.min(...all, dataMax);
  const fitted = baseline === "fit" && dataMin > 0 && dataMax - dataMin < dataMin;
  const { top, step } = fitted ? niceScale(dataMax - dataMin, 4) : niceScale(dataMax);
  const bottom = fitted ? Math.max(0, Math.floor(dataMin / step) * step) : 0;
  const ceiling = fitted ? bottom + top : top;

  const x = (i: number) => pad.left + (all.length < 2 ? plotW / 2 : (i / (all.length - 1)) * plotW);
  const y = (v: number) =>
    pad.top + plotH - ((v - bottom) / Math.max(1e-6, ceiling - bottom)) * plotH;
  const ticks = Array.from({ length: (ceiling - bottom) / step + 1 }, (_, i) => bottom + i * step);
  const slotW = all.length < 2 ? plotW : plotW / (all.length - 1);
  const color = seriesColor(0);
  // Axis positions carry their own identity: month labels repeat across years
  // ("Aug" twice), so a stable id is minted here rather than keyed on the label.
  const slots = all.map((value, i) => ({
    id: `slot-${i}`,
    value,
    i,
    label: labels[i] ?? "",
    projected: i > history.length - 1,
  }));

  const path = (values: number[], from: number) =>
    values
      .map((v, i) => `${i === 0 ? "M" : "L"}${x(from + i).toFixed(1)},${y(v).toFixed(1)}`)
      .join(" ");
  // The projection starts at the last measured point so the two paths meet.
  const projected = forecast.length
    ? path([history.at(-1) ?? 0, ...forecast], history.length - 1)
    : "";

  if (all.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{emptyNote}</p>;
  }

  return (
    <figure className="m-0">
      {/* Legible floor width; scrolls inside its own box on a narrow screen. */}
      <div className="-mx-1 overflow-x-auto overflow-y-hidden px-1">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full min-w-[30rem]"
          role="img"
          aria-label={`${history.length} measured points${
            forecast.length ? `, then ${forecast.length} projected points` : ""
          }. Latest measured value ${fmtNumber(history.at(-1) ?? 0)}.`}
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
              />
              <text
                x={pad.left - 8}
                y={y(t) + 3.5}
                textAnchor="end"
                fontSize="12"
                className="num-col fill-muted-foreground"
              >
                {compact(t)}
              </text>
            </g>
          ))}

          {slots.map(({ id, label, i }) =>
            i % 2 === 1 || slots.length <= 6 ? (
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

          {history.length > 1 && !fitted && (
            <path
              d={`${path(history, 0)} L${x(history.length - 1).toFixed(1)},${(pad.top + plotH).toFixed(1)} L${pad.left},${(pad.top + plotH).toFixed(1)} Z`}
              fill="url(#forecast-wash)"
              className="chart-wash"
            />
          )}
          <path
            d={path(history, 0)}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
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
              />
              <text
                x={x(history.length - 1) + 6}
                y={pad.top + 10}
                fontSize="10"
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
                opacity="0.85"
              />
            </>
          )}
          <circle
            cx={x(history.length - 1)}
            cy={y(history.at(-1) ?? 0)}
            r="4"
            fill={color}
            stroke="var(--card)"
            strokeWidth="2"
          />

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
                <title>{`${label}: ${fmtNumber(v)}${isProjected ? " (projected)" : ""}`}</title>
                <g className="chart-hover">
                  <line
                    x1={x(i)}
                    x2={x(i)}
                    y1={pad.top}
                    y2={pad.top + plotH}
                    stroke="var(--muted-foreground)"
                    strokeWidth="1"
                  />
                  <circle
                    cx={x(i)}
                    cy={y(v)}
                    r="4"
                    fill={color}
                    stroke="var(--card)"
                    strokeWidth="2"
                  />
                  <rect
                    x={boxX}
                    y={pad.top + 4}
                    width={boxW}
                    height={isProjected ? 52 : 40}
                    rx="8"
                    fill="var(--popover)"
                    stroke="var(--border)"
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
                    fontSize="13"
                    fontWeight="600"
                    className="fill-popover-foreground"
                  >
                    {fmtNumber(v)}
                  </text>
                  {isProjected && (
                    <text
                      x={boxX + 10}
                      y={pad.top + 49}
                      fontSize="9.5"
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
      </div>

      {/* Measured and projected values as a real table, for screen readers.
          sr-only rides the wrapper — see the note in TrendChart. */}
      <div className="sr-only">
        <table>
          <caption>Series values</caption>
          <thead>
            <tr>
              <th scope="col">Period</th>
              <th scope="col">Value</th>
              <th scope="col">Measured or projected</th>
            </tr>
          </thead>
          <tbody>
            {slots.map(({ id, label, value, projected }) => (
              <tr key={id}>
                <th scope="row">{label}</th>
                <td>{fmtNumber(value)}</td>
                <td>{projected ? "projected" : "measured"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

/**
 * 12-point sparkline for a stat tile. One series, no axes — it shows shape,
 * not values; the tile's own figure carries the number.
 */
export function Sparkline({
  points,
  className,
  color = "var(--chart-1)",
}: {
  points: number[];
  className?: string;
  color?: string;
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
      <path d={`${d} L${W},${H} L0,${H} Z`} fill={color} opacity="0.1" />
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={x(points.length - 1)} cy={y(points.at(-1) ?? 0)} r="2.5" fill={color} />
    </svg>
  );
}

export interface Slice {
  key: string;
  label: string;
  count: number;
}

/**
 * Stage mix as a donut with a hole big enough for the total. Slices take the
 * ORDINAL ramp because the stages are a sequence — a reader should see the
 * order in the colour — and a 2px surface gap separates them instead of a
 * stroke, which would add ink that isn't data.
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
  const r = 62;
  const C = 2 * Math.PI * r;
  const gap = total > 0 ? 3 : 0;
  let offset = 0;

  // Stacked, never side-by-side: this panel is a third of the grid, and a
  // legend squeezed beside the ring truncates its own stage names.
  return (
    <div className="flex flex-col items-center gap-5">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="size-[168px] shrink-0"
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
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--muted)"
            strokeWidth="18"
          />
          {total > 0 &&
            slices.map((s, i) => {
              if (s.count === 0) return null;
              const len = (s.count / total) * C;
              const dash = Math.max(len - gap, 1);
              const el = (
                <circle
                  key={s.key}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={rampColor(i)}
                  strokeWidth="18"
                  strokeDasharray={`${dash} ${C - dash}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += len;
              return el;
            })}
        </g>
        <text
          x={size / 2}
          y={size / 2 - 2}
          textAnchor="middle"
          fontSize="27"
          fontWeight="600"
          letterSpacing="-0.02em"
          className="fill-foreground"
        >
          {compact(total)}
        </text>
        <text
          x={size / 2}
          y={size / 2 + 16}
          textAnchor="middle"
          fontSize="12"
          className="fill-muted-foreground"
        >
          {centerLabel}
        </text>
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
                {Math.round((s.count / total) * 100)}%
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
 * step of the same ramp so the state reads across the whole bar.
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
      ? { fill: "bg-destructive", track: "bg-destructive/15", text: "text-destructive" }
      : pct >= 80
        ? { fill: "bg-warning", track: "bg-warning/18", text: "text-warning" }
        : { fill: "bg-primary", track: "bg-primary/12", text: "text-muted-foreground" };
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className={cn("num-col text-xs font-medium", tone.text)}>
          {fmtNumber(used)} / {fmtNumber(limit)}
        </span>
      </div>
      <div
        className={cn("h-1.5 overflow-hidden rounded-full", tone.track)}
        role="progressbar"
        aria-label={label}
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={limit}
      >
        <div className={cn("h-full rounded-full", tone.fill)} style={{ width: `${pct}%` }} />
      </div>
      {caption && <p className="text-[11px] text-muted-foreground">{caption}</p>}
    </div>
  );
}
