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
import { OnboardClientsDialog } from "./onboard-clients";

export const metadata = { title: "Companies" };

const TIER_VARIANT = { FREEMIUM: "outline", PREMIUM: "default", FEATURED: "success" } as const;

const STATUS_FILTERS: ReadonlyArray<readonly [string, string]> = [
  ["", "All"],
  ["VERIFIED", "Verified"],
  ["PENDING_VERIFICATION", "Pending"],
  ["EXPIRED_DOCUMENT", "Expired docs"],
  ["REJECTED", "Rejected"],
  ["SUSPENDED", "Deactivated"],
  ["DELETED", "Deleted"],
];

export default async function AdminCompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const params = await searchParams;
  const api = await apiServer();
  const companies = await api.get<Paginated<AdminCompanyRow>>("/admin/companies", {
    query: { q: params.q, status: params.status, page: params.page ?? 1 },
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Companies"
        description="All registered companies; open one to manage verification, tier and members, or onboard a trial client cohort."
      >
        <LiveSearch label="Search companies" placeholder="Search by name…" className="w-64" />
        <OnboardClientsDialog />
      </PageHeader>

      <div className="flex flex-wrap gap-1 text-sm">
        {STATUS_FILTERS.map(([value, label]) => {
          const active = (params.status ?? "") === value;
          const search = new URLSearchParams();
          if (value) search.set("status", value);
          if (params.q) search.set("q", params.q);
          const qs = search.toString();
          return (
            <Link
              key={label}
              href={qs ? `/admin/companies?${qs}` : "/admin/companies"}
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
                    <VerificationStatusBadge
                      status={company.verificationStatus}
                      previouslyVerified={company.verifiedAt !== null}
                    />
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
            params={{ q: params.q, status: params.status }}
          />
        </>
      )}
    </div>
  );
}
