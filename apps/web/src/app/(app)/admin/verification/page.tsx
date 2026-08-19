import { COMPANY_TYPE_LABELS } from "@pharmachain/core";
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
import { PaginationNav } from "@/components/pagination-nav";
import { VerificationStatusBadge } from "@/components/status-badge";
import { apiServer } from "@/lib/api/server";
import type { AdminCompanyRow, Paginated } from "@/lib/api/types";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "Verification queue" };

export default async function VerificationQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const params = await searchParams;
  const status = params.status ?? "PENDING_VERIFICATION";
  const api = await apiServer();
  const companies = await api.get<Paginated<AdminCompanyRow>>("/admin/companies", {
    query: { status, page: params.page ?? 1 },
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Verification queue"
        description="Sorted by submission date; open a company to run checks and decide."
      >
        <div className="flex gap-1 text-sm">
          {[
            ["PENDING_VERIFICATION", "Pending"],
            ["EXPIRED_DOCUMENT", "Expired docs"],
            ["REJECTED", "Rejected"],
          ].map(([value, label]) => (
            <Link
              key={value}
              href={`/admin/verification?status=${value}`}
              className={`rounded-md px-3 py-1.5 ${
                status === value
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-accent"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      </PageHeader>

      {companies.items.length === 0 ? (
        <EmptyState title="Queue is empty" hint="No companies with this status." />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.items.map((company) => (
                <TableRow key={company.id}>
                  <TableCell>
                    <Link
                      href={`/admin/companies/${company.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {company.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {COMPANY_TYPE_LABELS[company.type]}
                  </TableCell>
                  <TableCell>{company.country}</TableCell>
                  <TableCell>{fmtDate(company.createdAt)}</TableCell>
                  <TableCell>
                    <VerificationStatusBadge status={company.verificationStatus} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <PaginationNav
            page={companies.page}
            totalPages={companies.totalPages}
            total={companies.total}
            noun="compan(ies)"
            basePath="/admin/verification"
            params={{ status: params.status }}
          />
        </>
      )}
    </div>
  );
}
