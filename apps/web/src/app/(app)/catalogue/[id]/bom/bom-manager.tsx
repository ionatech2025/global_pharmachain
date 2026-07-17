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
import { Input } from "@pharmachain/ui/components/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@pharmachain/ui/components/table";
import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/http";
import type { BomRow } from "@/lib/api/types";
import { fmtDate, fmtNumber } from "@/lib/format";

interface DraftItem {
  materialName: string;
  categoryId?: string;
  quantityPerUnit: string;
  unit: string;
}

const BOM_STATUS_VARIANT = { DRAFT: "secondary", ACTIVE: "success", ARCHIVED: "outline" } as const;

export function BomManager({
  productListingId,
  boms,
  categories,
}: {
  productListingId: string;
  boms: BomRow[];
  categories: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const latest = boms[0];
  const [editing, setEditing] = useState(boms.length === 0);
  const [notes, setNotes] = useState(latest?.notes ?? "");
  const [items, setItems] = useState<DraftItem[]>(
    latest?.items.map((i) => ({
      materialName: i.materialName,
      categoryId: i.categoryId ?? undefined,
      quantityPerUnit: i.quantityPerUnit,
      unit: i.unit,
    })) ?? [{ materialName: "", quantityPerUnit: "", unit: "g" }],
  );
  const [busy, setBusy] = useState(false);

  function setItem(index: number, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  async function save() {
    setBusy(true);
    try {
      const payload = { notes: notes || undefined, items };
      if (latest) {
        await api.post(`/boms/${latest.id}/new-version`, payload);
        toast.success("New BOM version created — previous versions are retained");
      } else {
        await api.post("/boms", { productListingId, ...payload });
        toast.success("BOM created as draft — activate it when ready");
      }
      setEditing(false);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function activate(bomId: string) {
    try {
      await api.post(`/boms/${bomId}/activate`);
      toast.success("BOM version activated (previous Active version archived)");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div className="space-y-4">
      {editing && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              {latest ? `New version (v${latest.version + 1})` : "Create BOM (v1)"}
            </CardTitle>
            <CardDescription>Quantities are per production unit.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {items.map((item, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional drafts
              <div key={i} className="flex flex-wrap items-end gap-2">
                <div className="min-w-48 flex-1">
                  <Input
                    placeholder="Material name"
                    value={item.materialName}
                    onChange={(e) => setItem(i, { materialName: e.target.value })}
                  />
                </div>
                <select
                  aria-label="Material category"
                  className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                  value={item.categoryId ?? ""}
                  onChange={(e) => setItem(i, { categoryId: e.target.value || undefined })}
                >
                  <option value="">Category…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <Input
                  className="w-28"
                  inputMode="decimal"
                  placeholder="Qty/unit"
                  value={item.quantityPerUnit}
                  onChange={(e) => setItem(i, { quantityPerUnit: e.target.value })}
                />
                <Input
                  className="w-20"
                  placeholder="Unit"
                  value={item.unit}
                  onChange={(e) => setItem(i, { unit: e.target.value })}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove line"
                  disabled={items.length === 1}
                  onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setItems((prev) => [
                    ...prev,
                    { materialName: "", quantityPerUnit: "", unit: "g" },
                  ])
                }
              >
                <Plus className="size-4" /> Add line
              </Button>
            </div>
            <Input
              placeholder="Notes (e.g. per 1000 tablets)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <div className="flex gap-2">
              <Button onClick={save} disabled={busy}>
                {busy ? "Saving…" : "Save version"}
              </Button>
              {boms.length > 0 && (
                <Button variant="outline" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {!editing && (
        <Button onClick={() => setEditing(true)}>
          {latest ? "Edit (creates new version)" : "Create BOM"}
        </Button>
      )}

      {boms.map((bom) => (
        <Card key={bom.id}>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm">
                Version {bom.version}{" "}
                <Badge variant={BOM_STATUS_VARIANT[bom.status]} className="ml-1">
                  {bom.status.toLowerCase()}
                </Badge>
              </CardTitle>
              <CardDescription>
                {fmtDate(bom.createdAt)} · {bom.createdBy.name}
                {bom.notes ? ` · ${bom.notes}` : ""}
              </CardDescription>
            </div>
            {bom.status !== "ACTIVE" && (
              <Button size="sm" variant="outline" onClick={() => activate(bom.id)}>
                Activate
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Material</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Qty / unit</TableHead>
                  <TableHead>Sourcing</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bom.items.map((item) => {
                  const openRfq = item.rfqs.find(
                    (r) => r.status === "OPEN" || r.status === "AWARDED",
                  );
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.materialName}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.category?.name ?? "—"}
                      </TableCell>
                      <TableCell>
                        {fmtNumber(item.quantityPerUnit)} {item.unit}
                      </TableCell>
                      <TableCell>
                        {openRfq ? (
                          <Link href={`/rfqs/${openRfq.id}`}>
                            <Badge variant="warning">RFQ in progress · {openRfq.refNo}</Badge>
                          </Link>
                        ) : (
                          <Button asChild size="sm" variant="ghost">
                            <Link
                              href={{
                                pathname: "/rfqs/new",
                                query: {
                                  bomItemId: item.id,
                                  title: item.materialName,
                                  categoryId: item.categoryId ?? undefined,
                                  unit: "kg",
                                },
                              }}
                            >
                              Raise RFQ
                            </Link>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
