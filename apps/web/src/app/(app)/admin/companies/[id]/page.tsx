import { COMPANY_TYPE_LABELS, DOCUMENT_KIND_LABELS, type DocumentKind } from "@pharmachain/core";
import { Badge } from "@pharmachain/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pharmachain/ui/components/card";
import { Check, X } from "lucide-react";
import { notFound } from "next/navigation";
import { DocumentChip } from "@/components/document-chip";
import { PageHeader } from "@/components/page-header";
import { VerificationStatusBadge } from "@/components/status-badge";
import { ApiClientError } from "@/lib/api/http";
import { apiServer } from "@/lib/api/server";
import type { AdminCompanyDetail } from "@/lib/api/types";
import { fmtDate } from "@/lib/format";
import { MemberOverrides, TierSelect, VerificationDecision } from "./review-panel";

export const metadata = { title: "Company review" };

function CheckIcon({ ok }: { ok: boolean }) {
  return ok ? (
    <Check className="size-4 text-emerald-600" />
  ) : (
    <X className="size-4 text-destructive" />
  );
}

export default async function AdminCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const api = await apiServer();

  let detail: AdminCompanyDetail;
  try {
    detail = await api.get<AdminCompanyDetail>(`/admin/companies/${id}`);
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 404) notFound();
    throw err;
  }
  const { company, documents, checks, checksPass } = detail;
  const decidable =
    company.verificationStatus === "PENDING_VERIFICATION" ||
    company.verificationStatus === "EXPIRED_DOCUMENT";

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader
        title={company.name}
        description={`${COMPANY_TYPE_LABELS[company.type]} · ${company.country} · Reg. ${company.registrationNumber}`}
      >
        <div className="flex items-center gap-2">
          <VerificationStatusBadge status={company.verificationStatus} />
          <TierSelect companyId={company.id} tier={company.subscriptionTier} />
        </div>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Automated checks (US-103)</CardTitle>
            <CardDescription>
              Presence, expiry and scan status of the required documents.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {checks.map((check) => (
              <div key={check.kind} className="flex items-center justify-between gap-2">
                <span>{DOCUMENT_KIND_LABELS[check.kind as DocumentKind]}</span>
                <span className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <CheckIcon ok={check.present} /> present
                  </span>
                  <span className="flex items-center gap-1">
                    <CheckIcon ok={check.notExpired} /> valid
                    {check.expiresAt ? ` (to ${fmtDate(check.expiresAt)})` : ""}
                  </span>
                  <span className="flex items-center gap-1">
                    <CheckIcon ok={check.scanClean} /> scanned
                  </span>
                </span>
              </div>
            ))}
            <div className="border-t pt-2">
              {checksPass ? (
                <Badge variant="success">All checks pass</Badge>
              ) : (
                <Badge variant="warning">Checks incomplete — review before approving</Badge>
              )}
            </div>
            {decidable && <VerificationDecision companyId={company.id} />}
            {company.verificationStatus === "REJECTED" && company.rejectionReason && (
              <p className="text-xs text-muted-foreground">Rejected: {company.rejectionReason}</p>
            )}
            {company.verifiedAt && (
              <p className="text-xs text-muted-foreground">
                Verified {fmtDate(company.verifiedAt)} · re-verification due{" "}
                {fmtDate(company.reverificationDueAt)}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Submitted documents</CardTitle>
            <CardDescription>All versions, newest first per kind.</CardDescription>
          </CardHeader>
          <CardContent>
            {documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing uploaded yet.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {documents.map((doc) => (
                  <li key={doc.id} className="flex flex-wrap items-center gap-2">
                    <DocumentChip id={doc.id} fileName={doc.fileName} />
                    <span className="text-xs text-muted-foreground">
                      {DOCUMENT_KIND_LABELS[doc.kind]} · v{doc.version}
                      {doc.expiresAt ? ` · expires ${fmtDate(doc.expiresAt)}` : ""}
                    </span>
                    {doc.status === "SUPERSEDED" && <Badge variant="secondary">superseded</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Members & overrides (US-203)</CardTitle>
          <CardDescription>
            Every override requires a reason, is audited, and emails the affected user.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MemberOverrides members={company.members} />
        </CardContent>
      </Card>
    </div>
  );
}
