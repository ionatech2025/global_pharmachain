import { z } from "zod";
import { MAX_MESSAGE_ATTACHMENTS } from "../files";

export const messageCreateSchema = z.object({
  body: z.string().min(1).max(5000),
  attachmentDocumentIds: z.array(z.uuid()).max(MAX_MESSAGE_ATTACHMENTS).default([]),
});
export type MessageCreate = z.infer<typeof messageCreateSchema>;

// Resolve (or lazily create) the thread for a business entity. RFQ threads
// are pairwise per supplier (US-406 confidentiality), so buyers must say
// which supplier they are talking to.
export const threadLookupSchema = z
  .object({
    rfqId: z.uuid().optional(),
    supplierCompanyId: z.uuid().optional(),
    quotationId: z.uuid().optional(),
    orderId: z.uuid().optional(),
  })
  .superRefine((val, ctx) => {
    const entities = [val.rfqId, val.quotationId, val.orderId].filter(Boolean);
    if (entities.length !== 1) {
      ctx.addIssue({
        code: "custom",
        message: "Provide exactly one of rfqId, quotationId, orderId",
      });
    }
  });
export type ThreadLookup = z.infer<typeof threadLookupSchema>;
