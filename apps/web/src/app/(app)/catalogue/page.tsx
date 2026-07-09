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
import { apiServer } from "@/lib/api/server";
import type { ListingRow } from "@/lib/api/types";
import { fmtMoney } from "@/lib/format";
import { ListingRowActions } from "./listing-actions";

export const metadata = { title: "My catalogue" };

const STATUS_VARIANT = {
  DRAFT: "secondary",
  PUBLISHED: "success",
  DEACTIVATED: "outline",
} as const;

export default async function CataloguePage() {
  const api = await apiServer();
  const listings = await api.get<ListingRow[]>("/catalogue");

  return (
    <div className="space-y-4">
      <PageHeader
        title="My catalogue"
        description="Raw materials and finished products your company offers (US-302)."
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
                  <Badge variant={STATUS_VARIANT[l.status]}>{l.status.toLowerCase()}</Badge>
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
