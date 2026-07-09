import { z } from "zod";
import { DOCUMENT_KINDS, type DocumentKind } from "../enums";
import {
  expiryRequired,
  isAllowedMime,
  isVerificationKind,
  MAX_FILE_SIZE_BYTES,
  ORDER_DOCUMENT_KINDS,
} from "../files";

const linkFields = {
  listingId: z.uuid().optional(),
  rfqId: z.uuid().optional(),
  quotationId: z.uuid().optional(),
  orderId: z.uuid().optional(),
} as const;

// Upload contract (US-102/303/501/602):
// - verification docs + logo: company-scoped, no entity link
// - SDS: linked to a listing
// - order documents: linked to an order
// - RFQ/quotation/message attachments: uploaded unlinked, linked by the
//   create endpoint that consumes them
export const documentRequestUploadSchema = z
  .object({
    fileName: z.string().min(1).max(200),
    contentType: z.string().min(3).max(120),
    size: z.number().int().min(1).max(MAX_FILE_SIZE_BYTES),
    kind: z.enum(DOCUMENT_KINDS),
    expiresAt: z.iso.date().optional(),
    /** Version-replace flow: the superseded document (US-102/303/502). */
    replacesDocumentId: z.uuid().optional(),
    ...linkFields,
  })
  .superRefine((val, ctx) => {
    const links = [val.listingId, val.rfqId, val.quotationId, val.orderId].filter(Boolean);
    if (links.length > 1) {
      ctx.addIssue({ code: "custom", message: "A document can link to at most one entity" });
    }
    if (!isAllowedMime(val.kind, val.contentType)) {
      ctx.addIssue({
        code: "custom",
        path: ["contentType"],
        message: "File type not allowed for this document kind",
      });
    }
    if (isVerificationKind(val.kind) || val.kind === "COMPANY_LOGO") {
      if (links.length > 0) {
        ctx.addIssue({ code: "custom", message: "Company documents cannot link to an entity" });
      }
    }
    if (val.kind === "SDS" && !val.listingId) {
      ctx.addIssue({ code: "custom", path: ["listingId"], message: "SDS must link to a listing" });
    }
    if ((ORDER_DOCUMENT_KINDS as readonly DocumentKind[]).includes(val.kind) && !val.orderId) {
      ctx.addIssue({ code: "custom", path: ["orderId"], message: "Must link to an order" });
    }
    if (expiryRequired(val.kind)) {
      if (!val.expiresAt) {
        ctx.addIssue({
          code: "custom",
          path: ["expiresAt"],
          message: "Expiry date is required for licence documents",
        });
      } else if (new Date(val.expiresAt).getTime() <= Date.now()) {
        ctx.addIssue({
          code: "custom",
          path: ["expiresAt"],
          message: "Expiry date must be in the future",
        });
      }
    }
  });
export type DocumentRequestUpload = z.infer<typeof documentRequestUploadSchema>;

export const documentListQuerySchema = z.object({
  kind: z.enum(DOCUMENT_KINDS).optional(),
  orderId: z.uuid().optional(),
  listingId: z.uuid().optional(),
  expiringWithinDays: z.coerce.number().int().min(1).max(365).optional(),
});
