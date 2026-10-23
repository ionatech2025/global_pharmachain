"use client";

import { Alert, AlertDescription, AlertTitle } from "@pharmachain/ui/components/alert";
import { useQuery } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api/browser";

/**
 * Platform administrators can suspend and delete whole companies, so their sign-in is the
 * one worth hardening first. Adding a passkey is what makes it phishing-resistant; nothing
 * forces it (a release must never lock anyone out), so this asks until they have one.
 * The query key is shared with the Account page, which refreshes it on add / remove.
 */
export function PasskeyNudge() {
  const { data } = useQuery({
    queryKey: ["passkeys"],
    queryFn: () => api.get<unknown[]>("/auth/passkeys"),
    staleTime: 5 * 60_000,
  });
  if (!data || data.length > 0) return null;
  return (
    <Alert variant="warning">
      <KeyRound className="size-4" aria-hidden="true" />
      <AlertTitle>Protect the platform with a passkey</AlertTitle>
      <AlertDescription>
        Your account can suspend and delete companies. A passkey stops a stolen password — or a
        convincing fake sign-in page — from being enough.{" "}
        <Link href="/account#passkeys" className="font-medium underline">
          Add a passkey
        </Link>
      </AlertDescription>
    </Alert>
  );
}
