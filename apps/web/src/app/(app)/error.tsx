"use client";

import { Button } from "@pharmachain/ui/components/button";
import { RotateCcw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

/**
 * Route-group error boundary: a page-level failure keeps the shell alive and
 * offers recovery instead of a white screen. The digest lets support match a
 * report to server logs without exposing internals.
 */
export default function AppError({
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
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
      <TriangleAlert className="size-8 text-warning" />
      <div>
        <p className="font-medium">Something went wrong loading this page</p>
        <p className="mt-1 text-sm text-muted-foreground">
          The rest of PharmaChain is unaffected. Retry, or head back to your dashboard.
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
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
