import { ISSUE_CATEGORY_LABELS, type IssueCategory, type IssueStatus } from "@pharmachain/core";
import { Badge } from "@pharmachain/ui/components/badge";
import { Button } from "@pharmachain/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@pharmachain/ui/components/table";
import { CheckCircle2, Clock, LifeBuoy, MessageSquare, Plus } from "lucide-react";
import Link from "next/link";
import { StatGrid, StatTile } from "@/components/dashboard/stat-tile";
import { EmptyState } from "@/components/empty-state";
import { LiveSearch } from "@/components/live-search";
import { PageHeader } from "@/components/page-header";
import { PaginationNav } from "@/components/pagination-nav";
import { ReportIssueDialog } from "@/components/report-issue-dialog";
import { IssuePriorityBadge, IssueStatusBadge } from "@/components/status-badge";
import { apiServer } from "@/lib/api/server";
import type { SupportIssueListResponse } from "@/lib/api/types";
import { fmtDate, fmtNumber } from "@/lib/format";

export const metadata = { title: "Support & issues" };

const STATUS_TABS: ReadonlyArray<readonly [string, string]> = [
  ["", "All"],
  ["OPEN", "Open"],
  ["IN_PROGRESS", "In progress"],
  ["RESOLVED", "Resolved"],
  ["CLOSED", "Closed"],
];

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const api = await apiServer();
  const result = await api.get<SupportIssueListResponse>("/issues", {
    query: {
      status: params.status,
      q: params.q,
      page: params.page ?? 1,
    },
  });

  const { counts } = result;
  const totalTickets = counts.open + counts.inProgress + counts.resolved + counts.closed;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Support & issues"
        description="Raise bugs, onboarding questions or feature requests for the development team, and track every ticket to resolution."
      >
        <ReportIssueDialog
          trigger={
            <Button size="sm">
              <Plus className="size-4" /> Raise an issue
            </Button>
          }
        />
      </PageHeader>

      <StatGrid>
        <StatTile
          label="Open tickets"
          value={fmtNumber(counts.open)}
          icon={LifeBuoy}
          caption="awaiting development team review"
          tone={counts.open > 0 ? "warning" : "default"}
        />
        <StatTile
          label="In progress"
          value={fmtNumber(counts.inProgress)}
          icon={Clock}
          caption="actively being worked on"
        />
        <StatTile
          label="Resolved"
          value={fmtNumber(counts.resolved + counts.closed)}
          icon={CheckCircle2}
          caption="completed with resolution notes"
        />
        <StatTile
          label="Total raised"
          value={fmtNumber(totalTickets)}
          icon={MessageSquare}
          caption="across your workspace"
        />
      </StatGrid>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1 text-sm">
          {STATUS_TABS.map(([value, label]) => {
            const active = (params.status ?? "") === value;
            const href = value
              ? `/issues?status=${value}${params.q ? `&q=${encodeURIComponent(params.q)}` : ""}`
              : `/issues${params.q ? `?q=${encodeURIComponent(params.q)}` : ""}`;
            return (
              <Link
                key={label}
                href={href}
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
          label="Search support issues"
          placeholder="Search ref or subject…"
          className="w-full sm:w-64"
        />
      </div>

      {result.items.length === 0 ? (
        <EmptyState
          icon={LifeBuoy}
          title={params.status || params.q ? "No matching tickets" : "No support issues raised yet"}
          hint={
            params.status || params.q
              ? "Clear the filter or search query to see all tickets."
              : "Encountered a bug, verification blocker, or have a feature request? Raise a ticket and our development team will address it."
          }
        >
          <ReportIssueDialog
            trigger={
              <Button variant="outline">
                <Plus className="size-4" /> Raise an issue
              </Button>
            }
          />
        </EmptyState>
      ) : (
        <>
          {/* Mobile card stack */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {result.items.map((issue) => (
              <Link
                key={issue.id}
                href={`/issues/${issue.id}`}
                className="panel panel-link block min-w-0 space-y-2 p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-medium text-primary">{issue.refNo}</span>
                  <IssueStatusBadge status={issue.status as IssueStatus} />
                </div>
                <p className="truncate text-sm font-medium">{issue.subject}</p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">
                    {ISSUE_CATEGORY_LABELS[issue.category as IssueCategory] ?? issue.category}
                  </Badge>
                  <IssuePriorityBadge priority={issue.priority} />
                  <span>· {fmtDate(issue.createdAt)}</span>
                </div>
              </Link>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Replies</TableHead>
                  <TableHead>Raised</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.items.map((issue) => (
                  <TableRow key={issue.id}>
                    <TableCell className="max-w-md">
                      <Link
                        href={`/issues/${issue.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {issue.refNo}
                      </Link>
                      <p className="truncate text-sm font-medium text-foreground">
                        {issue.subject}
                      </p>
                      {issue.pageUrl && (
                        <p className="truncate font-mono text-xs text-muted-foreground">
                          {issue.pageUrl}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {ISSUE_CATEGORY_LABELS[issue.category as IssueCategory] ?? issue.category}
                    </TableCell>
                    <TableCell>
                      <IssuePriorityBadge priority={issue.priority} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {issue._count?.messages ?? 0}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {fmtDate(issue.createdAt)}
                    </TableCell>
                    <TableCell>
                      <IssueStatusBadge status={issue.status as IssueStatus} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <PaginationNav
            page={result.page}
            totalPages={result.totalPages}
            total={result.total}
            noun="ticket(s)"
            basePath="/issues"
            params={{ status: params.status, q: params.q }}
          />
        </>
      )}
    </div>
  );
}
