import { z } from "zod";
import { COMPANY_ROLES } from "../enums";

export const companyProfileUpdateSchema = z.object({
  description: z.string().max(2000).optional(),
  countriesOfOperation: z.array(z.string().min(2).max(56)).max(40).optional(),
  displayedCertifications: z.array(z.string().min(1).max(80)).max(20).optional(),
  website: z.url().max(200).optional().or(z.literal("")),
  contactPhone: z.string().max(32).optional(),
});
export type CompanyProfileUpdate = z.infer<typeof companyProfileUpdateSchema>;

export const memberRoleSchema = z.object({
  role: z.enum(COMPANY_ROLES),
});
