import { BadgeCheck, Landmark, Layers, Route, ScrollText } from "lucide-react";
import { SectionHeading } from "./section-heading";

const STATS = [
  {
    icon: Layers,
    value: "3 Lanes",
    label: "Upstream Inbound, Midstream Hub & Downstream Outbound",
  },
  {
    icon: Route,
    value: "13 Stages",
    label: "Forward-only GPS & Cold-Chain Shipment Milestones",
  },
  {
    icon: Landmark,
    value: "LC & Wire",
    label: "Corporate Letters of Credit, Bank Wire & Escrow",
  },
  {
    icon: ScrollText,
    value: "100%",
    label: "Of transactions verified via Secure Audit Ledger",
  },
];

/** The fixed platform facts, led by the live verified-company count when the API returned one. */
export function NumbersSection({ verifiedCompanies }: { verifiedCompanies: number | null }) {
  const stats =
    verifiedCompanies && verifiedCompanies > 0
      ? [
          {
            icon: BadgeCheck,
            value: verifiedCompanies.toLocaleString("en"),
            label: "Verified companies on the network today",
          },
          ...STATS,
        ]
      : STATS;

  return (
    <section aria-labelledby="numbers-title" className="py-20 sm:py-24">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          id="numbers-title"
          pill="At a glance"
          title="Built around how pharma trade actually moves"
        />
        <dl
          className={`mt-12 grid gap-4 sm:grid-cols-2 ${stats.length > 4 ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}
        >
          {stats.map(({ icon: Icon, value, label }) => (
            <div key={label} className="landing-card flex flex-col p-6">
              <dt className="order-last mt-2 text-sm leading-relaxed text-muted-foreground">
                {label}
              </dt>
              <dd className="flex flex-col items-start gap-6">
                <span className="icon-tile">
                  <Icon aria-hidden className="size-5" />
                </span>
                <span className="figure text-3xl font-bold text-foreground">{value}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
