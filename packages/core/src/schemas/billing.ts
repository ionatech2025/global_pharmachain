import { z } from "zod";
import { CREDIT_KINDS, PAYMENT_METHODS } from "../enums";

export const creditRequestCreateSchema = z.object({
  kind: z.enum(CREDIT_KINDS),
  count: z.coerce.number().int().min(1).max(100),
});
export type CreditRequestCreate = z.infer<typeof creditRequestCreateSchema>;

/** In-platform checkout for a platform fee (US-907, QA round 2). */
export const creditPaymentStartSchema = z.object({
  method: z.enum(PAYMENT_METHODS),
});
export type CreditPaymentStart = z.infer<typeof creditPaymentStartSchema>;
