import { Button } from "@pharmachain/ui/components/button";
import { ShieldAlert } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Not authorised" };

/** US-204: restricted access gets a clear explanation, not a generic error. */
export default function ForbiddenPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
        <ShieldAlert className="size-6 text-destructive" />
      </div>
      <div>
        <h1 className="text-lg font-semibold">You're not authorised to view this</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your role doesn't include access to this area. If you think it should, ask your company
          admin to adjust your role.
        </p>
      </div>
      <Button asChild variant="outline">
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}
