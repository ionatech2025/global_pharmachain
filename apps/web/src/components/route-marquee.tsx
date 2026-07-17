/**
 * Live-lane ticker: a horizontally scrolling strip of illustrative trade
 * lanes, echoing The Drop's marquee. Content is duplicated once so the
 * -50% keyframe loops seamlessly; the whole strip pauses on hover and stops
 * under prefers-reduced-motion. Decorative — hidden from assistive tech.
 */
const LANES = [
  { route: "Kampala → Nairobi", note: "API · 500 kg", state: "in transit" },
  { route: "Mumbai → Kampala", note: "Excipients · 2 t", state: "at port" },
  { route: "Dar es Salaam → Kigali", note: "Syrups · pallet", state: "delivered" },
  { route: "Guangzhou → Mombasa", note: "Packaging · 3 t", state: "in transit" },
  { route: "Nairobi → Kampala", note: "GMP audit docs", state: "verified" },
  { route: "Kigali → Dar es Salaam", note: "IV fluids · 1.5 t", state: "pickup scheduled" },
];

const STATE_TONE: Record<string, string> = {
  delivered: "text-success",
  verified: "text-success",
  "in transit": "text-info",
  "at port": "text-info",
  "pickup scheduled": "text-warning",
};

export function RouteMarquee() {
  const items = [...LANES, ...LANES];
  return (
    <div
      aria-hidden
      className="relative flex overflow-hidden border-y bg-card/40 py-3 [mask-image:linear-gradient(90deg,transparent,black_8%,black_92%,transparent)]"
    >
      <div className="animate-marquee flex shrink-0 items-center gap-8 pr-8">
        {items.map((lane, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: duplicated static strip
            key={i}
            className="flex items-center gap-2.5 whitespace-nowrap text-xs font-medium text-muted-foreground"
          >
            <span className="size-1.5 shrink-0 rounded-full bg-primary" />
            <span className="text-foreground">{lane.route}</span>
            <span className="text-muted-foreground/70">·</span>
            <span>{lane.note}</span>
            <span className={`${STATE_TONE[lane.state] ?? "text-muted-foreground"} font-semibold`}>
              {lane.state}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
