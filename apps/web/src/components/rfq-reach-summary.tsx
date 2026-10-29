import { COMPANY_TYPE_LABELS, type CompanyType } from "@pharmachain/core";
import { cn } from "@pharmachain/ui/lib/utils";

/**
 * Who an RFQ went to, in the buyer's words: the company type, whether a material
 * category narrowed it to the suppliers listing that category, and how many it
 * reached when published. Shown where the buyer looks after publishing — an RFQ
 * that named a category reached only the suppliers listing it, and nothing on the
 * buyer's side said so (client review, 2026-10-29: "Paracetamol BP/API" named
 * "APIs" and reached 1 of 3 Raw Material Manufacturers).
 */
export function RfqReachSummary({
  targetCompanyType,
  categoryName,
  reach,
  className,
}: {
  targetCompanyType: CompanyType;
  categoryName: string | null | undefined;
  reach: number;
  className?: string;
}) {
  const who = COMPANY_TYPE_LABELS[targetCompanyType];
  return (
    <span className={cn("block", className)} data-testid="rfq-reach">
      <span className="text-foreground">{who}</span>
      <span className="block text-xs text-muted-foreground">
        {categoryName ? `listing ${categoryName}` : "any category"} ·{" "}
        <span className={cn(reach === 0 && "font-medium text-warning")}>
          {reach === 0
            ? "reached no supplier"
            : `${reach} ${reach === 1 ? "supplier" : "suppliers"}`}
        </span>
      </span>
    </span>
  );
}
