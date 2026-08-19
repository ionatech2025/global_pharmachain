import { Alert, AlertDescription, AlertTitle } from "@pharmachain/ui/components/alert";
import { Badge } from "@pharmachain/ui/components/badge";
import { Input } from "@pharmachain/ui/components/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@pharmachain/ui/components/table";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { PaginationNav } from "@/components/pagination-nav";
import { apiServer } from "@/lib/api/server";
import type { LoginActivityRow, Paginated } from "@/lib/api/types";
import { fmtDateTime } from "@/lib/format";

export const metadata = { title: "Login activity" };

type LoginActivityResponse = Paginated<LoginActivityRow> & { flagged: boolean };

export default async function AdminLoginsPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; page?: string }>;
}) {
  const params = await searchParams;
  const api = await apiServer();
  const activity = await api.get<LoginActivityResponse>("/admin/login-activity", {
    query: { email: params.email, page: params.page ?? 1 },
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Login activity"
        description="Successful and failed attempts with IP and device."
      >
        <form method="GET" action="/admin/logins">
          <Input
            name="email"
            aria-label="Filter by email"
            placeholder="Filter by email…"
            defaultValue={params.email}
            className="w-56"
          />
        </form>
      </PageHeader>

      {activity.flagged && (
        <Alert variant="destructive">
          <AlertTitle>Suspicious pattern flagged</AlertTitle>
          <AlertDescription>
            The 5 most recent attempts in this view all failed — review for a possible brute-force
            attempt.
          </AlertDescription>
        </Alert>
      )}

      {activity.items.length === 0 ? (
        <EmptyState title="No login activity" hint="Try a different email filter." />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Device</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activity.items.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{fmtDateTime(entry.createdAt)}</TableCell>
                  <TableCell className="font-medium">{entry.email}</TableCell>
                  <TableCell>{entry.method}</TableCell>
                  <TableCell>
                    {entry.success ? (
                      <Badge variant="success">success</Badge>
                    ) : (
                      <Badge variant="destructive">failed</Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{entry.ip ?? "—"}</TableCell>
                  <TableCell className="max-w-56 truncate text-xs text-muted-foreground">
                    {entry.userAgent ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <PaginationNav
            page={activity.page}
            totalPages={activity.totalPages}
            total={activity.total}
            noun="attempt(s)"
            basePath="/admin/logins"
            params={{ email: params.email }}
          />
        </>
      )}
    </div>
  );
}
