"use client";

import { CURRENCIES, type ParamType, validateParamValue } from "@pharmachain/core";
import { Button } from "@pharmachain/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pharmachain/ui/components/card";
import { Input } from "@pharmachain/ui/components/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@pharmachain/ui/components/table";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/http";
import type { ExchangeRateRow, SystemParameterRow } from "@/lib/api/types";
import { fmtDate } from "@/lib/format";

export function ParametersPanel({ parameters }: { parameters: SystemParameterRow[] }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function save(param: SystemParameterRow) {
    const value = drafts[param.key];
    if (value === undefined || value === param.value) return;
    setBusyKey(param.key);
    try {
      await api.put("/admin/parameters", { key: param.key, value });
      toast.success(`${param.key} updated`);
      setDrafts((prev) => {
        const { [param.key]: _saved, ...rest } = prev;
        return rest;
      });
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">System parameters</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {parameters.map((param) => {
          const draft = drafts[param.key];
          // US-904: invalid values are rejected inline, before the server sees them.
          const invalid =
            draft !== undefined &&
            draft !== param.value &&
            !validateParamValue(param.type as ParamType, draft);
          return (
            <div key={param.key} className="flex flex-wrap items-center gap-2">
              <div className="min-w-64 flex-1">
                <p className="font-mono text-xs font-medium">{param.key}</p>
                <p className="text-xs text-muted-foreground">
                  {param.description} ({param.type})
                </p>
              </div>
              <div className="grid gap-1">
                <Input
                  className="w-40"
                  inputMode={param.type === "currency" ? "text" : "numeric"}
                  aria-invalid={invalid || undefined}
                  aria-label={`Value for ${param.key}`}
                  value={draft ?? param.value}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [param.key]: e.target.value }))}
                />
                {invalid && (
                  <p className="text-xs text-destructive">
                    {param.type === "currency"
                      ? "Three-letter ISO code, e.g. USD"
                      : param.type === "csv-int"
                        ? "Comma-separated positive integers, e.g. 60,30,7"
                        : "Must be a non-negative number"}
                  </p>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={
                  busyKey === param.key ||
                  drafts[param.key] === undefined ||
                  drafts[param.key] === param.value ||
                  invalid
                }
                onClick={() => save(param)}
              >
                Save
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

/** Manual display-only conversion rates (US-302). */
export function ExchangeRatesPanel({ rates }: { rates: ExchangeRateRow[] }) {
  const router = useRouter();
  const [base, setBase] = useState("USD");
  const [quote, setQuote] = useState("UGX");
  const [rate, setRate] = useState("");
  const [busy, setBusy] = useState(false);

  async function upsert(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put("/admin/exchange-rates", { base, quote, rate });
      toast.success(`1 ${base} = ${rate} ${quote} saved`);
      setRate("");
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
        <CardTitle className="text-sm">Exchange rates</CardTitle>
        <CardDescription>
          Used only to display indicative converted prices in the marketplace.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={upsert} className="flex flex-wrap items-end gap-2">
          <select
            aria-label="Base currency"
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
            value={base}
            onChange={(e) => setBase(e.target.value)}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <span className="pb-2 text-sm text-muted-foreground">→</span>
          <select
            aria-label="Quote currency"
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
            value={quote}
            onChange={(e) => setQuote(e.target.value)}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <Input
            className="w-36"
            inputMode="decimal"
            placeholder="Rate"
            required
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Set rate"}
          </Button>
        </form>

        {rates.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pair</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rates.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    {r.base}/{r.quote}
                  </TableCell>
                  <TableCell>{r.rate}</TableCell>
                  <TableCell className="text-muted-foreground">{fmtDate(r.updatedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
