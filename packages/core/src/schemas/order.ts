import { z } from "zod";
import { ORDER_STATUSES } from "../enums";

export const orderStatusUpdateSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  note: z.string().max(500).optional(),
  eta: z.iso.datetime().optional(),
});
export type OrderStatusUpdate = z.infer<typeof orderStatusUpdateSchema>;

export const orderEtaSchema = z.object({
  eta: z.iso.datetime(),
});
