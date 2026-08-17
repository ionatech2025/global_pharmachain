import { z } from "zod";
import { LISTING_KINDS, PHARMACOPOEIA_STANDARDS } from "../enums";
import { paginationQuerySchema } from "../pagination";
import { currencySchema, decimalString } from "./common";

const listingBase = z.object({
  kind: z.enum(LISTING_KINDS),
  name: z.string().min(2).max(160),
  casNumber: z
    .string()
    .regex(/^\d{2,7}-\d{2}-\d$/, "CAS format e.g. 50-78-2")
    .optional(),
  ghsClassification: z.string().max(120).optional(),
  countryOfOrigin: z.string().min(2).max(56),
  packagingType: z.string().min(1).max(80),
  packSize: z.string().min(1).max(80),
  unit: z.string().min(1).max(20),
  hsCode: z
    .string()
    .regex(/^\d{6,10}$/, "6–10 digit HS code")
    .optional(),
  shelfLifeMonths: z.coerce.number().int().min(1).max(240).optional(),
  storageConditions: z.string().max(240).optional(),
  certifications: z.array(z.string().min(1).max(80)).max(20).default([]),
  // Phase 4 §4: pharmacopoeia standards; enforced with a quality document at
  // publish time.
  standards: z.array(z.enum(PHARMACOPOEIA_STANDARDS)).max(4).default([]),
  categoryId: z.uuid(),
  price: decimalString,
  currency: currencySchema,
  description: z.string().max(2000).optional(),
});

// A raw material's CAS number is enforced at publish, not at save (US-302) —
// the same "optional to draft, required to go live" shape as the
// pharmacopoeia-standards → quality-document check below, so an incomplete
// listing can still be created and resumed later instead of being rejected
// outright.
export const listingCreateSchema = listingBase;
export type ListingCreate = z.infer<typeof listingCreateSchema>;

export const listingUpdateSchema = listingBase.omit({ kind: true }).partial();
export type ListingUpdate = z.infer<typeof listingUpdateSchema>;

export const catalogueSearchSchema = paginationQuerySchema.extend({
  q: z.string().max(120).optional(),
  kind: z.enum(LISTING_KINDS).optional(),
  categoryId: z.uuid().optional(),
  country: z.string().max(56).optional(),
  certification: z.string().max(80).optional(),
  sort: z.enum(["relevance", "company"]).default("relevance"),
});
export type CatalogueSearch = z.infer<typeof catalogueSearchSchema>;
