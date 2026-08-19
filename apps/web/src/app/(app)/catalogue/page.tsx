import { Badge } from "@pharmachain/ui/components/badge";
import { Button } from "@pharmachain/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@pharmachain/ui/components/table";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { ListingStatusBadge } from "@/components/status-badge";
import { apiServer } from "@/lib/api/server";
import type { ListingRow } from "@/lib/api/types";
import { fmtMoney } from "@/lib/format";
import { ListingRowActions } from "./listing-actions";

export const metadata = { title: "My catalogue" };

export default async function CataloguePage() {
  const api = await apiServer();
  const listings = await api.get<ListingRow[]>("/catalogue");

  return (
    <div className="space-y-4">
      <PageHeader
        title="My catalogue"
        description="Raw materials and finished products your company offers."
      >
        <Button asChild>
          <Link href="/catalogue/new">Add listing</Link>
        </Button>
      </PageHeader>

      {listings.length === 0 ? (
        <EmptyState
          title="No listings yet"
          hint="Add raw materials or finished products. Publishing requires a verified company with a published profile."
        >
          <Button asChild variant="outline">
            <Link href="/catalogue/new">Add your first listing</Link>
          </Button>
        </EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>COA</TableHead>
              <TableHead>SDS</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {listings.map((l) => (
              <TableRow key={l.id}>
                <TableCell>
                  <Link
                    href={`/catalogue/${l.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {l.name}
                  </Link>
                  {l.casNumber && (
                    <p className="text-xs text-muted-foreground">CAS {l.casNumber}</p>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {l.kind === "RAW_MATERIAL" ? "Raw material" : "Finished product"}
                </TableCell>
                <TableCell className="text-muted-foreground">{l.category.name}</TableCell>
                <TableCell>
                  {fmtMoney(l.price, l.currency)} / {l.unit}
                </TableCell>
                {/* Mirrors the marketplace so a supplier sees exactly what a
                    buyer sees on their own listing. */}
                <TableCell>
                  {l.hasCoa ? (
                    <Badge variant="success">COA v{l.coaDocument?.version}</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {l.sdsMissing ? (
                    <Badge variant="warning">SDS missing</Badge>
                  ) : l.hasSds ? (
                    <Badge variant="success">SDS v{l.documents[0]?.version}</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <ListingStatusBadge status={l.status} />
                </TableCell>
                <TableCell>
                  <ListingRowActions listingId={l.id} status={l.status} kind={l.kind} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
