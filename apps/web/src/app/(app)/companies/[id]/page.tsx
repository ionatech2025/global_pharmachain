import { COMPANY_TYPE_LABELS, type CompanyType } from "@pharmachain/core";
import { Badge } from "@pharmachain/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@pharmachain/ui/components/card";
import { ShieldCheck } from "lucide-react";
import { notFound as notFoundPage } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ApiClientError } from "@/lib/api/http";
import { apiServer } from "@/lib/api/server";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "Company profile" };

interface PublicCompany {
  id: string;
  name: string;
  type: string;
  country: string;
  website: string | null;
  subscriptionTier: "FREEMIUM" | "PREMIUM" | "FEATURED";
  profileDescription: string | null;
  countriesOfOperation: string[];
  displayedCertifications: string[];
  verifiedAt: string | null;
  logoDocumentId: string | null;
  _count: { listings: number };
}

export default async function CompanyProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const api = await apiServer();

  let company: PublicCompany;
  try {
    company = await api.get<PublicCompany>(`/companies/${id}`);
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 404) notFoundPage();
    throw err;
  }

  // US-301: render the uploaded logo via a short-lived signed URL.
  let logoUrl: string | null = null;
  if (company.logoDocumentId) {
    try {
      const { url } = await api.get<{ url: string }>(
        `/documents/${company.logoDocumentId}/download-url`,
      );
      logoUrl = url;
    } catch {
      logoUrl = null;
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-start gap-4">
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={`${company.name} logo`}
            className="mt-1 size-16 shrink-0 rounded-lg border border-border bg-white object-contain p-1"
          />
        )}
        <div className="flex-1">
          <PageHeader
            title={company.name}
            description={`${COMPANY_TYPE_LABELS[company.type as CompanyType] ?? company.type} · ${company.country}`}
          >
            <Badge variant="success">
              <ShieldCheck className="size-3" /> Verified
              {company.verifiedAt ? ` · ${fmtDate(company.verifiedAt)}` : ""}
            </Badge>
            {company.subscriptionTier !== "FREEMIUM" && (
              <Badge variant="warning">
                {company.subscriptionTier === "FEATURED" ? "Featured supplier" : "Premium supplier"}
              </Badge>
            )}
          </PageHeader>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">About</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="whitespace-pre-wrap">
            {company.profileDescription ?? "No description provided."}
          </p>
          <p>
            <span className="text-muted-foreground">Published listings:</span>{" "}
            {company._count.listings}
          </p>
          {company.countriesOfOperation.length > 0 && (
            <p>
              <span className="text-muted-foreground">Operates in:</span>{" "}
              {company.countriesOfOperation.join(", ")}
            </p>
          )}
          {company.displayedCertifications.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {company.displayedCertifications.map((cert) => (
                <Badge key={cert} variant="secondary">
                  {cert}
                </Badge>
              ))}
            </div>
          )}
          {company.website && (
            <a
              href={company.website}
              target="_blank"
              rel="noreferrer noopener"
              className="text-primary underline"
            >
              {company.website}
            </a>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
