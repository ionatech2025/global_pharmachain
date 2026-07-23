"use client";

import { Button } from "@pharmachain/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@pharmachain/ui/components/dialog";
import { Input } from "@pharmachain/ui/components/input";
import { Label } from "@pharmachain/ui/components/label";
import { BookmarkPlus, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/http";

export interface SearchParamsShape {
  q?: string;
  kind?: string;
  categoryId?: string;
  country?: string;
}

interface SavedSearchRow {
  id: string;
  name: string;
  params: SearchParamsShape;
}

function hrefFor(params: SearchParamsShape): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  return `/marketplace?${search.toString()}`;
}

/**
 * Saved marketplace searches (deferred item): keep the current filters under
 * a name, re-run them from a chip, and a daily job alerts on new matches.
 */
export function SavedSearches({ current }: { current: SearchParamsShape }) {
  const [saved, setSaved] = useState<SavedSearchRow[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const hasFilters = Object.values(current).some(Boolean);

  useEffect(() => {
    api
      .get<SavedSearchRow[]>("/saved-searches")
      .then(setSaved)
      .catch(() => setSaved([]));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const row = await api.post<SavedSearchRow>("/saved-searches", { name, params: current });
      setSaved((prev) => [row, ...prev]);
      setOpen(false);
      setName("");
      toast.success("Search saved — you'll be alerted when new listings match");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await api.delete(`/saved-searches/${id}`);
      setSaved((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  if (saved.length === 0 && !hasFilters) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {hasFilters && (
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <BookmarkPlus className="size-3.5" />
          Save this search
        </Button>
      )}
      {saved.map((s) => (
        <span
          key={s.id}
          className="inline-flex items-center gap-1 rounded-full border bg-card px-2.5 py-0.5 text-xs font-medium"
        >
          <Link href={hrefFor(s.params)} className="hover:underline">
            {s.name}
          </Link>
          <button
            type="button"
            aria-label={`Delete saved search ${s.name}`}
            className="text-muted-foreground transition-colors hover:text-destructive"
            onClick={() => remove(s.id)}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save this search</DialogTitle>
            <DialogDescription>
              You'll get an in-app and email alert whenever new listings match it.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="search-name">Name</Label>
              <Input
                id="search-name"
                required
                minLength={2}
                maxLength={60}
                placeholder="e.g. Paracetamol APIs from Uganda"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save search"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
