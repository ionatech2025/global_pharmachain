import { cn } from "@pharmachain/ui/lib/utils";
import { Pause, Play } from "lucide-react";
import { type CSSProperties, useId } from "react";

/**
 * Animated glass trade-globe: a glass orb carrying a wireframe sphere whose
 * branded azure lines read clearly in BOTH themes (var(--globe-line)). The
 * globe turns — the meridian group spins 360° around the centre so the
 * longitude lines sweep through every angle (the reference hero's technique)
 * while the latitude bands stay put — plus lights travelling the supply
 * routes, pulsing hubs, a twinkling starfield, a rotating specular sheen and a
 * spinning orbit ring. Pure inline SVG/CSS — no canvas, no runtime JS, no
 * external assets. Square 360×360 space so a rounded-full glass layer aligns
 * with the sphere. Adapted from The Drop's hero.
 *
 * What it may cost. The 2026-10-25 audit stilled the whole globe because the
 * orb carried backdrop-filter inside a 3D-tilting layer and the routes ran
 * through an feGaussianBlur glow, so both blurs were re-rendered every frame.
 * When the motion came back (2026-10-30) those stayed out, and measurement
 * removed two more: the 3D tilt (it doubled the cost of every frame) and the
 * dash sweep along the routes (it repainted them every frame). What moves now
 * is rotation and opacity — the route lights too. Before adding motion
 * here, measure it: docs/2026-10-qa-accessibility-hercules-audit.md.
 *
 * Motion that loops beside other content must be stoppable (WCAG 2.2.2):
 * GlobeMotionToggle pauses it, and the global prefers-reduced-motion kill
 * switch stops it outright. Delays are negative so every loop starts mid-cycle
 * instead of showing its resting frame first.
 */
const R = 150;
const CX = 180;
const CY = 180;

// A meridian at rotation θ projects to an ellipse of horizontal radius R·|cosθ|.
const MERIDIANS = [0, 30, 60, 90, 120, 150].map(
  (deg) => Math.abs(Math.cos((deg * Math.PI) / 180)) * R,
);
// Parallels: latitude bands as foreshortened ellipses.
const PARALLELS = [-60, -30, 0, 30, 60].map((lat) => {
  const rad = (lat * Math.PI) / 180;
  return { cy: CY - Math.sin(rad) * R, rx: Math.cos(rad) * R, ry: Math.cos(rad) * R * 0.3 };
});
type Point = readonly [number, number];
/**
 * A route leg as the circular arc from `from` to `to` through the midpoint of
 * the curve bending towards `via`. A light travels it by rotating about the
 * arc's centre — a transform, which needs no repaint, where a motion path
 * (offset-distance) cost ~200 ms of main thread a second (2026-10-30).
 */
function routeArc(from: Point, via: Point, to: Point, delay: string) {
  const [x1, y1] = from;
  const [x3, y3] = to;
  const x2 = 0.25 * x1 + 0.5 * via[0] + 0.25 * x3;
  const y2 = 0.25 * y1 + 0.5 * via[1] + 0.25 * y3;
  const det = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2));
  const [s1, s2, s3] = [x1 * x1 + y1 * y1, x2 * x2 + y2 * y2, x3 * x3 + y3 * y3];
  const cx = (s1 * (y2 - y3) + s2 * (y3 - y1) + s3 * (y1 - y2)) / det;
  const cy = (s1 * (x3 - x2) + s2 * (x1 - x3) + s3 * (x2 - x1)) / det;
  const r = Math.hypot(x1 - cx, y1 - cy);
  // Start → end the short way round (through the midpoint); positive is
  // clockwise on screen, for SVG's sweep flag and CSS rotate alike.
  let sweep = Math.atan2(y3 - cy, x3 - cx) - Math.atan2(y1 - cy, x1 - cx);
  if (sweep > Math.PI) sweep -= 2 * Math.PI;
  if (sweep < -Math.PI) sweep += 2 * Math.PI;
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    d: `M ${x1} ${y1} A ${round(r)} ${round(r)} 0 0 ${sweep > 0 ? 1 : 0} ${x3} ${y3}`,
    from,
    origin: `${round(cx)}px ${round(cy)}px`,
    sweep: `${round((sweep * 180) / Math.PI)}deg`,
    delay,
  };
}
// Great-circle route legs across the visible face, staggered (4.5s cycle) so
// the lights chain.
const ARCS = [
  routeArc([95, 150], [150, 175], [200, 120], "0s"),
  routeArc([200, 120], [212, 155], [250, 175], "-3.4s"),
  routeArc([250, 175], [272, 205], [300, 210], "-2.3s"),
  routeArc([90, 225], [150, 200], [200, 120], "-1.5s"),
];
const NODES = [
  { cx: 95, cy: 150 },
  { cx: 200, cy: 120 },
  { cx: 250, cy: 175 },
  { cx: 300, cy: 210 },
  { cx: 90, cy: 225 },
];
const STARS = [
  [28, 55],
  [332, 80],
  [55, 300],
  [322, 312],
  [24, 175],
  [336, 225],
  [120, 28],
  [300, 36],
];

