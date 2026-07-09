import type {
  CompanyRole,
  CompanyType,
  ProfileStatus,
  SubscriptionTier,
  VerificationStatus,
} from "@pharmachain/db";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
  sessionVersion: number;
}

export interface Membership {
  companyId: string;
  role: CompanyRole;
  company: {
    id: string;
    name: string;
    type: CompanyType;
    verificationStatus: VerificationStatus;
    subscriptionTier: SubscriptionTier;
    profileStatus: ProfileStatus;
  };
}

/** Entity-level enrichment controllers/services attach for the audit interceptor. */
export interface AuditEntry {
  action: string;
  entityType?: string;
  entityId?: string;
  companyId?: string;
  oldValues?: unknown;
  newValues?: unknown;
  reason?: string;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser;
    membership?: Membership;
    auditEntry?: AuditEntry;
    requestId?: string;
  }
}

export function clientIp(req: {
  headers: Record<string, unknown>;
  ip?: string;
}): string | undefined {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0]?.trim();
  }
  return req.ip;
}
