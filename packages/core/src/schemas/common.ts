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
