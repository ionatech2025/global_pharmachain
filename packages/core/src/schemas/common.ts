import { z } from "zod";
import { CURRENCIES } from "../enums";

/** Money/quantity as strings — Decimal-safe across the JSON boundary. */
export const decimalString = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,6})?$/, "Must be a positive number (up to 6 decimal places)");

export const currencySchema = z.enum(CURRENCIES);

export const idParamSchema = z.object({ id: z.uuid() });

export const futureDatetime = z.iso
  .datetime()
  .refine((v) => new Date(v).getTime() > Date.now(), "Must be in the future");

/**
 * Query-string filters arrive as "" whenever the control that owns them is
 * left unset — an HTML GET form submits every named control, empty or not.
 * "" means "no filter", so normalise it to undefined before the inner schema
 * sees it; otherwise `z.uuid()` / `z.enum()` reject the whole request and a
 * plain unfiltered search 400s.
 */
export function optionalFilter<T extends z.ZodType>(schema: T) {
  return z.preprocess((v) => (v === "" ? undefined : v), schema.optional());
}
