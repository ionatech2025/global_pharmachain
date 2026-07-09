import { z } from "zod";
import { PREFERENCE_EVENT_TYPES } from "../enums";

export const preferenceUpdateSchema = z.object({
  preferences: z
    .array(
      z.object({
        eventType: z.enum(PREFERENCE_EVENT_TYPES),
        email: z.boolean(),
        whatsapp: z.boolean(),
      }),
    )
    .min(1)
    .max(PREFERENCE_EVENT_TYPES.length),
});
export type PreferenceUpdate = z.infer<typeof preferenceUpdateSchema>;
