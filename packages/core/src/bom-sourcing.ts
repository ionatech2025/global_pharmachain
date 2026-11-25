/**
 * Which RFQ covers a BOM line. Every BOM version stores its lines as new rows,
 * so an RFQ is matched to a line by its material, not by the row it was raised
 * from: the RFQ raised from version 5's "Item 2" still covers version 6's
 * "Item 2" (client review 2026-11-25).
 */
export interface BomLineRfq {
  id: string;
  refNo: string;
  status: string;
}

interface BomVersionLines<R extends BomLineRfq> {
  items: ReadonlyArray<{ materialName: string; rfqs: readonly R[] }>;
}

export interface BomLineSourcing<R extends BomLineRfq> {
  rfq: R;
  /** An awarded RFQ; otherwise it is still open. */
  sourced: boolean;
}

const materialKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Looks up a line's sourcing across every version of one product's BOM. An
 * awarded RFQ beats an open one; closed and cancelled RFQs leave the line free
 * for a new RFQ.
 */
export function bomSourcing<R extends BomLineRfq>(
  versions: ReadonlyArray<BomVersionLines<R>>,
): (materialName: string) => BomLineSourcing<R> | null {
  const byMaterial = new Map<string, R[]>();
  for (const item of versions.flatMap((v) => v.items)) {
    const key = materialKey(item.materialName);
    byMaterial.set(key, [...(byMaterial.get(key) ?? []), ...item.rfqs]);
  }
  return (materialName) => {
    const rfqs = byMaterial.get(materialKey(materialName)) ?? [];
    const awarded = rfqs.find((r) => r.status === "AWARDED");
    if (awarded) return { rfq: awarded, sourced: true };
    const open = rfqs.find((r) => r.status === "OPEN");
    return open ? { rfq: open, sourced: false } : null;
  };
}

/**
 * Open RFQs for materials that `version` has no line for: activating it leaves
 * them with no line in the active BOM. They stay open with suppliers until the
 * buyer cancels them.
 */
export function openRfqsWithoutLine<R extends BomLineRfq>(
  versions: ReadonlyArray<BomVersionLines<R>>,
  version: BomVersionLines<R>,
): Array<{ materialName: string; rfq: R }> {
  const kept = new Set(version.items.map((i) => materialKey(i.materialName)));
  return versions
    .flatMap((v) => v.items)
    .filter((item) => !kept.has(materialKey(item.materialName)))
    .flatMap((item) =>
      item.rfqs
        .filter((r) => r.status === "OPEN")
        .map((rfq) => ({ materialName: item.materialName, rfq })),
    );
}
