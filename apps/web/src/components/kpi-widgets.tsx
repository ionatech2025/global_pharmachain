"use client";

import { DASHBOARD_WIDGETS } from "@pharmachain/core";
import { Button } from "@pharmachain/ui/components/button";
import { Card } from "@pharmachain/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@pharmachain/ui/components/dialog";
import { ArrowDown, ArrowUp, Settings2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/http";

export interface Kpi {
  key: string;
  label: string;
  value: string;
  detail: string;
  href?: string;
}

/** Role-specific KPI grid rendered from the user's widget layout (Phase 4 §2). */
export function KpiGrid({ kpis, widgets }: { kpis: Kpi[]; widgets: string[] }) {
  const byKey = new Map(kpis.map((k) => [k.key, k]));
  const visible = widgets.map((key) => byKey.get(key)).filter((k): k is Kpi => Boolean(k));
  if (visible.length === 0) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {visible.map((kpi) => {
        const body = (
          <Card className="gap-1 px-4 py-4 transition-colors hover:border-primary/40">
            <p className="text-sm font-medium text-muted-foreground">{kpi.label}</p>
            <p className="text-display mt-1 text-[1.6rem] tabular-nums">{kpi.value}</p>
            <p className="text-xs text-muted-foreground">{kpi.detail}</p>
          </Card>
        );
        return kpi.href ? (
          <Link key={kpi.key} href={kpi.href}>
            {body}
          </Link>
        ) : (
          <div key={kpi.key}>{body}</div>
        );
      })}
    </div>
  );
}

/** Choose + arrange widgets; saved per user (Phase 4 §2). */
export function CustomizeDashboardButton({
  widgets,
  available,
}: {
  widgets: string[];
  available: Array<{ key: string; label: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState<string[]>(widgets);
  const [busy, setBusy] = useState(false);
  const labelFor = (key: string) =>
    available.find((w) => w.key === key)?.label ??
    DASHBOARD_WIDGETS.find((w) => w.key === key)?.label ??
    key;

  function toggle(key: string) {
    setSelection((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
    );
  }
  function move(key: string, delta: number) {
    setSelection((current) => {
      const idx = current.indexOf(key);
      const next = [...current];
      const target = idx + delta;
      if (idx < 0 || target < 0 || target >= next.length) return current;
      [next[idx], next[target]] = [next[target] as string, next[idx] as string];
      return next;
    });
  }

  async function save() {
    setBusy(true);
    try {
      await api.put("/me/dashboard", { widgets: selection });
      toast.success("Dashboard layout saved");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Settings2 className="size-4" /> Customize
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Customize your dashboard</DialogTitle>
          <DialogDescription>
            Choose which KPI widgets appear and arrange their order — saved to your account.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            {selection.map((key, i) => (
              <div
                key={key}
                className="flex items-center justify-between rounded-lg border px-3 py-1.5 text-sm"
              >
                <span>{labelFor(key)}</span>
                <span className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    aria-label={`Move ${labelFor(key)} up`}
                    disabled={i === 0}
                    onClick={() => move(key, -1)}
                  >
                    <ArrowUp className="size-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    aria-label={`Move ${labelFor(key)} down`}
                    disabled={i === selection.length - 1}
                    onClick={() => move(key, 1)}
                  >
                    <ArrowDown className="size-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => toggle(key)}>
                    Remove
                  </Button>
                </span>
              </div>
            ))}
          </div>
          {available.filter((w) => !selection.includes(w.key)).length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Available widgets
              </p>
              <div className="flex flex-wrap gap-1.5">
                {available
                  .filter((w) => !selection.includes(w.key))
                  .map((w) => (
                    <Button key={w.key} size="sm" variant="outline" onClick={() => toggle(w.key)}>
                      + {w.label}
                    </Button>
                  ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save layout"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
