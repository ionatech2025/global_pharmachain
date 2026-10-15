import { ISSUE_CATEGORY_LABELS, type IssueCategory, type IssueStatus } from "@pharmachain/core";
import { Alert, AlertDescription, AlertTitle } from "@pharmachain/ui/components/alert";
import { Badge } from "@pharmachain/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@pharmachain/ui/components/card";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { IssuePriorityBadge, IssueStatusBadge } from "@/components/status-badge";
import { ApiClientError } from "@/lib/api/http";
import { apiServer, getViewer } from "@/lib/api/server";
import type { SupportIssueDetail } from "@/lib/api/types";
import { fmtDateTime } from "@/lib/format";
import { IssueThread } from "./issue-thread";

export const metadata = { title: "Support issue" };

export default async function IssueDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const api = await apiServer();
  const me = await getViewer();

  let issue: SupportIssueDetail;
  try {
    issue = await api.get<SupportIssueDetail>(`/issues/${id}`);
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 404) notFound();
    throw err;
  }

  const backHref = me.isSuperAdmin && !me.membership ? "/admin/issues" : "/issues";

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader
        backHref={backHref}
        backLabel="Support issues"
        eyebrow={issue.refNo}
        title={issue.subject}
        description={`Raised ${fmtDateTime(issue.createdAt)} by ${issue.reportedBy.name} (${issue.reportedBy.email})`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            {ISSUE_CATEGORY_LABELS[issue.category as IssueCategory] ?? issue.category}
          </Badge>
          <IssuePriorityBadge priority={issue.priority} />
          <IssueStatusBadge status={issue.status as IssueStatus} />
        </div>
      </PageHeader>

      {issue.resolution && (
        <Alert variant="success">
          <CheckCircle2 className="size-4" />
          <AlertTitle>
            Development team resolution
            {issue.resolvedBy ? ` · ${issue.resolvedBy.name}` : ""}
            {issue.resolvedAt ? ` (${fmtDateTime(issue.resolvedAt)})` : ""}
          </AlertTitle>
          <AlertDescription className="mt-1 whitespace-pre-wrap">
            {issue.resolution}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Issue details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="whitespace-pre-wrap leading-relaxed text-foreground">{issue.description}</p>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 border-t pt-3 text-xs sm:grid-cols-3">
            <div className="min-w-0">
              <dt className="text-muted-foreground">Company</dt>
              <dd className="mt-0.5 truncate font-medium">
                {issue.company ? (
                  me.isSuperAdmin ? (
                    <Link
                      href={`/admin/companies/${issue.company.id}`}
                      className="text-primary hover:underline"
                    >
                      {issue.company.name}
                    </Link>
                  ) : (
                    issue.company.name
                  )
                ) : (
                  "Platform account"
                )}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-muted-foreground">Page / route</dt>
              <dd className="mt-0.5 truncate font-mono">{issue.pageUrl || "—"}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-muted-foreground">Last updated</dt>
              <dd className="mt-0.5">{fmtDateTime(issue.updatedAt)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <IssueThread issue={issue} isSuperAdmin={me.isSuperAdmin} />
    </div>
  );
}
