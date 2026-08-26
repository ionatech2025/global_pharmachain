"use client";

import { Badge } from "@pharmachain/ui/components/badge";
import { Button } from "@pharmachain/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pharmachain/ui/components/card";
import { Download, Link2, ShieldCheck, ShieldX } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api/browser";
import { fmtDateTime } from "@/lib/format";

interface TraceData {
  orderNo: string;
  events: Array<{ seq: number; type: string; at: string; hash: string }>;
  verification: {
    chainIntact: boolean;
    historyMatches: boolean;
    headHash: string;
    length: number;
  };
}

/** Hash-chained traceability ledger for this order (Phase 5 §2). */
export function TraceCard({ orderId }: { orderId: string }) {
  const [data, setData] = useState<TraceData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api
      .get<TraceData>(`/orders/${orderId}/trace`)
      .then(setData)
      .catch(() => setFailed(true));
  }, [orderId]);

  if (failed) return null;
  const verified = data?.verification.chainIntact && data?.verification.historyMatches;
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="text-sm">Traceability ledger</CardTitle>
          <CardDescription>
            Every event hash-chained to its predecessor — tamper-evident from origin to delivery.
            Anyone can verify a hash at /verify without an account.
          </CardDescription>
        </div>
        {data && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={verified ? "success" : "destructive"}>
              {verified ? (
                <>
                  <ShieldCheck className="size-3" /> Chain verified
                </>
              ) : (
                <>
                  <ShieldX className="size-3" /> Integrity check failed
                </>
              )}
            </Badge>
            <Button asChild size="sm" variant="outline">
              <a href={`/api/proxy/orders/${orderId}/trace/report`} download>
                <Download className="size-3.5" /> Report (PDF)
              </a>
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {!data ? (
          <p className="text-sm text-muted-foreground">Building & verifying the chain…</p>
        ) : (
          <div className="space-y-2">
            <ol className="space-y-1">
              {data.events.slice(-6).map((event) => (
                <li key={event.seq} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2">
                    <span className="text-display w-6 text-sm text-muted-foreground">
                      {event.seq}
                    </span>
                    <code className="text-xs">{event.type}</code>
                    <span className="text-xs text-muted-foreground">{fmtDateTime(event.at)}</span>
                  </span>
                  <button
                    type="button"
                    className="flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      void navigator.clipboard?.writeText(event.hash);
                      toast.success(`Hash for event ${event.seq} copied — verify it at /verify`);
                    }}
                  >
                    <Link2 className="size-3" />
                    {event.hash.slice(0, 14)}…
                  </button>
                </li>
              ))}
            </ol>
            <p className="text-xs text-muted-foreground">
              {data.verification.length} sealed event(s) · head{" "}
              <code>{data.verification.headHash.slice(0, 20)}…</code>
              {data.events.length > 6 ? ` · showing the latest 6` : ""}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
