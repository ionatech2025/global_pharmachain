import { FlaskConical } from "lucide-react";
import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/40 p-4">
      <Link href="/" className="mb-6 flex items-center gap-2 text-xl font-semibold text-primary">
        <FlaskConical className="size-6" />
        PharmaChain
      </Link>
      <div className="w-full max-w-lg">{children}</div>
      <p className="mt-6 text-xs text-muted-foreground">
        B2B pharmaceutical sourcing ·{" "}
        <Link href="/privacy" className="underline">
          Privacy policy
        </Link>
      </p>
    </div>
  );
}
