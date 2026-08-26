import { headers } from "next/headers";
import Link from "next/link";
import { AuthBrandPanel } from "@/components/glass-panels";
import { Logo } from "@/components/logo";
import { Providers } from "@/components/providers";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Split auth shell: quiet form column left, azure brand panel right (≥lg).
 * The arbitrary-variant wrapper demotes the Card chrome every auth page
 * renders (border/shadow/padding off, title up to display size) so all five
 * forms adopt the minimal look from one place.
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <Providers nonce={nonce}>
      <main className="grid min-h-screen grid-cols-1 bg-background lg:grid-cols-2">
        <div className="relative flex min-h-screen flex-col px-5 py-5 sm:px-8">
          <div className="flex items-center justify-between">
            <Link href="/" aria-label="Back to PharmaChain home">
              <Logo markClassName="size-8" wordClassName="text-lg" />
            </Link>
            <ThemeToggle />
          </div>

          <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-12">
            <div className="[&_[data-slot=card]]:gap-6 [&_[data-slot=card]]:border-0 [&_[data-slot=card]]:bg-transparent [&_[data-slot=card]]:py-0 [&_[data-slot=card]]:shadow-none [&_[data-slot=card-content]]:px-0 [&_[data-slot=card-header]]:px-0 [&_[data-slot=card-title]]:text-2xl [&_[data-slot=card-title]]:leading-tight [&_[data-slot=card-title]]:font-semibold [&_[data-slot=card-title]]:tracking-tight">
              {children}
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Global pharmaceutical sourcing ·{" "}
            <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
              Privacy policy
            </Link>
          </p>
        </div>

        <AuthBrandPanel />
      </main>
    </Providers>
  );
}
