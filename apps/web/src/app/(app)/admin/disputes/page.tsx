import { Card, CardContent } from "@pharmachain/ui/components/card";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { apiServer } from "@/lib/api/server";
import type { DisputeRow } from "@/lib/api/types";
import { fmtDateTime } from "@/lib/format";
import { AdminDisputeActions, AdminDisputeStatusBadge } from "./resolve-panel";

export const metadata = { title: "Disputes" };

/** Platform dispute queue (Phase 2 §4): escalated complaints reviewed and
 *  resolved by the platform team, fully audited. */
export default async function AdminDisputesPage() {
  const api = await apiServer();
  const disputes = await api.get<DisputeRow[]>("/admin/disputes");

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Platform admin"
        title="Disputes & complaints"
        description="Open and escalated shipment disputes across the platform. Resolutions notify every party and land on the audit trail."
      />
      {disputes.length === 0 ? (
        <EmptyState title="No open disputes" hint="Escalated complaints appear here for review." />
      ) : (
        <div className="space-y-3">
          {disputes.map((d) => (
            <Card key={d.id}>
              <CardContent className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AdminDisputeStatusBadge status={d.status} />
                    <span className="font-medium">{d.subject}</span>
                  </div>
                  {d.order && (
                    <Link
                      href={`/orders/${d.order.id}`}
                      className="text-sm text-primary hover:underline"
                    >
                      {d.order.orderNo}
                    </Link>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{d.body}</p>
                {d.legalReference && (
                  <p className="text-xs text-muted-foreground">Reference: {d.legalReference}</p>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
                  <span className="text-xs text-muted-foreground">
                    {d.company.name}
                    {d.raisedBy ? ` · ${d.raisedBy.name} (${d.raisedBy.email})` : ""} ·{" "}
                    {fmtDateTime(d.createdAt)}
                    {d.escalatedAt ? ` · escalated ${fmtDateTime(d.escalatedAt)}` : ""}
                  </span>
                  <AdminDisputeActions dispute={d} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
