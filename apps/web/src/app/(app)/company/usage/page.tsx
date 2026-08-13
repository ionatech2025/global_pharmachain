import type { AuthenticatedUser } from "@pharmachain/auth";
import type { UsageEvaluation } from "@pharmachain/core";
import { Meter } from "@/components/dashboard/charts";
import { Panel, PanelBody, PanelHeader } from "@/components/dashboard/panel";
import { PageHeader } from "@/components/page-header";
import { apiServer } from "@/lib/api/server";
import type { CreditRequestRow, UsageSummary } from "@/lib/api/types";
import { CreditRequestPanel } from "./credit-panel";

export const metadata = { title: "Usage & credits" };

/**
 * Same allowance, same meter as the dashboard's "Monthly allowance" panel —
 * one component, so the two places a user checks their limit can never drift
 * in appearance or in the threshold at which they turn amber.
 */
function UsageCard({ title, usage }: { title: string; usage: UsageEvaluation }) {
  return (
    <Panel>
      <PanelHeader
        title={title}
        description={
          usage.limited
            ? "Resets on the first of each calendar month (UTC)."
            : "Premium and Featured plans are unmetered."
        }
      />
      <PanelBody>
        <Meter
          label="This month"
          used={usage.used}
          limit={usage.limited ? usage.limit : null}
          unlimitedNote={`${usage.used} used — unlimited on your plan`}
          caption={
            usage.limited && usage.remaining !== null ? `${usage.remaining} remaining` : undefined
          }
        />
      </PanelBody>
    </Panel>
  );
}

export default async function UsagePage() {
  const api = await apiServer();
  const [usage, credits, me] = await Promise.all([
    api.get<UsageSummary>("/companies/me/usage"),
    api.get<CreditRequestRow[]>("/billing/credit-requests"),
    api.get<AuthenticatedUser>("/auth/me"),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="Usage & credits"
        description="Freemium monthly allowances reset each calendar month (UTC). Confirmed credits raise this month's limit (US-906/907)."
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <UsageCard title="RFQs created" usage={usage.rfq} />
        <UsageCard title="Quotations submitted" usage={usage.quotation} />
      </div>
      <CreditRequestPanel
        credits={credits}
        canRequest={me.membership?.role === "COMPANY_ADMIN"}
        tier={me.membership?.subscriptionTier ?? "FREEMIUM"}
      />
    </div>
  );
}
