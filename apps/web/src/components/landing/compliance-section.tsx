import { Scale } from "lucide-react";
import Link from "next/link";
import { SectionHeading } from "./section-heading";

/** The client-required legal disclaimer (Oct 2026), in full. Restyle only; never trim the text. */
export function ComplianceSection() {
  return (
    <section id="compliance" aria-labelledby="compliance-title" className="py-20 sm:py-24">
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
        <SectionHeading
          id="compliance-title"
          pill="Regulatory notice"
          icon={<Scale aria-hidden className="size-3.5" />}
          title="Legal Disclaimer & Regulatory Compliance"
        />
        <div className="landing-card mt-12 p-6 sm:p-10">
          <p className="eyebrow text-primary">Corporate Compliance & Regulatory Notice</p>
          <div className="mt-4 space-y-4 text-sm leading-relaxed text-muted-foreground">
            <p className="font-medium text-foreground">
              Legal Disclaimer: Global PharmaChain operates strictly as an independent B2B matching
              directory and secure open-ledger information infrastructure layer. This platform does
              not directly manufacture, formulate, dispense, store, transport, market, distribute,
              or prescribe therapeutic medications, active pharmaceutical ingredients (APIs), or
              medical consumables.
            </p>

            <p>
              All transactions, negotiations, regulatory filings, and quality assurance protocols
              are executed strictly between the independent verified corporate entities (Suppliers,
              Manufacturers, and Distributors) utilizing the network. Users are entirely responsible
              for securing and maintaining all required regional regulatory compliance,
              import/export licenses, and certifications (including but not limited to FDA, EMA,
              WHO-GMP, and local country authorizations) necessary to trade pharmaceutical products.
            </p>

            <p>
              <strong className="text-foreground">
                Regulatory Compliance & Liability Limitation:
              </strong>{" "}
              The information, dossiers, and product listings displayed within this marketplace are
              provided solely for corporate procurement discovery and logistical coordination.
              Global PharmaChain does not independently verify the bio-equivalence, purity, chemical
              stability, or regulatory validity of listed compounds or finished products.
            </p>

            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-950 sm:text-sm dark:text-amber-200">
              It is the sole, non-delegable duty of the purchasing manufacturer or downstream
              distributor to perform full laboratory analytical testing, batch verification, and
              comprehensive due diligence prior to product release or human administration. Global
              PharmaChain expressly disclaims all liability for supply chain disruptions, regulatory
              enforcement actions, or adverse therapeutic events arising from transactions initiated
              on the platform.
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-border/60 pt-4 text-xs">
            <Link href="/disclaimer" className="font-medium text-primary underline">
              Read Full Legal Statement & Liability Limitations →
            </Link>
            <span aria-hidden className="text-muted-foreground">
              ·
            </span>
            <Link href="/privacy" className="text-muted-foreground hover:text-foreground">
              Privacy Policy
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
