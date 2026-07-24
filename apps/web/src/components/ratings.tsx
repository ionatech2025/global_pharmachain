"use client";

import { RATEABLE_ROLE_LABELS, type RateableRole } from "@pharmachain/core";
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
import { Label } from "@pharmachain/ui/components/label";
import { Textarea } from "@pharmachain/ui/components/textarea";
import { cn } from "@pharmachain/ui/lib/utils";
import { BadgeCheck, Flag, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/http";
import { fmtDate } from "@/lib/format";

const inputClass =
  "h-10 rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25";

export function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span
      role="img"
      className={cn("inline-flex items-center gap-0.5", className)}
      aria-label={`${value} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn(
            "size-3.5",
            i <= Math.round(value) ? "fill-warning text-warning" : "text-border",
          )}
        />
      ))}
    </span>
  );
}

interface RateTarget {
  companyId: string;
  companyName: string;
  role: RateableRole;
}

/** Buyer rates each engaged party once the shipment is delivered (Phase 4 §3). */
export function RateEngagementButton({
  orderId,
  targets,
}: {
  orderId: string;
  targets: RateTarget[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [targetIdx, setTargetIdx] = useState(0);
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  if (targets.length === 0) return null;
  const target = targets[Math.min(targetIdx, targets.length - 1)] as RateTarget;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/orders/${orderId}/ratings`, {
        targetCompanyId: target.companyId,
        targetRole: target.role,
        stars,
        comment: comment || undefined,
      });
      toast.success(`Rated ${target.companyName} ${stars}★`);
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
          <Star className="size-4" /> Rate this engagement
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Rate the engagement</DialogTitle>
          <DialogDescription>
            One rating per partner per completed shipment, verified against the shipment record.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="rate-target">Partner</Label>
            <select
              id="rate-target"
              className={inputClass}
              value={targetIdx}
              onChange={(e) => setTargetIdx(Number(e.target.value))}
            >
              {targets.map((t, i) => (
                <option key={`${t.companyId}-${t.role}`} value={i}>
                  {t.companyName} · {RATEABLE_ROLE_LABELS[t.role]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label>Rating</Label>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`${i} star${i > 1 ? "s" : ""}`}
                  onClick={() => setStars(i)}
                  className="rounded p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Star
                    className={cn(
                      "size-6",
                      i <= stars ? "fill-warning text-warning" : "text-border",
                    )}
                  />
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="rate-comment">Comment (optional)</Label>
            <Textarea
              id="rate-comment"
              rows={3}
              maxLength={1000}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? "Submitting…" : "Submit rating"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export interface CompanyRatingsData {
  average: number | null;
  count: number;
  byRole: Array<{ role: string; average: number | null; count: number }>;
  trustedBadgeAt: string | null;
  featuredUntil: string | null;
  ratings: Array<{
    id: string;
    stars: number;
    comment: string | null;
    targetRole: string;
    createdAt: string;
    rater: { name: string };
    order: { orderNo: string };
  }>;
}

/** Aggregated performance metrics + reviews on the public profile (Phase 4 §3). */
export function CompanyRatings({
  data,
  canContest,
}: {
  data: CompanyRatingsData;
  canContest: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function contest(ratingId: string) {
    const reason = window.prompt("Why should the platform review this rating? (min 5 characters)");
    if (!reason || reason.trim().length < 5) return;
    setBusy(true);
    try {
      await api.post(`/ratings/${ratingId}/flag`, { reason });
      toast.success("Rating sent to platform moderation");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {data.trustedBadgeAt && (
          <Badge variant="success">
            <BadgeCheck className="size-3" /> Trusted Supplier
          </Badge>
        )}
        {data.average !== null ? (
          <span className="flex items-center gap-2">
            <Stars value={data.average} />
            <span className="text-sm font-medium tabular-nums">{data.average.toFixed(1)}</span>
            <span className="text-xs text-muted-foreground">{data.count} verified rating(s)</span>
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">No ratings yet.</span>
        )}
      </div>
      {data.byRole.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {data.byRole.map((r) => (
            <Badge key={r.role} variant="outline">
              {RATEABLE_ROLE_LABELS[r.role as RateableRole] ?? r.role}:{" "}
              {r.average === null ? "—" : r.average.toFixed(1)}★ ({r.count})
            </Badge>
          ))}
        </div>
      )}
      {data.ratings.length > 0 && (
        <ul className="space-y-2">
          {data.ratings.map((r) => (
            <li key={r.id} className="rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <Stars value={r.stars} />
                  <span className="text-xs text-muted-foreground">
                    {r.rater.name} · {r.order.orderNo} · {fmtDate(r.createdAt)}
                  </span>
                </span>
                {canContest && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => contest(r.id)}
                    aria-label="Contest this rating"
                  >
                    <Flag className="size-3.5" />
                  </Button>
                )}
              </div>
              {r.comment && <p className="mt-1 text-muted-foreground">{r.comment}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
