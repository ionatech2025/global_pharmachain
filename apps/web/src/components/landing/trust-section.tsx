import {
  FileText,
  ListChecks,
  MessageSquare,
  ScrollText,
  Search,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { SectionHeading } from "./section-heading";

/** The platform's six capabilities, in the order a deal meets them. Claims unchanged. */
const FEATURES = [
  {
    icon: Search,
    title: "Verified Sourcing Lanes",
    record:
      "A pre-screened directory for APIs, excipients, FDF formulations and wholesale medications.",
    meaning: "Credentials are validated before any deal.",
  },
  {
    icon: FileText,
    title: "Compliance Document Vault",
    record: "GMP certificates, CoAs, DMFs and import/export licences in one controlled repository.",
    meaning: "Automated expiry notifications before a document lapses.",
  },
  {
    icon: ListChecks,
    title: "Targeted RFQs & Bids",
    record: "Structured User Requirement Specifications (URS) and versioned quotations.",
    meaning: "Competitive evaluation, with full audit trails.",
  },
  {
    icon: MessageSquare,
    title: "Confidential Pairwise Threads",
    record: "A segregated negotiation room for every tender and procurement contract.",
    meaning: "Zero data leakage across competing suppliers.",
  },
  {
    icon: Truck,
    title: "End-to-End Shipment Ledger",
    record:
      "Thirteen forward-only stages with temperature checkpoints and customs clearance tracking.",
    meaning: "Cryptographic proof of delivery.",
  },
  {
    icon: ScrollText,
    title: "Immutable Secure Ledger",
    record: "Every event timestamped and sealed to an immutable cryptographic audit trail.",
    meaning: "Role-based governance for corporate controllers.",
  },
];

export function TrustSection() {
  return (
    <section id="platform" aria-labelledby="platform-title" className="py-20 sm:py-24">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          id="platform-title"
          pill="Protected at every stage"
          icon={<ShieldCheck aria-hidden className="size-3.5" />}
          title="Trust that shows up as records, not claims"
          lead="An enterprise-grade B2B infrastructure layer, not generic e-commerce. Each safeguard leaves something on record that both sides can check."
        />
        <ol className="mt-12 grid gap-4 md:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, record, meaning }, i) => (
            <li key={title} className="landing-card flex gap-4 p-5 sm:p-6">
              <span className="icon-tile">
                <Icon aria-hidden className="size-5" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground/80">
                    Step {i + 1}
                  </span>
                  <h3 className="text-lg font-semibold text-foreground">{title}</h3>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  <strong className="font-semibold text-foreground">On record:</strong> {record}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  <strong className="font-semibold text-foreground">What it means for you:</strong>{" "}
                  {meaning}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
