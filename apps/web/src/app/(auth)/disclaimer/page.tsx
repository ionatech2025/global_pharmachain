import { Card, CardContent, CardHeader, CardTitle } from "@pharmachain/ui/components/card";
import { AlertCircle, Scale } from "lucide-react";

export const metadata = {
  title: "Legal Disclaimer & Regulatory Compliance · Global PharmaChain",
};

export default function LegalDisclaimerPage() {
  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <div className="flex items-center gap-2 text-primary mb-1">
          <Scale className="size-5" />
          <span className="text-xs font-semibold uppercase tracking-wider">
            Corporate Governance
          </span>
        </div>
        <CardTitle className="text-2xl font-bold">
          Legal Disclaimer & Regulatory Compliance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 text-sm text-muted-foreground leading-relaxed">
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-foreground text-sm font-medium">
          Legal Disclaimer: Global Pharmachain operates strictly as an independent B2B matching
          directory and secure open-ledger information infrastructure layer. This platform does not
          directly manufacture, formulate, dispense, store, transport, market, distribute, or
          prescribe therapeutic medications, active pharmaceutical ingredients (APIs), or medical
          consumables.
        </div>

        <div>
          <h3 className="text-sm font-semibold text-foreground mb-1">
            Independent Entity Responsibility
          </h3>
          <p>
            All transactions, negotiations, regulatory filings, and quality assurance protocols are
            executed strictly between the independent verified corporate entities (Suppliers,
            Manufacturers, and Distributors) utilizing the network. Users are entirely responsible
            for securing and maintaining all required regional regulatory compliance, import/export
            licenses, and certifications (including but not limited to FDA, EMA, WHO-GMP, and local
            country authorizations) necessary to trade pharmaceutical products.
          </p>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-foreground mb-1">
            Regulatory Compliance & Liability Limitation
          </h3>
          <p>
            The information, dossiers, and product listings displayed within this marketplace are
            provided solely for corporate procurement discovery and logistical coordination. Global
            Pharmachain does not independently verify the bio-equivalence, purity, chemical
            stability, or regulatory validity of listed compounds or finished products.
          </p>
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-950 dark:text-amber-200">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="size-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <p className="text-xs sm:text-sm">
              It is the sole, non-delegable duty of the purchasing manufacturer or downstream
              distributor to perform full laboratory analytical testing, batch verification, and
              comprehensive due diligence prior to product release or human administration. Global
              Pharmachain expressly disclaims all liability for supply chain disruptions, regulatory
              enforcement actions, or adverse therapeutic events arising from transactions initiated
              on the platform.
            </p>
          </div>
        </div>

        <div className="border-t pt-4 text-xs text-muted-foreground">
          <p>
            For regulatory or compliance inquiries, contact the platform legal department at{" "}
            <a
              href="mailto:contact@globalpharmachain.com"
              className="text-primary underline hover:text-foreground"
            >
              contact@globalpharmachain.com
            </a>
            .
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
