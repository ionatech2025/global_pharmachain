"use client";

import { Badge } from "@pharmachain/ui/components/badge";
import { Button } from "@pharmachain/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@pharmachain/ui/components/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@pharmachain/ui/components/table";
import { Scale, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

// Side-by-side comparison of up to 4 listings (US-305). Pure client-side —
// selection persists for the session via sessionStorage.
export interface CompareItem {
  id: string;
  name: string;
  company: string;
  companyId?: string;
  verified?: boolean;
  price: string;
  origin: string;
  packaging: string;
  certifications: string;
  shelfLife?: string;
  storage?: string;
}

const KEY = "pharmachain.compare";
const MAX = 4;
const EVENT = "pharmachain:compare-change";

function load(): CompareItem[] {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "[]") as CompareItem[];
  } catch {
    return [];
  }
}

function save(items: CompareItem[]): void {
  sessionStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(EVENT));
}

function useCompare(): CompareItem[] {
  const [items, setItems] = useState<CompareItem[]>([]);
  useEffect(() => {
    const sync = () => setItems(load());
    sync();
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  return items;
}

export function CompareButton({ item }: { item: CompareItem }) {
  const items = useCompare();
  const selected = items.some((i) => i.id === item.id);

  function toggle() {
    const current = load();
    if (selected) {
      save(current.filter((i) => i.id !== item.id));
      return;
    }
    if (current.length >= MAX) {
      toast.warning(`You can compare up to ${MAX} listings`);
      return;
    }
    save([...current, item]);
  }

  return (
    <Button size="sm" variant={selected ? "secondary" : "ghost"} onClick={toggle}>
      <Scale className="size-3.5" />
      {selected ? "Selected" : "Compare"}
    </Button>
  );
}

export function CompareTray() {
  const items = useCompare();
  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-full border bg-card px-4 py-2 shadow-lg">
        <Badge>{items.length}</Badge>
        <span className="text-sm">selected for comparison</span>
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm">Compare</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>Compare listings</DialogTitle>
            </DialogHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Field</TableHead>
                  {items.map((i) => (
                    <TableHead key={i.id}>
                      <span className="flex items-center gap-1">
                        {i.name}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-5"
                          aria-label={`Remove ${i.name} from comparison`}
                          onClick={() => save(load().filter((x) => x.id !== i.id))}
                        >
                          <X className="size-3" />
                        </Button>
                      </span>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(
                  [
                    [
                      "Supplier",
                      (i: CompareItem) =>
                        i.companyId ? (
                          <Link
                            href={`/companies/${i.companyId}`}
                            className="underline-offset-2 hover:underline"
                          >
                            {i.company}
                            {i.verified && (
                              <Badge variant="success" className="ml-1.5 align-middle">
                                Verified
                              </Badge>
                            )}
                          </Link>
                        ) : (
                          i.company
                        ),
                    ],
                    ["Price", (i: CompareItem) => i.price],
                    ["Origin", (i: CompareItem) => i.origin],
                    ["Packaging", (i: CompareItem) => i.packaging],
                    ["Shelf life", (i: CompareItem) => i.shelfLife || "—"],
                    ["Storage", (i: CompareItem) => i.storage || "—"],
                    ["Certifications", (i: CompareItem) => i.certifications || "—"],
                  ] as const
                ).map(([label, pick]) => (
                  <TableRow key={label}>
                    <TableCell className="font-medium">{label}</TableCell>
                    {items.map((i) => (
                      <TableCell key={i.id} className="whitespace-normal">
                        {pick(i)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DialogContent>
        </Dialog>
        <Button size="sm" variant="ghost" onClick={() => save([])} aria-label="Clear comparison">
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}
