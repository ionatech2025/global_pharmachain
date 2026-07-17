import type { AuthenticatedUser } from "@pharmachain/auth";
import type { UsageEvaluation } from "@pharmachain/core";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pharmachain/ui/components/card";
import { PageHeader } from "@/components/page-header";
import { apiServer } from "@/lib/api/server";
import type { CreditRequestRow, UsageSummary } from "@/lib/api/types";
import { CreditRequestPanel } from "./credit-panel";

export const metadata = { title: "Usage & credits" };

function UsageCard({ title, usage }: { title: string; usage: UsageEvaluation }) {
  const pct =
    usage.limit && usage.limit > 0
      ? Math.min(100, Math.round((usage.used / usage.limit) * 100))
      : 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
        <CardDescription>
          {usage.limited
            ? `${usage.used} of ${usage.limit} used this calendar month`
            : `${usage.used} this month — unlimited on your plan`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {usage.limited ? (
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full ${pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-warning" : "bg-primary"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Premium and Featured plans are unmetered.</p>
        )}
      </CardContent>
    </Card>
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
      <div className="grid gap-4 sm:grid-cols-2">
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
