import { bomSourcing } from "@pharmachain/core";
import { prisma } from "@pharmachain/db";

/**
 * Every line of a company's active BOMs with the RFQ that covers it, by the
 * BOM page's rule (ADR-0008), so the dashboard's stockout figure and the
 * intelligence list agree with what the buyer sees on the BOM.
 */
export async function activeBomLines(companyId: string) {
  const boms = await prisma.bom.findMany({
    // A deactivated product is not being made, so its materials are no risk.
    where: {
      productListing: {
        companyId,
        status: { not: "DEACTIVATED" },
        boms: { some: { status: "ACTIVE" } },
      },
    },
    orderBy: { version: "desc" },
    select: {
      status: true,
      createdAt: true,
      productListingId: true,
      productListing: { select: { name: true } },
      items: {
        select: {
          materialName: true,
          quantityPerUnit: true,
          unit: true,
          rfqs: {
            select: { id: true, refNo: true, status: true, awardedAt: true },
            orderBy: { createdAt: "desc" },
          },
        },
      },
    },
  });
  return boms
    .filter((bom) => bom.status === "ACTIVE")
    .flatMap((bom) => {
      const sourcingOf = bomSourcing(
        boms.filter((v) => v.productListingId === bom.productListingId),
      );
      return bom.items.map((item) => ({
        ...item,
        product: bom.productListing.name,
        sourcing: sourcingOf(item, bom),
      }));
    });
}
