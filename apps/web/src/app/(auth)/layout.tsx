import { headers } from "next/headers";
import Link from "next/link";
import { AuthBrandPanel } from "@/components/glass-panels";
import { Logo } from "@/components/logo";
import { Providers } from "@/components/providers";
import { ThemeToggle } from "@/components/theme-toggle";
import { SUPPORT_EMAIL } from "@/lib/contact";

/**
 * Split auth shell (Hercules Design System): quiet form column left on a
 * 56px (h-14) header datum, daylight-sky brand panel right (≥lg).
 * The arbitrary-variant wrapper demotes the Card chrome every auth page
 * renders (border/shadow/padding off, title up to fluid display size, calm
 * 1.55 description leading) so all auth and legal views share one balanced
 * typographic hierarchy.
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <Providers nonce={nonce}>
      <div className="grid min-h-screen grid-cols-1 bg-background lg:grid-cols-2">
        <a
          href="#main"
          className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          Skip to content
        </a>
        <div className="relative flex min-h-screen flex-col px-5 py-4 sm:px-8 sm:py-5">
          <header className="flex h-14 shrink-0 items-center justify-between">
            <Link href="/" aria-label="Back to Global PharmaChain home">
              <Logo markClassName="size-8" wordClassName="text-lg" />
            </Link>
            <ThemeToggle />
          </header>

          <main
            id="main"
            tabIndex={-1}
            className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center py-10 outline-none sm:py-12"
          >
            <div className="[&_[data-slot=card]]:gap-6 [&_[data-slot=card]]:border-0 [&_[data-slot=card]]:bg-transparent [&_[data-slot=card]]:py-0 [&_[data-slot=card]]:shadow-none [&_[data-slot=card-content]]:px-0 [&_[data-slot=card-description]]:max-w-[54ch] [&_[data-slot=card-description]]:leading-[1.55] [&_[data-slot=card-header]]:gap-2 [&_[data-slot=card-header]]:px-0 [&_[data-slot=card-title]]:text-[clamp(1.5rem,1.25rem+0.8vw,1.875rem)] [&_[data-slot=card-title]]:leading-[1.15] [&_[data-slot=card-title]]:font-bold [&_[data-slot=card-title]]:tracking-[-0.024em]">
              {children}
            </div>
          </main>

          <footer className="pt-4 text-center text-xs leading-relaxed text-muted-foreground">
            Global PharmaChain · independent B2B matching directory ·{" "}
            <Link href="/disclaimer" className="underline underline-offset-2 hover:text-foreground">
              Legal disclaimer
            </Link>
            {" · "}
            <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
              Privacy policy
            </Link>
            {" · "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="underline underline-offset-2 hover:text-foreground"
            >
              {SUPPORT_EMAIL}
            </a>
          </footer>
        </div>

        <AuthBrandPanel />
      </div>
    </Providers>
  );
}
