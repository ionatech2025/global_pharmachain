import { Input } from "@pharmachain/ui/components/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@pharmachain/ui/components/table";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { apiServer } from "@/lib/api/server";
import type { AuditLogRow, Paginated } from "@/lib/api/types";
import { fmtDateTime } from "@/lib/format";

export const metadata = { title: "Audit logs" };

function fmtJson(value: unknown): string {
  if (value === null || value === undefined) return "";
  return JSON.stringify(value);
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    actorEmail?: string;
    entityType?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const api = await apiServer();
  const logs = await api.get<Paginated<AuditLogRow>>("/admin/audit-logs", {
    query: {
      actorEmail: params.actorEmail || undefined,
      entityType: params.entityType || undefined,
      from: params.from ? new Date(params.from).toISOString() : undefined,
      to: params.to ? new Date(`${params.to}T23:59:59Z`).toISOString() : undefined,
      page: params.page ?? 1,
    },
  });

  const filterQuery = new URLSearchParams(
    Object.entries({
      actorEmail: params.actorEmail,
      entityType: params.entityType,
      from: params.from,
      to: params.to,
    }).filter((entry): entry is [string, string] => Boolean(entry[1])),
  ).toString();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Audit logs"
        description="Immutable record of every mutation — who, what, old/new values and reason (US-903)."
      />

      <form method="GET" action="/admin/audit" className="flex flex-wrap items-end gap-2">
        <Input
          name="actorEmail"
          aria-label="Actor email"
          placeholder="Actor email"
          defaultValue={params.actorEmail}
          className="w-52"
        />
        <Input
          name="entityType"
          aria-label="Entity type"
          placeholder="Entity type (e.g. Company)"
          defaultValue={params.entityType}
          className="w-52"
        />
        <Input name="from" type="date" defaultValue={params.from} className="w-40" />
        <Input name="to" type="date" defaultValue={params.to} className="w-40" />
        <button
          type="submit"
          className="h-9 rounded-md border border-input px-3 text-sm hover:bg-accent"
        >
          Filter
        </button>
      </form>

      {logs.items.length === 0 ? (
        <EmptyState title="No audit entries" hint="Adjust the filters." />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Changes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.items.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap">{fmtDateTime(log.createdAt)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {log.actorEmail ?? "system"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{log.action}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {log.entityType ?? ""}
                    {log.entityId ? ` ${log.entityId.slice(0, 8)}…` : ""}
                  </TableCell>
                  <TableCell className="max-w-md text-xs text-muted-foreground">
                    {log.oldValues != null && (
                      <p className="truncate">old: {fmtJson(log.oldValues)}</p>
                    )}
                    {log.newValues != null && (
                      <p className="truncate">new: {fmtJson(log.newValues)}</p>
                    )}
                    {log.reason && <p className="truncate">reason: {log.reason}</p>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Page {logs.page} of {logs.totalPages} · {logs.total} entr(ies)
            </span>
            <div className="flex gap-2">
              {logs.page > 1 && (
                <Link
                  className="text-primary hover:underline"
                  href={`/admin/audit?page=${logs.page - 1}${filterQuery ? `&${filterQuery}` : ""}`}
                >
                  Newer
                </Link>
              )}
              {logs.page < logs.totalPages && (
                <Link
                  className="text-primary hover:underline"
                  href={`/admin/audit?page=${logs.page + 1}${filterQuery ? `&${filterQuery}` : ""}`}
                >
                  Older
                </Link>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
