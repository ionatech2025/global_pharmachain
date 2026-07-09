import { z } from "zod";
import { CREDIT_KINDS } from "../enums";

export const creditRequestCreateSchema = z.object({
  kind: z.enum(CREDIT_KINDS),
  count: z.coerce.number().int().min(1).max(100),
});
export type CreditRequestCreate = z.infer<typeof creditRequestCreateSchema>;
