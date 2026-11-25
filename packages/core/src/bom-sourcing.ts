/**
 * Which RFQ covers a BOM line (ADR-0008). Every BOM version stores its lines as
 * new rows, and an RFQ records the row it was raised from. A line's own RFQs
 * come first. Failing those, an RFQ raised from the same material in another
 * version covers it while it is open, and still once awarded if the award came
 * after this version was created. So a line kept in a new version does not
 * invite a second RFQ for what is already being sourced (client review
 * 2026-11-25), while a version made after an award starts the next batch.
 */
export interface BomLineRfq {
  id: string;
  refNo: string;
  status: string;
  awardedAt: string | Date | null;
}

interface BomLine<R extends BomLineRfq> {
  materialName: string;
  rfqs: readonly R[];
}

interface BomVersionLines<R extends BomLineRfq> {
  createdAt: string | Date;
  items: ReadonlyArray<BomLine<R>>;
}

export interface BomLineSourcing<R extends BomLineRfq> {
  rfq: R;
  /** An awarded RFQ; otherwise it is still open. */
  sourced: boolean;
}

const materialKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();
const time = (at: string | Date) => new Date(at).getTime();

/**
 * Looks up a line's sourcing among every version of one product's BOM, listed
 * newest first. Closed and cancelled RFQs leave the line free for a new RFQ.
 */
export function bomSourcing<R extends BomLineRfq>(
  versions: ReadonlyArray<BomVersionLines<R>>,
): (line: BomLine<R>, version: Pick<BomVersionLines<R>, "createdAt">) => BomLineSourcing<R> | null {
  const byMaterial = new Map<string, R[]>();
  for (const item of versions.flatMap((v) => v.items)) {
    const key = materialKey(item.materialName);
    byMaterial.set(key, [...(byMaterial.get(key) ?? []), ...item.rfqs]);
  }
  return (line, version) => {
    const ownAward = line.rfqs.find((r) => r.status === "AWARDED");
    if (ownAward) return { rfq: ownAward, sourced: true };
    const ownOpen = line.rfqs.find((r) => r.status === "OPEN");
    if (ownOpen) return { rfq: ownOpen, sourced: false };
    const carried = byMaterial.get(materialKey(line.materialName)) ?? [];
    const open = carried.find((r) => r.status === "OPEN");
    if (open) return { rfq: open, sourced: false };
    const since = time(version.createdAt);
    const award = carried.find(
      (r) => r.status === "AWARDED" && r.awardedAt !== null && time(r.awardedAt) > since,
    );
    return award ? { rfq: award, sourced: true } : null;
  };
}

/**
 * Open RFQs for materials that `version` has no line for: activating it leaves
 * them with no line in the active BOM. They stay open with suppliers until the
 * buyer cancels them.
 */
export function openRfqsWithoutLine<R extends BomLineRfq>(
  versions: ReadonlyArray<Pick<BomVersionLines<R>, "items">>,
  version: Pick<BomVersionLines<R>, "items">,
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
