import { COMPANY_TYPE_LABELS } from "@pharmachain/core";
import { Badge } from "@pharmachain/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pharmachain/ui/components/card";
import { PageHeader } from "@/components/page-header";
import { VerificationStatusBadge } from "@/components/status-badge";
import { apiServer } from "@/lib/api/server";
import type { CompanyMe } from "@/lib/api/types";
import { fmtDate } from "@/lib/format";
import { ProfileForm, PublishProfileButton } from "./profile-form";

export const metadata = { title: "Company profile" };

export default async function CompanyPage() {
  const api = await apiServer();
  const company = await api.get<CompanyMe>("/companies/me");

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title={company.name}
        description={`${COMPANY_TYPE_LABELS[company.type]} · ${company.country}`}
      >
        <div className="flex items-center gap-2">
          <VerificationStatusBadge status={company.verificationStatus} />
          {company.profileStatus === "PUBLISHED" ? (
            <Badge variant="success">Profile published</Badge>
          ) : (
            <PublishProfileButton verified={company.verificationStatus === "VERIFIED"} />
          )}
        </div>
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Registration details</CardTitle>
          <CardDescription>
            Fixed at registration — contact the platform team to correct them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Registration number</dt>
            <dd>{company.registrationNumber}</dd>
            <dt className="text-muted-foreground">Address</dt>
            <dd>{company.address}</dd>
            <dt className="text-muted-foreground">Primary contact</dt>
            <dd>
              {company.primaryContactName} ({company.primaryContactEmail})
            </dd>
            <dt className="text-muted-foreground">Subscription</dt>
            <dd className="capitalize">{company.subscriptionTier.toLowerCase()}</dd>
            <dt className="text-muted-foreground">Registered</dt>
            <dd>{fmtDate(company.createdAt)}</dd>
            {company.verifiedAt && (
              <>
                <dt className="text-muted-foreground">Verified</dt>
                <dd>
                  {fmtDate(company.verifiedAt)} — re-verification due{" "}
                  {fmtDate(company.reverificationDueAt)}
                </dd>
              </>
            )}
          </dl>
        </CardContent>
      </Card>

      <ProfileForm company={company} />
    </div>
  );
}
