// Module augmentation for Auth.js session/JWT shapes. Imported for side
// effects from index.ts so every consumer of "@pharmachain/auth" gets it.
// The type-only import below pulls "next-auth/jwt" into the program — without
// it TypeScript rejects the augmentation (TS2664).
import type { JWT } from "next-auth/jwt";
import type { AuthenticatedUser } from "./contracts";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      isSuperAdmin: boolean;
      membership: AuthenticatedUser["membership"];
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    sv?: number;
    user?: {
      email: string;
      name: string;
      isSuperAdmin: boolean;
    };
    membership?: AuthenticatedUser["membership"];
  }
}

/** The fully-augmented JWT type used by the web app's callbacks. */
export type AppJwt = JWT;
