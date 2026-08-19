import { COMPANY_TYPE_LABELS } from "@pharmachain/core";
import { Badge } from "@pharmachain/ui/components/badge";
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
import { LiveSearch } from "@/components/live-search";
import { PageHeader } from "@/components/page-header";
import { PaginationNav } from "@/components/pagination-nav";
import { VerificationStatusBadge } from "@/components/status-badge";
import { apiServer } from "@/lib/api/server";
import type { AdminCompanyRow, Paginated } from "@/lib/api/types";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "Companies" };

const TIER_VARIANT = { FREEMIUM: "outline", PREMIUM: "default", FEATURED: "success" } as const;

export default async function AdminCompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const api = await apiServer();
  const companies = await api.get<Paginated<AdminCompanyRow>>("/admin/companies", {
    query: { q: params.q, page: params.page ?? 1 },
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Companies"
        description="All registered companies; open one to manage verification, tier and members."
      >
        <LiveSearch label="Search companies" placeholder="Search by name…" className="w-64" />
      </PageHeader>

      {companies.items.length === 0 ? (
        <EmptyState
          title="No companies found"
          hint="No company matches that name — clear the search to see all registered companies."
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Verification</TableHead>
                <TableHead>Re-verification due</TableHead>
                <TableHead>Registered</TableHead>
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
                  <TableCell>
                    <Badge variant={TIER_VARIANT[company.subscriptionTier]}>
                      {company.subscriptionTier.toLowerCase()}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <VerificationStatusBadge status={company.verificationStatus} />
                  </TableCell>
                  <TableCell>{fmtDate(company.reverificationDueAt)}</TableCell>
                  <TableCell>{fmtDate(company.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <PaginationNav
            page={companies.page}
            totalPages={companies.totalPages}
            total={companies.total}
            noun="compan(ies)"
            basePath="/admin/companies"
            params={{ q: params.q }}
          />
        </>
      )}
    </div>
  );
}
