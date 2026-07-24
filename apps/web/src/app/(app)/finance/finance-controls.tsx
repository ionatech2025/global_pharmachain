"use client";

import { CURRENCIES } from "@pharmachain/core";
import { Button } from "@pharmachain/ui/components/button";
import { Label } from "@pharmachain/ui/components/label";
import { Switch } from "@pharmachain/ui/components/switch";
import { Download } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/http";

const selectClass =
  "h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25";

/** Preferred display currency (Phase 3 §3) — applied across the app. */
export function CurrencyPreference({ current }: { current: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function change(value: string) {
    setBusy(true);
    try {
      await api.patch("/me/currency", { preferredCurrency: value || null });
      toast.success(value ? `Prices now also shown in ${value}` : "Display currency cleared");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="pref-currency" className="text-xs text-muted-foreground">
        Display currency
      </Label>
      <select
        id="pref-currency"
        className={selectClass}
        defaultValue={current ?? ""}
        disabled={busy}
        onChange={(e) => change(e.target.value)}
      >
        <option value="">Original</option>
        {CURRENCIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </div>
  );
}

/** CSV / Excel / PDF export links for the company report (Phase 3 §4). */
export function ExportButtons() {
  return (
    <div className="flex flex-wrap gap-2">
      {(["csv", "xls", "pdf"] as const).map((format) => (
        <Button key={format} asChild size="sm" variant="outline">
          <a href={`/api/proxy/finance/report?format=${format}`} download>
            <Download className="size-3.5" /> {format.toUpperCase()}
          </a>
        </Button>
      ))}
    </div>
  );
}

/** Weekly/monthly scheduled email report opt-in (Phase 3 §4). */
export function ScheduleToggle({
  initial,
}: {
  initial: { frequency: string; active: boolean } | null;
}) {
  const [active, setActive] = useState(initial?.active ?? false);
  const [frequency, setFrequency] = useState(initial?.frequency ?? "WEEKLY");
  const [busy, setBusy] = useState(false);

  async function save(nextActive: boolean, nextFrequency: string) {
    setBusy(true);
    try {
      await api.post("/finance/schedule", {
        report: "company-finance",
        frequency: nextFrequency,
        active: nextActive,
      });
      toast.success(
        nextActive
          ? `${nextFrequency === "WEEKLY" ? "Weekly" : "Monthly"} report enabled`
          : "Scheduled report disabled",
      );
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Switch
        id="schedule-active"
        checked={active}
        disabled={busy}
        onCheckedChange={(next) => {
          setActive(next);
          void save(next, frequency);
        }}
      />
      <Label htmlFor="schedule-active" className="text-sm">
        Email me this report
      </Label>
      <select
        className={selectClass}
        value={frequency}
        disabled={busy || !active}
        onChange={(e) => {
          setFrequency(e.target.value);
          void save(active, e.target.value);
        }}
      >
        <option value="WEEKLY">Weekly (Mondays)</option>
        <option value="MONTHLY">Monthly (1st)</option>
      </select>
    </div>
  );
}
