import { z } from "zod";
import { COMPANY_ROLES, COMPANY_TYPES } from "../enums";

// US-206: minimum 8 characters, at least one letter and one number.
export const passwordSchema = z
  .string()
  .min(8, "At least 8 characters")
  .max(72)
  .regex(/[A-Za-z]/, "Must contain a letter")
  .regex(/\d/, "Must contain a number");

export const registerSchema = z.object({
  company: z.object({
    name: z.string().min(2).max(120),
    type: z.enum(COMPANY_TYPES),
    country: z.string().min(2).max(56),
    registrationNumber: z.string().min(2).max(64),
    address: z.string().min(4).max(240),
    // US-101 lists Phone among the captured registration fields.
    contactPhone: z.string().min(7, "At least 7 digits").max(32),
  }),
  admin: z.object({
    name: z.string().min(2).max(80),
    email: z.email(),
    password: passwordSchema,
  }),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginPasswordSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(72),
});

export const loginOtpSchema = z.object({
  email: z.email(),
  otp: z.string().regex(/^\d{6}$/, "6-digit code"),
});

export const otpRequestSchema = z.object({ email: z.email() });

export const forgotPasswordSchema = z.object({ email: z.email() });

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});

export const acceptInviteSchema = z.object({
  token: z.string().min(20).max(200),
  name: z.string().min(2).max(80),
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(72),
  newPassword: passwordSchema,
});

export const whatsappSchema = z.object({
  // E.164
  number: z.string().regex(/^\+[1-9]\d{6,14}$/, "Use international format, e.g. +256700000000"),
});

export const inviteSchema = z.object({
  email: z.email(),
  role: z.enum(COMPANY_ROLES),
});
