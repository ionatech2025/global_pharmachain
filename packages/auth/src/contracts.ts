import type {
  CompanyRole,
  CompanyType,
  SubscriptionTier,
  VerificationStatus,
} from "@pharmachain/core";

/** Payload the API's /auth/login endpoint returns on success and the shape
 *  we carry inside the Auth.js JWT/session. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
  sessionVersion: number;
  totpEnabled?: boolean;
  preferredCurrency?: string | null;
  membership: {
    companyId: string;
    companyName: string;
    companyType: CompanyType;
    role: CompanyRole;
    verificationStatus: VerificationStatus;
    subscriptionTier: SubscriptionTier;
  } | null;
}
