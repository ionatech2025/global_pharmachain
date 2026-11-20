/**
 * Lane strip: a still row of illustrative trade lanes, echoing The Drop's
 * route ticker. It does not scroll (the Oct 2026 accessibility pass stopped
 * it; moving content would need its own pause control, WCAG 2.2.2), and the
 * row fades out at both ends. Decorative — hidden from assistive tech.
 */
const LANES = [
  { route: "Mumbai → Kampala", note: "Excipients · 2 t", state: "at port" },
  { route: "Shanghai → Mombasa", note: "Packaging · 3 t", state: "in transit" },
  { route: "Hyderabad → Lagos", note: "API · 1.2 t", state: "in transit" },
  { route: "Frankfurt → Nairobi", note: "GMP audit docs", state: "verified" },
  { route: "Rotterdam → Dar es Salaam", note: "IV fluids · 1.5 t", state: "pickup scheduled" },
  { route: "São Paulo → Accra", note: "Syrups · pallet", state: "delivered" },
  { route: "Singapore → Djibouti", note: "Cold chain · 800 kg", state: "in transit" },
  { route: "Kampala → Juba", note: "Finished packs · 40 plt", state: "delivered" },
];

const STATE_TONE: Record<string, string> = {
  delivered: "text-success",
  verified: "text-success",
  "in transit": "text-info",
  "at port": "text-info",
  "pickup scheduled": "text-warning",
};

export function RouteMarquee() {
  return (
    <div aria-hidden className="overflow-hidden rounded-full border bg-card/70 py-2.5">
      <div className="fade-x flex items-center gap-8 overflow-hidden pl-6">
        {LANES.map((lane) => (
          <span
            key={lane.route}
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
