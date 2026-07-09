import { createAuthConfig } from "@pharmachain/auth";
import NextAuth from "next-auth";
import { API_URL } from "./env";

export const { handlers, auth, signIn, signOut } = NextAuth(createAuthConfig({ apiUrl: API_URL }));
