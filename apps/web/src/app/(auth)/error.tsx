"use client";

import { Button } from "@pharmachain/ui/components/button";
import { RotateCcw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

/**
 * Route-group error boundary for the auth shell (sign in, register,
 * password reset, invite) — without this, a failure here fell through to
 * the root global-error.tsx, which deliberately renders bare unstyled HTML.
 * Mirrors (app)/error.tsx's recovery pattern, but "dashboard" isn't a valid
 * retreat for someone who isn't signed in yet, so this goes home instead;
 * styling matches this shell's own minimal card treatment (no dashed box).
 */
export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <TriangleAlert className="size-8 text-warning" />
      <div>
        <p className="font-medium">Something went wrong</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Retry, or head back and start again.
          {error.digest && (
            <span className="mt-1 block font-mono text-xs">Reference: {error.digest}</span>
          )}
        </p>
      </div>
      <div className="flex gap-2">
        <Button onClick={reset}>
          <RotateCcw /> Try again
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Back home</Link>
        </Button>
      </div>
    </div>
  );
}
