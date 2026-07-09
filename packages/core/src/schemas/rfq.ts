import { z } from "zod";
import { COMPANY_TYPES } from "../enums";
import { currencySchema, decimalString, futureDatetime } from "./common";

// One item per RFQ (US-401): what is needed, how much, who should see it.
export const rfqCreateSchema = z.object({
  title: z.string().min(3).max(160),
  specifications: z.string().max(4000).optional(),
  quantity: decimalString,
  unit: z.string().min(1).max(20),
  targetCompanyType: z.enum(COMPANY_TYPES),
  categoryId: z.uuid().optional(),
  deadline: futureDatetime, // TC2: past deadlines rejected
  attachmentDocumentIds: z.array(z.uuid()).max(5).default([]),
  bomItemId: z.uuid().optional(),
});
export type RfqCreate = z.infer<typeof rfqCreateSchema>;

export const quotationSubmitSchema = z.object({
  unitPrice: decimalString, // TC4: unit price mandatory
  currency: currencySchema,
  leadTimeDays: z.coerce.number().int().min(1).max(365),
  validUntil: futureDatetime,
  notes: z.string().max(2000).optional(),
  attachmentDocumentIds: z.array(z.uuid()).max(5).default([]),
});
export type QuotationSubmit = z.infer<typeof quotationSubmitSchema>;
