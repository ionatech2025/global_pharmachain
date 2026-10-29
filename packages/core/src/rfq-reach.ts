/**
 * What a buyer is told about an RFQ's reach before publishing. A supplier
 * sees an RFQ when it is verified, of the target type and — if the RFQ names
 * a material category — lists products in that category. Naming a category
 * is therefore a targeting choice, not a label: with few suppliers listing
 * most categories it can quietly narrow an RFQ to nobody.
 */
export interface RfqReach {
  /** Verified companies of the target type (the buyer itself excluded). */
  ofType: number;
  /** Of those, the ones listing the chosen category; null for any category. */
  inCategory: number | null;
}

export interface RfqReachNotice {
  /** "warning" when nobody would see the RFQ; "narrowed" when a category cuts reach. */
  tone: "info" | "narrowed" | "warning";
  text: string;
}

const companies = (n: number) => `${n} verified ${n === 1 ? "company" : "companies"}`;

/**
 * Two notices, one per field, because they answer different questions. The
 * company-type notice says whether anyone of that type exists at all; the
 * category notice says how much naming a category narrows that. They used to be
 * one message shown under the category field, so "No verified company of this
 * type yet" sat under "Material category" and read as a fault of the category
 * (client review, 2026-10-29). The category notice is null when the type already
 * reaches nobody — there is nothing left for a category to narrow.
 */
export function rfqReachNotices(
  reach: RfqReach,
  categoryName?: string,
): { type: RfqReachNotice; category: RfqReachNotice | null } {
  const { ofType, inCategory } = reach;
  if (ofType === 0) {
    return {
      type: {
        tone: "warning",
        text: "No verified company of this type yet — nobody would see this RFQ.",
      },
      category: null,
    };
  }
  const type: RfqReachNotice = { tone: "info", text: `${companies(ofType)} of this type.` };
  if (inCategory === null || !categoryName) {
    return {
      type,
      category: {
        tone: "info",
        text: `Any category: all ${ofType} of them will see it.`,
      },
    };
  }
  if (inCategory === 0) {
    return {
      type,
      category: {
        tone: "warning",
        text: `None of the ${ofType} lists ${categoryName} yet, so nobody would see this RFQ. Choose Any category to reach all ${ofType}.`,
      },
    };
  }
  if (inCategory < ofType) {
    return {
      type,
      category: {
        tone: "narrowed",
        text: `Only the ${inCategory} of ${ofType} that list ${categoryName} will see it. Choose Any category to reach all ${ofType}.`,
      },
    };
  }
  return {
    type,
    category: {
      tone: "info",
      text: `All ${ofType} list ${categoryName}, so the category costs no reach.`,
    },
  };
}
