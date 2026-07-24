"use client";

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
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/http";
import type { TaxRuleRow } from "@/lib/api/types";

export function NewTaxRuleButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    hsPrefix: "",
    originCountry: "",
    destCountry: "",
    dutyRatePct: "",
    vatRatePct: "",
    notes: "",
  });
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/admin/tax-rules", {
        hsPrefix: form.hsPrefix,
        originCountry: form.originCountry || undefined,
        destCountry: form.destCountry,
        dutyRatePct: Number(form.dutyRatePct),
        vatRatePct: Number(form.vatRatePct),
        notes: form.notes || undefined,
      });
      toast.success("Tax rule created");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" /> New rule
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New duty/VAT rule</DialogTitle>
          <DialogDescription>
            Longest matching HS prefix wins for a destination; empty origin matches any lane.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="tr-hs">HS prefix</Label>
              <Input
                id="tr-hs"
                required
                pattern="\d{2,10}"
                placeholder="2936"
                value={form.hsPrefix}
                onChange={set("hsPrefix")}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tr-dest">Destination country</Label>
              <Input
                id="tr-dest"
                required
                placeholder="Uganda"
                value={form.destCountry}
                onChange={set("destCountry")}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tr-origin">Origin (optional)</Label>
              <Input
                id="tr-origin"
                placeholder="Any"
                value={form.originCountry}
                onChange={set("originCountry")}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tr-duty">Duty %</Label>
              <Input
                id="tr-duty"
                required
                type="number"
                min="0"
                max="100"
                step="0.001"
                value={form.dutyRatePct}
                onChange={set("dutyRatePct")}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tr-vat">VAT %</Label>
              <Input
                id="tr-vat"
                required
                type="number"
                min="0"
                max="100"
                step="0.001"
                value={form.vatRatePct}
                onChange={set("vatRatePct")}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tr-notes">Notes</Label>
              <Input id="tr-notes" maxLength={300} value={form.notes} onChange={set("notes")} />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create rule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ToggleRuleButton({ rule }: { rule: TaxRuleRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    try {
      await api.patch(`/admin/tax-rules/${rule.id}`, { active: !rule.active });
      toast.success(rule.active ? "Rule deactivated" : "Rule activated");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(false);
    }
  }
  return (
    <Button size="sm" variant="ghost" onClick={toggle} disabled={busy}>
      {rule.active ? "Deactivate" : "Activate"}
    </Button>
  );
}

export function ActiveBadge({ active }: { active: boolean }) {
  return <Badge variant={active ? "success" : "secondary"}>{active ? "Active" : "Inactive"}</Badge>;
}
