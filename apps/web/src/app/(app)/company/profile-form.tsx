"use client";

import { Button } from "@pharmachain/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pharmachain/ui/components/card";
import { Input } from "@pharmachain/ui/components/input";
import { Label } from "@pharmachain/ui/components/label";
import { Textarea } from "@pharmachain/ui/components/textarea";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { UploadButton } from "@/components/upload-button";
import { api } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/http";
import type { CompanyMe } from "@/lib/api/types";

/** Public marketplace profile (US-301): what verified buyers/suppliers see. */
export function ProfileForm({ company }: { company: CompanyMe }) {
  const router = useRouter();
  const [description, setDescription] = useState(company.profileDescription ?? "");
  const [countries, setCountries] = useState(company.countriesOfOperation.join(", "));
  const [certifications, setCertifications] = useState(company.displayedCertifications.join(", "));
  const [website, setWebsite] = useState(company.website ?? "");
  const [contactPhone, setContactPhone] = useState(company.primaryContactPhone ?? "");
  const [busy, setBusy] = useState(false);

  function splitList(value: string): string[] {
    return value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.patch("/companies/me", {
        description: description || undefined,
        countriesOfOperation: splitList(countries),
        displayedCertifications: splitList(certifications),
        website,
        contactPhone: contactPhone || undefined,
      });
      toast.success("Profile saved");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Public profile</CardTitle>
        <CardDescription>
          Shown on your marketplace page once published. Publishing requires a verified company.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex items-center gap-3 border-b pb-4">
          <div>
            <p className="text-sm font-medium">Company logo</p>
            <p className="text-xs text-muted-foreground">
              PNG or JPG, up to 10 MB — shown on your public profile (US-301).
            </p>
          </div>
          <div className="ml-auto">
            <UploadButton kind="COMPANY_LOGO" label="Upload logo" />
          </div>
        </div>
        <form onSubmit={save} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              rows={4}
              maxLength={2000}
              placeholder="What your company manufactures or supplies, capabilities, markets served…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="countries">Countries of operation</Label>
              <Input
                id="countries"
                placeholder="Uganda, Kenya, Tanzania"
                value={countries}
                onChange={(e) => setCountries(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Comma-separated.</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="certifications">Displayed certifications</Label>
              <Input
                id="certifications"
                placeholder="WHO-GMP, ISO 9001"
                value={certifications}
                onChange={(e) => setCertifications(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Comma-separated.</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                type="url"
                placeholder="https://example.com"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contactPhone">Contact phone</Label>
              <Input
                id="contactPhone"
                placeholder="+256700000000"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save profile"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function PublishProfileButton({ verified }: { verified: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function publish() {
    setBusy(true);
    try {
      await api.post("/companies/me/profile/publish");
      toast.success("Profile published — your company now appears in the marketplace");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" onClick={publish} disabled={busy || !verified}>
      {verified ? "Publish profile" : "Publish (needs verification)"}
    </Button>
  );
}
