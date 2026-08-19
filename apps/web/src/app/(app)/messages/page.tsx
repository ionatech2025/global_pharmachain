import { Badge } from "@pharmachain/ui/components/badge";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { apiServer, getViewer } from "@/lib/api/server";
import type { ThreadRow } from "@/lib/api/types";
import { timeAgo } from "@/lib/format";

export const metadata = { title: "Messages" };

function entityRef(thread: ThreadRow): string {
  if (thread.order) return `Order ${thread.order.orderNo} — ${thread.order.title}`;
  if (thread.quotation) return `Quotation ${thread.quotation.refNo}`;
  if (thread.rfq) return `RFQ ${thread.rfq.refNo} — ${thread.rfq.title}`;
  return "Conversation";
}

export default async function MessagesPage() {
  const api = await apiServer();
  const [threads, me] = await Promise.all([
    api.get<ThreadRow[]>("/threads"),
    // Request-deduplicated: the layout already fetched this.
    getViewer(),
  ]);
  const myCompanyId = me.membership?.companyId;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="Messages"
        description="Conversations are tied to an RFQ, quotation or order — open one from its page."
      />

      {threads.length === 0 ? (
        <EmptyState
          title="No conversations yet"
          hint="Use the message button on an RFQ, quotation or order to start one."
        />
      ) : (
        <ul className="divide-y rounded-lg border">
          {threads.map((thread) => {
            const counterparty =
              thread.buyerCompany.id === myCompanyId ? thread.supplierCompany : thread.buyerCompany;
            const last = thread.messages[0];
            return (
              <li key={thread.id}>
                <Link
                  href={`/messages/${thread.id}`}
                  className="block px-4 py-3 transition-colors hover:bg-accent"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{counterparty.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {last ? timeAgo(last.createdAt) : timeAgo(thread.createdAt)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <Badge variant="outline" className="shrink-0">
                      {entityRef(thread)}
                    </Badge>
                    {last && (
                      <span className="truncate text-sm text-muted-foreground">{last.body}</span>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
