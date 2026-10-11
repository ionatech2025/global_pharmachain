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

export function rfqReachNotice(reach: RfqReach, categoryName?: string): RfqReachNotice {
  const { ofType, inCategory } = reach;
  if (ofType === 0) {
    return {
      tone: "warning",
      text: "No verified company of this type yet — nobody would see this RFQ.",
    };
  }
  if (inCategory === null || !categoryName) {
    return {
      tone: "info",
      text: `Any category: all ${companies(ofType)} of this type will see it.`,
    };
  }
  if (inCategory === 0) {
    return {
      tone: "warning",
      text: `No verified company of this type lists ${categoryName} yet, so nobody would see this RFQ. Choose Any category to reach all ${ofType}.`,
    };
  }
  if (inCategory < ofType) {
    return {
      tone: "narrowed",
      text: `Only the ${inCategory} of ${ofType} that list ${categoryName} will see it. Choose Any category to reach all ${ofType}.`,
    };
  }
  return {
    tone: "info",
    text: `All ${companies(ofType)} of this type list ${categoryName}, so the category costs no reach.`,
  };
}
