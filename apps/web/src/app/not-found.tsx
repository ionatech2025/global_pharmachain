import { Button } from "@pharmachain/ui/components/button";
import Link from "next/link";
import { LogoMark } from "@/components/logo";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <LogoMark className="size-11" />
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
