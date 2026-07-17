-- DB-level enforcement of invariants the application already maintains
-- transactionally. Prisma's schema DSL cannot express partial unique
-- indexes, so they live here (see the comments on Quotation and Bom in
-- schema.prisma).

-- At most one live (non-superseded) quotation per supplier per RFQ.
-- Resubmission supersedes the old row and inserts version+1 in the same
-- transaction; this index turns any race that slips through into a
-- constraint violation (mapped to HTTP 409) instead of a duplicate.
CREATE UNIQUE INDEX "Quotation_one_live_per_rfq_supplier"
  ON "Quotation" ("rfqId", "supplierCompanyId")
  WHERE "status" <> 'SUPERSEDED';

-- At most one ACTIVE BOM version per product listing (US-801).
CREATE UNIQUE INDEX "Bom_one_active_per_listing"
  ON "Bom" ("productListingId")
  WHERE "status" = 'ACTIVE';
