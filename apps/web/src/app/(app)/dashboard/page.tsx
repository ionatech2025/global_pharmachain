import { Button } from "@pharmachain/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@pharmachain/ui/components/card";
import { Package, Search, Send } from "lucide-react";
import Link from "next/link";
import { DashboardRefresh } from "@/components/dashboard-refresh";
import { PageHeader } from "@/components/page-header";
import { apiServer } from "@/lib/api/server";
import type { DashboardSummary } from "@/lib/api/types";

export const metadata = { title: "Dashboard" };

function Stat({ label, value, href }: { label: string; value: number | string; href?: string }) {
  // Compact tile: label and value tight together for fast scanning, not the
  // full Card header/content padding stack.
  const body = (
    <Card className="gap-1 py-4 transition-colors hover:border-primary/40">
      <div className="px-4">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      </div>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function UsageMeter({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  if (limit === null) {
    return (
      <div className="text-sm">
        <span className="font-medium">{label}:</span>{" "}
        <span className="text-muted-foreground">unlimited on your tier</span>
      </div>
    );
  }
  const pct = Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className={pct >= 80 ? "font-medium text-warning" : "text-muted-foreground"}>
          {used} / {limit} this month
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted">
        <div
          className={`h-2 rounded-full ${pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-warning" : "bg-primary"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const api = await apiServer();
  const summary = await api.get<DashboardSummary>("/dashboard/summary");

  if (summary.scope === "platform" && summary.platform) {
    const p = summary.platform;
    return (
      <div className="space-y-4">
        <PageHeader
          title="Platform overview"
          description="Live counts across PharmaChain (US-901)."
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Companies" value={p.totalCompanies} href="/admin/companies" />
          <Stat label="Verified companies" value={p.verifiedCompanies} href="/admin/companies" />
          <Stat
            label="Pending verifications"
            value={p.pendingVerifications}
            href="/admin/verification"
          />
          <Stat label="Users" value={p.totalUsers} />
          <Stat label="Open RFQs" value={p.openRfqs} />
          <Stat label="Orders (30 days)" value={p.ordersLast30d} />
          <Stat label="Credit requests" value={p.pendingCredits} href="/admin/credits" />
          <Stat label="Deletion requests" value={p.pendingDeletions} href="/admin/data-requests" />
        </div>
      </div>
    );
  }

  const c = summary.company;
  if (!c) return null;
  // Role-aware home: selling tiles only when the company actually sells (or
  // drafts listings), buying tiles only when it buys — a pure buyer no longer
  // stares at "Orders as supplier: 0" (and vice versa). New companies with no
  // activity see both sides plus the CTAs to start.
  const sells = c.publishedListings + c.draftListings + c.ordersAsSeller + c.activeQuotations > 0;
  const buys = c.openRfqs + c.ordersAsBuyer > 0;
  const fresh = !sells && !buys;
  return (
    <div className="space-y-4">
      <PageHeader title="Dashboard" description="Your company's activity at a glance.">
        <DashboardRefresh />
      </PageHeader>
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm">
          <Link href="/rfqs/new">
            <Send className="size-3.5" /> Raise an RFQ
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/catalogue">
            <Package className="size-3.5" /> Add a listing
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/marketplace">
            <Search className="size-3.5" /> Browse the marketplace
          </Link>
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(sells || fresh) && (
          <>
            <Stat label="Published listings" value={c.publishedListings} href="/catalogue" />
            <Stat label="Draft listings" value={c.draftListings} href="/catalogue" />
            <Stat label="Active quotations" value={c.activeQuotations} href="/quotes" />
            <Stat label="Orders as supplier" value={c.ordersAsSeller} href="/orders?role=seller" />
          </>
        )}
        {(buys || fresh) && (
          <>
            <Stat label="Open RFQs (buying)" value={c.openRfqs} href="/rfqs" />
            <Stat label="Orders as buyer" value={c.ordersAsBuyer} href="/orders?role=buyer" />
          </>
        )}
        <Stat
          label="Expiring documents (30d)"
          value={c.expiringDocuments}
          href="/company/verification"
        />
        <Stat label="Unread notifications" value={c.unreadNotifications} href="/notifications" />
      </div>
      {c.usage.rfq.limited && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Freemium usage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <UsageMeter label="RFQs" used={c.usage.rfq.used} limit={c.usage.rfq.limit} />
            <UsageMeter
              label="Quotations"
              used={c.usage.quotation.used}
              limit={c.usage.quotation.limit}
            />
            <p className="text-xs text-muted-foreground">
              Need more this month?{" "}
              <Link href="/company/usage" className="text-primary underline">
                Request credits or upgrade
              </Link>
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
