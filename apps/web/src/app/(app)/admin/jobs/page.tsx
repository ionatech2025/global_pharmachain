import { Badge } from "@pharmachain/ui/components/badge";
import { Card, CardContent } from "@pharmachain/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@pharmachain/ui/components/table";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { apiServer } from "@/lib/api/server";
import { fmtDateTime, timeAgo } from "@/lib/format";

export const metadata = { title: "Job health" };

interface Heartbeat {
  name: string;
  lastRunAt: string;
  lastOkAt: string | null;
  lastError: string | null;
  durationMs: number | null;
}

const STALE_AFTER_MS = 26 * 60 * 60 * 1000; // daily cadence + slack

/** Job freshness (P0 remediation): every scheduled run — cron worker or the
 *  HTTP dispatcher — writes a heartbeat; staleness here is the alarm the
 *  original architecture lacked. */
export default async function AdminJobsPage() {
  const api = await apiServer();
  const heartbeats = await api.get<Heartbeat[]>("/jobs/heartbeats");
  const now = Date.now();

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Platform admin"
        title="Job health"
        description="Freshness per scheduled job. GitHub Actions drives the dispatcher every 10 minutes (frequent tier) and daily at 05:00 UTC."
      />
      {heartbeats.length === 0 ? (
        <EmptyState
          title="No heartbeats yet"
          hint="Heartbeats appear after the first dispatcher run (GitHub Actions → /jobs/run)."
        />
      ) : (
        <Card>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Last run</TableHead>
                  <TableHead>Last success</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {heartbeats.map((hb) => {
                  const stale = now - new Date(hb.lastRunAt).getTime() > STALE_AFTER_MS;
                  const failing = hb.lastError !== null;
                  return (
                    <TableRow key={hb.name}>
                      <TableCell className="font-mono text-xs">{hb.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {timeAgo(hb.lastRunAt)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {hb.lastOkAt ? fmtDateTime(hb.lastOkAt) : "never"}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {hb.durationMs === null ? "—" : `${hb.durationMs} ms`}
                      </TableCell>
                      <TableCell>
                        {failing ? (
                          <Badge variant="destructive" title={hb.lastError ?? undefined}>
                            failing
                          </Badge>
                        ) : stale ? (
                          <Badge variant="warning">stale</Badge>
                        ) : (
                          <Badge variant="success">healthy</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
