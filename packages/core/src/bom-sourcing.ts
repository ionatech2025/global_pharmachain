/**
 * Which RFQ covers a BOM line (ADR-0008). Every BOM version stores its lines as
 * new rows, and an RFQ records the row it was raised from. A line's own RFQs
 * come first. Failing those, an open RFQ raised from the same material in
 * another version covers it, so a line kept in a new version does not invite a
 * second RFQ while the first is still with suppliers (client review 2026-11-25).
 * An award does not carry over: it sourced an earlier recipe's batch.
 */
export interface BomLineRfq {
  id: string;
  refNo: string;
  status: string;
}

interface BomLine<R extends BomLineRfq> {
  materialName: string;
  rfqs: readonly R[];
}

interface BomVersionLines<R extends BomLineRfq> {
  items: ReadonlyArray<BomLine<R>>;
}

export interface BomLineSourcing<R extends BomLineRfq> {
  rfq: R;
  /** An awarded RFQ; otherwise it is still open. */
  sourced: boolean;
}

const materialKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Looks up a line's sourcing among every version of one product's BOM, listed
 * newest first. Closed and cancelled RFQs leave the line free for a new RFQ.
 */
export function bomSourcing<R extends BomLineRfq>(
  versions: ReadonlyArray<BomVersionLines<R>>,
): (line: BomLine<R>) => BomLineSourcing<R> | null {
  const openByMaterial = new Map<string, R>();
  for (const item of versions.flatMap((v) => v.items)) {
    const open = item.rfqs.find((r) => r.status === "OPEN");
    const key = materialKey(item.materialName);
    if (open && !openByMaterial.has(key)) openByMaterial.set(key, open);
  }
  return (line) => {
    const awarded = line.rfqs.find((r) => r.status === "AWARDED");
    if (awarded) return { rfq: awarded, sourced: true };
    const open =
      line.rfqs.find((r) => r.status === "OPEN") ??
      openByMaterial.get(materialKey(line.materialName));
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
