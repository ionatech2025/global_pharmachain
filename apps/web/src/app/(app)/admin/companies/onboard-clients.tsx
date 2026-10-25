"use client";

import {
  type ClientOnboardRow,
  COMPANY_TYPE_LABELS,
  COMPANY_TYPES,
  COUNTRIES,
  type CompanyType,
  parseClientOnboardCsv,
} from "@pharmachain/core";
import { Badge } from "@pharmachain/ui/components/badge";
import { Button } from "@pharmachain/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@pharmachain/ui/components/dialog";
import { Input } from "@pharmachain/ui/components/input";
import { Label } from "@pharmachain/ui/components/label";
import { Textarea } from "@pharmachain/ui/components/textarea";
import { Check, Copy, Download, FileSpreadsheet, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/http";
import type { ClientOnboardResponse } from "@/lib/api/types";

const SAMPLE_CSV = `companyName,companyType,country,contactName,contactEmail,contactPhone,registrationNumber
Victoria Pharma Distributors,FINISHED_PRODUCT_DISTRIBUTOR,Uganda,Dr. Sarah Kato,sarah@victoriapharma.co.ug,+256701000111,UG-VPD-2026
Rift Valley Medical Supplies,WHOLESALE_PHARMACY,Kenya,James Ochieng,james@riftvalleymed.co.ke,+254711000222,KE-RVM-2026
East Africa API Labs,RAW_MATERIAL_MANUFACTURER,Uganda,Grace Namuli,grace@eaapilabs.com,+256772000333,UG-EAA-2026`;

export function OnboardClientsDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"single" | "bulk">("bulk");
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ClientOnboardResponse | null>(null);

  // Single-client state
  const [companyName, setCompanyName] = useState("");
  const [companyType, setCompanyType] = useState<CompanyType>("SUPPLIER");
  const [country, setCountry] = useState("Uganda");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  // Bulk CSV state
  const [csvText, setCsvText] = useState("");
  const parsed = useMemo(() => parseClientOnboardCsv(csvText), [csvText]);

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setCsvText(reader.result);
      }
    };
    reader.readAsText(file);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const clients: ClientOnboardRow[] =
      mode === "single"
        ? [
            {
              companyName: companyName.trim(),
              companyType,
              country,
              registrationNumber: registrationNumber.trim() || undefined,
              contactName: contactName.trim(),
              contactEmail: contactEmail.trim(),
              contactPhone: contactPhone.trim() || undefined,
            },
          ]
        : parsed.rows;

    if (clients.length === 0) return;
    setBusy(true);
    try {
      const res = await api.post<ClientOnboardResponse>("/admin/companies/onboard", {
        clients,
        sendWelcomeEmail,
      });
      setResult(res);
      toast.success(
        `Onboarded ${res.created.length} client(s)${
          res.skipped.length > 0 ? ` (${res.skipped.length} skipped)` : ""
        }`,
      );
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function escapeCsvCell(val: string): string {
    // Defend against spreadsheet formula injection (=, +, -, @, tab, CR)
    const safe = /^[=+\-@\t\r]/.test(val) ? `'${val}` : val;
    return `"${safe.replace(/"/g, '""')}"`;
  }

  function downloadResultCsv() {
    if (!result) return;
    const header = "companyName,contactName,contactEmail,registrationNumber,setupUrl\n";
    const body = result.created
      .map((c) =>
        [
          escapeCsvCell(c.companyName),
          escapeCsvCell(c.contactName),
          escapeCsvCell(c.contactEmail),
          escapeCsvCell(c.registrationNumber),
          escapeCsvCell(c.setupUrl),
        ].join(","),
      )
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pharmachain-onboarded-clients-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function resetAll() {
    setResult(null);
    setCompanyName("");
    setRegistrationNumber("");
    setContactName("");
    setContactEmail("");
    setContactPhone("");
    setCsvText("");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setResult(null);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus className="size-4" /> Onboard clients
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Onboard client companies</DialogTitle>
          <DialogDescription>
            Set up a single client or bulk-import a list of up to 200 trial clients at once. Each
            company gets an active Company Admin account and a 7-day password setup link.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted/40 p-3.5 text-sm">
              <div className="flex items-center gap-2">
                <Check className="size-4 text-success" />
                <span className="font-medium">{result.created.length} client(s) created</span>
                {result.skipped.length > 0 && (
                  <Badge variant="warning">{result.skipped.length} skipped</Badge>
                )}
              </div>
              {result.created.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const text = result.created
                        .map((c) => `${c.companyName} (${c.contactEmail}): ${c.setupUrl}`)
                        .join("\n");
                      void navigator.clipboard.writeText(text);
                      toast.success("All setup links copied to clipboard");
                    }}
                  >
                    <Copy className="size-3.5" /> Copy all links
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={downloadResultCsv}>
                    <Download className="size-3.5" /> Download CSV
                  </Button>
                </div>
              )}
            </div>

            {result.created.length > 0 && (
              <div className="max-h-60 overflow-y-auto rounded-lg border">
                <table className="w-full text-left text-xs">
                  <thead className="border-b bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Company</th>
                      <th className="px-3 py-2 font-medium">Contact</th>
                      <th className="px-3 py-2 font-medium">Setup link</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {result.created.map((c) => (
                      <tr key={c.companyId}>
                        <td className="px-3 py-2 font-medium">{c.companyName}</td>
                        <td className="px-3 py-2 text-muted-foreground">{c.contactEmail}</td>
                        <td className="px-3 py-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => {
                              void navigator.clipboard.writeText(c.setupUrl);
                              toast.success(`Copied link for ${c.companyName}`);
                            }}
                          >
                            <Copy className="size-3" /> Copy link
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {result.skipped.length > 0 && (
              <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs">
                <p className="font-medium">Skipped rows ({result.skipped.length})</p>
                <ul className="mt-1 space-y-1 text-muted-foreground">
                  {result.skipped.map((s) => (
                    <li key={`${s.contactEmail}-${s.companyName}`}>
                      {s.companyName} ({s.contactEmail}) — {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={resetAll}>
                Onboard more
              </Button>
              <Button type="button" onClick={() => setOpen(false)}>
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div
              role="tablist"
              aria-label="Onboarding mode"
              className="flex gap-1 rounded-lg border bg-muted/40 p-1 text-sm"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === "bulk"}
                onClick={() => setMode("bulk")}
                className={`flex-1 rounded-md px-3 py-1.5 font-medium transition-colors ${
                  mode === "bulk"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Bulk list / CSV (up to 200 clients)
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "single"}
                onClick={() => setMode("single")}
                className={`flex-1 rounded-md px-3 py-1.5 font-medium transition-colors ${
                  mode === "single"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Single company
              </button>
            </div>

            {mode === "bulk" ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label htmlFor="bulk-csv">Paste CSV rows or upload a spreadsheet (.csv)</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => setCsvText(SAMPLE_CSV)}
                    >
                      <FileSpreadsheet className="size-3.5" /> Load sample format
                    </Button>
                    <label className="cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-accent">
                      Upload .csv
                      <input
                        type="file"
                        aria-label="Upload CSV file"
                        accept=".csv,text/csv"
                        className="sr-only"
                        onChange={handleFileUpload}
                      />
                    </label>
                  </div>
                </div>

                <Textarea
                  id="bulk-csv"
                  rows={6}
                  placeholder={SAMPLE_CSV}
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  Columns:{" "}
                  <code className="rounded bg-muted px-1 py-0.5">
                    companyName, companyType, country, contactName, contactEmail, contactPhone,
                    registrationNumber
                  </code>
                </p>

                {parsed.errors.length > 0 && (
                  <div
                    role="alert"
                    className="rounded-lg border border-destructive/40 bg-destructive/5 p-2.5 text-xs text-destructive-accent"
                  >
                    {parsed.errors.slice(0, 4).map((err) => (
                      <p key={err}>{err}</p>
                    ))}
                  </div>
                )}

                {parsed.rows.length > 0 && (
                  <div
                    aria-live="polite"
                    className="space-y-2 rounded-lg border bg-muted/20 p-2.5 text-xs"
                  >
                    <p className="font-medium text-foreground">
                      Ready to onboard {parsed.rows.length} client compan
                      {parsed.rows.length === 1 ? "y" : "ies"}
                    </p>
                    <div className="max-h-36 overflow-y-auto rounded border bg-background">
                      <table className="w-full text-left text-[11px]">
                        <thead className="border-b bg-muted/50 text-muted-foreground">
                          <tr>
                            <th className="px-2.5 py-1.5 font-medium">Company</th>
                            <th className="px-2.5 py-1.5 font-medium">Type</th>
                            <th className="px-2.5 py-1.5 font-medium">Country</th>
                            <th className="px-2.5 py-1.5 font-medium">Contact</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {parsed.rows.slice(0, 6).map((r) => (
                            <tr key={`${r.contactEmail}-${r.companyName}`}>
                              <td className="px-2.5 py-1 font-medium">{r.companyName}</td>
                              <td className="px-2.5 py-1 text-muted-foreground">
                                {COMPANY_TYPE_LABELS[r.companyType]}
                              </td>
                              <td className="px-2.5 py-1">{r.country}</td>
                              <td className="px-2.5 py-1 text-muted-foreground">
                                {r.contactName} ({r.contactEmail})
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="onboard-company-name">Company name</Label>
                  <Input
                    id="onboard-company-name"
                    required
                    minLength={2}
                    placeholder="e.g. Victoria Pharma Distributors"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="onboard-company-type">Company type</Label>
                    <select
                      id="onboard-company-type"
                      value={companyType}
                      onChange={(e) => setCompanyType(e.target.value as CompanyType)}
                      className="h-10 rounded-lg border border-input bg-transparent px-3 text-sm"
                    >
                      {COMPANY_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {COMPANY_TYPE_LABELS[t]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="onboard-country">Country</Label>
                    <select
                      id="onboard-country"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      className="h-10 rounded-lg border border-input bg-transparent px-3 text-sm"
                    >
                      {COUNTRIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="onboard-contact-name">Primary contact name</Label>
                    <Input
                      id="onboard-contact-name"
                      required
                      minLength={2}
                      placeholder="Dr. Sarah Kato"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="onboard-contact-email">Work email</Label>
                    <Input
                      id="onboard-contact-email"
                      type="email"
                      required
                      placeholder="sarah@company.com"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="onboard-phone">Contact phone (optional)</Label>
                    <Input
                      id="onboard-phone"
                      placeholder="+256 700 000000"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="onboard-reg">Registration no. (auto if blank)</Label>
                    <Input
                      id="onboard-reg"
                      placeholder="e.g. RC-982341"
                      value={registrationNumber}
                      onChange={(e) => setRegistrationNumber(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={sendWelcomeEmail}
                onChange={(e) => setSendWelcomeEmail(e.target.checked)}
                className="rounded border-input"
              />
              Email each primary contact their welcome & password-setup link automatically
            </label>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  busy ||
                  (mode === "bulk"
                    ? parsed.rows.length === 0
                    : companyName.trim().length < 2 ||
                      contactName.trim().length < 2 ||
                      !contactEmail.includes("@"))
                }
              >
                {busy
                  ? "Onboarding…"
                  : mode === "bulk"
                    ? `Onboard ${parsed.rows.length || ""} client(s)`
                    : "Onboard client"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