export function HeroGlobe({ className, aurora = true }: { className?: string; aurora?: boolean }) {
  const uid = useId().replace(/:/g, "");
  const arcGrad = `arc-${uid}`;
  const meridGrad = `merid-${uid}`;
  return (
    // `relative` is load-bearing, not decorative: the internal layers below
    // (aurora blobs, .globe-scene) are `absolute inset-0` and need this root
    // to be their containing block regardless of how a caller positions it.
    <div className={cn("relative", className)} aria-hidden>
      {/* Drifting aurora blobs. Skipped when the globe sits fully inside a
          panel: the blobs clip at this wrapper's rectangular bounds, which
          reads as a seam on the panel gradient. */}
      {aurora && (
        <div className="absolute inset-0 overflow-hidden">
          <div className="animate-aurora-slow absolute -top-6 left-[10%] size-72 rounded-full bg-primary/25 blur-[110px] dark:bg-primary/45" />
          <div className="animate-aurora-fast absolute bottom-[-8%] right-[8%] size-72 rounded-full bg-info/20 blur-[120px] dark:bg-info/35" />
        </div>
      )}

      <div className="globe-scene absolute inset-0 grid place-items-center">
        <div className="relative aspect-square w-[88%]">
          {/* Glass orb — rim-lit surface. No backdrop-filter: under motion it
              would re-render every frame. */}
          <div className="absolute inset-0 rounded-full border border-white/25 bg-white/8 shadow-[0_40px_90px_-40px_oklch(0.4_0.1_250/0.55)] dark:border-white/10 dark:bg-white/[0.04]" />
          {/* Rotating specular sheen — the lit side turning */}
          <div className="absolute inset-0 overflow-hidden rounded-full">
            <div className="animate-globe-sheen absolute inset-[-25%] bg-[conic-gradient(from_0deg,transparent_0deg,var(--globe-halo)_55deg,transparent_130deg,transparent_360deg)]" />
          </div>
          {/* Fixed top-left specular highlight */}
          <div className="absolute inset-0 rounded-full bg-[radial-gradient(55%_45%_at_34%_28%,oklch(1_0_0/0.45),transparent_58%)] dark:bg-[radial-gradient(55%_45%_at_34%_28%,oklch(1_0_0/0.16),transparent_58%)]" />

          {/* Wireframe sphere + routes */}
          <svg viewBox="0 0 360 360" className="relative size-full" role="presentation">
            <defs>
              <linearGradient id={arcGrad} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="var(--color-primary)" stopOpacity="0" />
                <stop offset="0.5" stopColor="var(--color-primary)" />
                <stop offset="1" stopColor="var(--color-info)" stopOpacity="0" />
              </linearGradient>
              <linearGradient id={meridGrad} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--globe-line)" />
                <stop offset="1" stopColor="var(--globe-line-soft)" />
              </linearGradient>
            </defs>

            {/* Twinkling starfield */}
            {STARS.map(([x, y], i) => (
              <circle
                // biome-ignore lint/suspicious/noArrayIndexKey: static decorative field
                key={i}
                cx={x}
                cy={y}
                r={i % 3 === 0 ? 1.6 : 1}
                fill="var(--color-muted-foreground)"
                opacity="0.55"
                className="animate-twinkle"
                style={{ animationDelay: `-${(i % 4) * 0.9}s` }}
              />
            ))}

            {/* Spinning orbit ring */}
            <g className="animate-orbit-slow">
              <ellipse
                cx={CX}
                cy={CY}
                rx="172"
                ry="56"
                fill="none"
                stroke="var(--globe-line-soft)"
                strokeWidth="1"
                strokeDasharray="2 9"
              />
            </g>

            {/* Static silhouette + latitude bands (a globe rotating on its
                vertical axis: the parallels stay, the meridians sweep). */}
            <circle
              cx={CX}
              cy={CY}
              r={R}
              fill="none"
              stroke="var(--globe-line)"
              strokeWidth="1.3"
            />
            {PARALLELS.map((p, i) => (
              <ellipse
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed geometry list
                key={`p${i}`}
                cx={CX}
                cy={p.cy}
                rx={p.rx}
                ry={p.ry}
                fill="none"
                stroke="var(--globe-line-soft)"
                strokeWidth="0.8"
              />
            ))}

            {/* Meridians spin around the globe centre → the sphere turns */}
            <g className="animate-globe-spin">
              {MERIDIANS.map((rx, i) => (
                <ellipse
                  // biome-ignore lint/suspicious/noArrayIndexKey: fixed geometry list
                  key={`m${i}`}
                  cx={CX}
                  cy={CY}
                  rx={rx}
                  ry={R}
                  fill="none"
                  stroke={`url(#${meridGrad})`}
                  strokeWidth="0.9"
                />
              ))}
            </g>

            {/* Supply-route arcs, each with a light travelling along it (a
                soft halo round a bright core; no blur filter). */}
            <g>
              {ARCS.map((arc, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed route list
                <g key={`a${i}`}>
                  <path d={arc.d} fill="none" stroke="var(--globe-line-soft)" strokeWidth="1.2" />
                  <path
                    d={arc.d}
                    fill="none"
                    stroke={`url(#${arcGrad})`}
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                  <g
                    className="animate-route-dot"
                    style={
                      {
                        transformOrigin: arc.origin,
                        "--route-sweep": arc.sweep,
                        animationDelay: arc.delay,
                      } as CSSProperties
                    }
                  >
                    <circle
                      cx={arc.from[0]}
                      cy={arc.from[1]}
                      r="5"
                      fill="var(--color-primary)"
                      opacity="0.25"
                    />
                    <circle cx={arc.from[0]} cy={arc.from[1]} r="2.4" fill="var(--color-primary)" />
                  </g>
                </g>
              ))}
            </g>

            {/* Route nodes; the primary hubs keep a still halo and send out a
                pulse (invisible at rest, so a stopped globe shows no stray
                disc). */}
            {NODES.map((n, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed node list
              <g key={`n${i}`}>
                {i % 2 === 0 && (
                  <>
                    <circle cx={n.cx} cy={n.cy} r="6" fill="var(--color-primary)" opacity="0.22" />
                    <circle
                      cx={n.cx}
                      cy={n.cy}
                      r="5"
                      fill="var(--color-primary)"
                      opacity="0"
                      className="animate-node-ping"
                      style={{ animationDelay: `-${i * 0.5}s` }}
                    />
                  </>
                )}
                <circle cx={n.cx} cy={n.cy} r="3.2" fill="var(--color-primary)" />
                <circle cx={n.cx} cy={n.cy} r="1.4" fill="var(--color-background)" />
              </g>
            ))}
          </svg>

          {/* Glass rim highlight over everything */}
          <div className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-white/20 dark:ring-white/10" />
        </div>
      </div>
    </div>
  );
}

/**
 * The globe's pause control (WCAG 2.2.2 Pause, Stop, Hide). A native checkbox,
 * so it works before hydration and ships no script: checking it pauses every
 * animation in .globe-scene through `:has()` in globals.css. It must sit
 * outside the globe's aria-hidden layer — focusable content may not live in
 * one — so the page places it; give it the globe's breakpoint and
 * `motion-safe` (when motion is already off there is nothing to pause).
 */
export function GlobeMotionToggle({ className }: { className?: string }) {
  return (
    <label
      className={cn(
        "inline-flex size-9 cursor-pointer items-center justify-center rounded-full border border-primary/20 bg-background/75 text-primary shadow-sm transition-colors hover:bg-background pointer-coarse:size-11 has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:ring-offset-2 has-focus-visible:ring-offset-background",
        className,
      )}
    >
      <input type="checkbox" className="globe-pause peer sr-only" />
      <span className="sr-only">Pause the globe animation</span>
      <Pause aria-hidden className="size-4 peer-checked:hidden" />
      <Play aria-hidden className="hidden size-4 peer-checked:block" />
    </label>
  );
}
