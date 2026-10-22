/**
 * The three trading-lane entry points, shared by the hero action matrix, the
 * Mall Directory cards and the footer so the same intent always registers the
 * same company type — they were previously written out three times and had
 * drifted ("Source raw materials" registered a buyer from the hero but a
 * seller from the directory).
 */
export const LANE_LINKS = {
  /** Manufacturers buying inputs (APIs, excipients, packaging, consumables). */
  source: "/register?type=FINISHED_PRODUCT_MANUFACTURER&action=source_raw",
  /** Manufacturers and CDMOs selling formulations or contract capacity. */
  list: "/register?type=FINISHED_PRODUCT_MANUFACTURER&action=list_capacity",
  /** Wholesalers, distributors and institutional buyers procuring finished medicines. */
  procure: "/register?type=FINISHED_PRODUCT_DISTRIBUTOR&action=procure_bulk",
} as const;
