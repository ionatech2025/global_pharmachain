import { DOCUMENT_KIND_LABELS, DOCUMENT_KINDS, type DocumentKind } from "@pharmachain/core";
import { Badge } from "@pharmachain/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@pharmachain/ui/components/table";
import Link from "next/link";
import { DocumentChip } from "@/components/document-chip";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { apiServer } from "@/lib/api/server";
import type { DocumentRow } from "@/lib/api/types";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "Documents" };

function ExpiryBadge({ expiresAt }: { expiresAt: string | null }) {
  if (!expiresAt) return null;
  const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return <Badge variant="destructive">expired {fmtDate(expiresAt)}</Badge>;
  if (days <= 60) return <Badge variant="warning">expires in {days}d</Badge>;
  return <span className="text-xs text-muted-foreground">{fmtDate(expiresAt)}</span>;
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; expiring?: string }>;
}) {
  const params = await searchParams;
  const kind = DOCUMENT_KINDS.includes(params.kind as DocumentKind) ? params.kind : undefined;
  const api = await apiServer();
  const documents = await api.get<DocumentRow[]>("/documents", {
    query: { kind, expiringWithinDays: params.expiring ? 60 : undefined },
  });
  const kindsPresent = [...new Set(documents.map((d) => d.kind))];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Documents"
        description="Everything your company has uploaded — verification, orders, SDS and attachments. Superseded versions are retained."
      >
        <Link
          href={params.expiring ? "/documents" : "/documents?expiring=1"}
          className={`rounded-md px-3 py-1.5 text-sm ${
            params.expiring
              ? "bg-primary/10 font-medium text-primary"
              : "text-muted-foreground hover:bg-accent"
          }`}
        >
          Expiring within 60 days
        </Link>
      </PageHeader>

      <div className="flex flex-wrap gap-1 text-sm">
        <Link
          href="/documents"
          className={`rounded-md px-2.5 py-1 ${!kind ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-accent"}`}
        >
          All
        </Link>
        {kindsPresent.map((k) => (
          <Link
            key={k}
            href={`/documents?kind=${k}`}
            className={`rounded-md px-2.5 py-1 ${kind === k ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-accent"}`}
          >
            {DOCUMENT_KIND_LABELS[k]}
          </Link>
        ))}
      </div>

      {documents.length === 0 ? (
        <EmptyState
          title="No documents"
          hint="Upload verification documents from Company → Verification, SDS from a listing, and order documents from an order page."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead>Expiry</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.map((doc) => (
              <TableRow key={doc.id} className={doc.status === "SUPERSEDED" ? "opacity-60" : ""}>
                <TableCell>
                  <DocumentChip id={doc.id} fileName={doc.fileName} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {DOCUMENT_KIND_LABELS[doc.kind]}
                </TableCell>
                <TableCell>v{doc.version}</TableCell>
                <TableCell className="text-muted-foreground">
                  {fmtDate(doc.createdAt)} · {doc.uploadedBy.name}
                </TableCell>
                <TableCell>
                  <ExpiryBadge expiresAt={doc.expiresAt} />
                </TableCell>
                <TableCell>
                  {doc.status === "SUPERSEDED" ? (
                    <Badge variant="secondary">superseded</Badge>
                  ) : doc.scanStatus === "PENDING" ? (
                    <Badge variant="outline">scan pending</Badge>
                  ) : (
                    <Badge variant="success">active</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
