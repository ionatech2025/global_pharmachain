import { z } from "zod";
import { decimalString } from "./common";

export const bomItemSchema = z.object({
  materialName: z.string().min(2).max(160),
  categoryId: z.uuid().optional(),
  quantityPerUnit: decimalString,
  unit: z.string().min(1).max(20),
});
export type BomItemInput = z.infer<typeof bomItemSchema>;

// Creating against a product starts version 1; editing creates version n+1
// (US-801/803 — versions are never overwritten).
export const bomCreateSchema = z.object({
  productListingId: z.uuid(),
  notes: z.string().max(1000).optional(),
  items: z.array(bomItemSchema).min(1).max(200),
});
export type BomCreate = z.infer<typeof bomCreateSchema>;

export const bomEditSchema = bomCreateSchema.omit({ productListingId: true });
export type BomEdit = z.infer<typeof bomEditSchema>;
