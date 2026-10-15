import { ISSUE_CATEGORY_LABELS, type IssueCategory, type IssueStatus } from "@pharmachain/core";
import { Badge } from "@pharmachain/ui/components/badge";
import { Button } from "@pharmachain/ui/components/button";
import { Card, CardContent } from "@pharmachain/ui/components/card";
import { AlertTriangle, CheckCircle2, Clock, LifeBuoy, MessageSquare } from "lucide-react";
import Link from "next/link";
import { StatGrid, StatTile } from "@/components/dashboard/stat-tile";
import { EmptyState } from "@/components/empty-state";
import { LiveSearch } from "@/components/live-search";
import { PageHeader } from "@/components/page-header";
import { PaginationNav } from "@/components/pagination-nav";
import { IssuePriorityBadge, IssueStatusBadge } from "@/components/status-badge";
import { apiServer } from "@/lib/api/server";
import type { SupportIssueListResponse } from "@/lib/api/types";
import { fmtDateTime, fmtNumber } from "@/lib/format";
import { AdminIssueActions } from "./triage-panel";

export const metadata = { title: "Support issues" };

const STATUS_FILTERS: ReadonlyArray<readonly [string, string]> = [
  ["", "All"],
  ["OPEN", "Open"],
  ["IN_PROGRESS", "In progress"],
  ["RESOLVED", "Resolved"],
  ["CLOSED", "Closed"],
];

export default async function AdminIssuesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; priority?: string; q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const api = await apiServer();
  const result = await api.get<SupportIssueListResponse>("/admin/issues", {
    query: {
      status: params.status,
      priority: params.priority,
      q: params.q,
      page: params.page ?? 1,
    },
  });

  const { counts } = result;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Platform admin · Development team"
        title="Support issues & tickets"
        description="Bugs, onboarding blockers and feature requests raised by companies on the platform. Every triage decision notifies the reporter and lands on the audit trail."
      />

      <StatGrid>
        <StatTile
          label="Open tickets"
          value={fmtNumber(counts.open)}
          icon={LifeBuoy}
          caption="awaiting development team triage"
          tone={counts.open > 0 ? "warning" : "default"}
        />
        <StatTile
          label="In progress"
          value={fmtNumber(counts.inProgress)}
          icon={Clock}
          caption="assigned & under investigation"
        />
        <StatTile
          label="Critical open"
          value={fmtNumber(counts.criticalOpen ?? 0)}
          icon={AlertTriangle}
          caption="high-severity active blockers"
          tone={(counts.criticalOpen ?? 0) > 0 ? "danger" : "default"}
        />
        <StatTile
          label="Resolved"
          value={fmtNumber(counts.resolved + counts.closed)}
          icon={CheckCircle2}
          caption="addressed by the development team"
        />
      </StatGrid>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1 text-sm">
          {STATUS_FILTERS.map(([value, label]) => {
            const active = (params.status ?? "") === value;
            const search = new URLSearchParams();
            if (value) search.set("status", value);
            if (params.priority) search.set("priority", params.priority);
            if (params.q) search.set("q", params.q);
            const qs = search.toString();
            return (
              <Link
                key={label}
                href={qs ? `/admin/issues?${qs}` : "/admin/issues"}
                aria-current={active ? "page" : undefined}
                className={`touch-target rounded-md px-3 py-1.5 transition-colors ${
                  active
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-accent"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </div>
        <LiveSearch
          label="Search support tickets"
          placeholder="Search ref, subject, company…"
          className="w-full sm:w-72"
        />
      </div>

      {result.items.length === 0 ? (
        <EmptyState
          icon={LifeBuoy}
          title="No support issues in this view"
          hint="Tickets raised by companies and users across the platform appear here for development team triage."
        />
      ) : (
        <div className="space-y-3">
          {result.items.map((issue) => (
            <Card key={issue.id}>
              <CardContent className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <IssueStatusBadge status={issue.status as IssueStatus} />
                    <IssuePriorityBadge priority={issue.priority} />
                    <Badge variant="outline">
                      {ISSUE_CATEGORY_LABELS[issue.category as IssueCategory] ?? issue.category}
                    </Badge>
                    <Link
                      href={`/issues/${issue.id}`}
                      className="font-mono text-xs font-semibold text-primary hover:underline"
                    >
                      {issue.refNo}
                    </Link>
                    <Link href={`/issues/${issue.id}`} className="font-medium hover:underline">
                      {issue.subject}
                    </Link>
                  </div>
                  {issue.pageUrl && (
                    <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                      {issue.pageUrl}
                    </span>
                  )}
                </div>

                <p className="line-clamp-3 text-sm text-muted-foreground">{issue.description}</p>

                {issue.resolution && (
                  <div className="rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-xs">
                    <span className="font-semibold text-foreground">Dev team resolution: </span>
                    <span className="text-muted-foreground">{issue.resolution}</span>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    {issue.company ? (
                      <Link
                        href={`/admin/companies/${issue.company.id}`}
                        className="font-medium text-foreground hover:underline"
                      >
                        {issue.company.name}
                      </Link>
                    ) : (
                      <span>Platform user</span>
                    )}
                    <span>·</span>
                    <span>
                      {issue.reportedBy.name} ({issue.reportedBy.email})
                    </span>
                    <span>·</span>
                    <span>{fmtDateTime(issue.createdAt)}</span>
                    {(issue._count?.messages ?? 0) > 0 && (
                      <>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1 font-medium text-foreground">
                          <MessageSquare className="size-3" />
                          {issue._count?.messages} repl{issue._count?.messages === 1 ? "y" : "ies"}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/issues/${issue.id}`}>Open thread</Link>
                    </Button>
                    <AdminIssueActions issue={issue} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          <PaginationNav
            page={result.page}
            totalPages={result.totalPages}
            total={result.total}
            noun="ticket(s)"
            basePath="/admin/issues"
            params={{ status: params.status, priority: params.priority, q: params.q }}
          />
        </div>
      )}
    </div>
  );
}
