import { z } from "zod";
import { FREIGHT_MODES, LOGISTICS_ROLES, SHIPMENT_EXCEPTIONS } from "../enums";

// ─── Appointments (Phase 2 §2) ───────────────────────────────────────────────

export const appointmentSchema = z.object({
  role: z.enum(LOGISTICS_ROLES),
  companyId: z.uuid(),
});
export type AppointmentInput = z.infer<typeof appointmentSchema>;

export const appointmentRoleParamSchema = z.object({
  id: z.uuid(),
  role: z.enum(LOGISTICS_ROLES),
});

// ─── Shipment metadata (forwarder-managed) ───────────────────────────────────

export const shipmentMetaSchema = z
  .object({
    freightMode: z.enum(FREIGHT_MODES).optional(),
    coldChain: z.boolean().optional(),
    dispatchDate: z.iso.datetime().optional(),
    eta: z.iso.datetime().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "Provide at least one field to update",
  });
export type ShipmentMetaInput = z.infer<typeof shipmentMetaSchema>;

// ─── GPS tracking (Phase 2 §3) ───────────────────────────────────────────────

export const locationPingSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  note: z.string().max(200).optional(),
});
export type LocationPingInput = z.infer<typeof locationPingSchema>;

// ─── Proof of delivery (Phase 2 §3) ──────────────────────────────────────────

export const podSchema = z.object({
  signedByName: z.string().min(2).max(80),
  note: z.string().max(500).optional(),
  photoDocumentId: z.uuid().optional(),
  // Small drawn-signature PNG (canvas data URI); capped so it stays a field,
  // not a file store.
  signatureData: z
    .string()
    .regex(/^data:image\/(png|jpeg);base64,/)
    .max(80_000)
    .optional(),
});
export type PodInput = z.infer<typeof podSchema>;

// ─── Exceptions & disputes (Phase 2 §4) ──────────────────────────────────────

export const shipmentExceptionSchema = z.object({
  kind: z.enum(SHIPMENT_EXCEPTIONS),
  note: z.string().min(5).max(500),
});
export type ShipmentExceptionInput = z.infer<typeof shipmentExceptionSchema>;

export const disputeCreateSchema = z.object({
  subject: z.string().min(5).max(140),
  body: z.string().min(10).max(4000),
  legalReference: z.string().max(300).optional(),
});
export type DisputeCreateInput = z.infer<typeof disputeCreateSchema>;

export const disputeResolveSchema = z.object({
  resolution: z.string().min(5).max(2000),
});

// ─── Driver profiles (Phase 2 §3) ────────────────────────────────────────────

export const driverProfileSchema = z.object({
  userId: z.uuid(),
  licenceNo: z.string().min(3).max(60),
  vehicleReg: z.string().min(3).max(30),
  vehicleType: z.string().max(60).optional(),
  coldChainCapable: z.boolean().optional(),
});
export type DriverProfileInput = z.infer<typeof driverProfileSchema>;
