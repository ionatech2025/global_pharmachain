import { Button } from "@pharmachain/ui/components/button";
import { FlaskConical } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <FlaskConical className="size-10 text-primary" />
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">404</p>
        <h1 className="mt-1 text-xl font-semibold">This page doesn't exist</h1>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          The link may be outdated, or the record it pointed to is no longer visible to you.
        </p>
      </div>
      <Button asChild>
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}
