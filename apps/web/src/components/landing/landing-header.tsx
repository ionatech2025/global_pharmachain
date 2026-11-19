import { Button } from "@pharmachain/ui/components/button";
import { ArrowRight, CircleHelp, Scale, ShieldCheck, Store, Workflow } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV_LINKS = [
  { href: "#mall-directory", label: "Mall Directory", icon: Store },
  { href: "#how", label: "How it works", icon: Workflow },
  { href: "#platform", label: "Platform", icon: ShieldCheck },
  { href: "#faq", label: "FAQ", icon: CircleHelp },
  { href: "#compliance", label: "Compliance", icon: Scale },
];

export function LandingHeader() {
  return (
    <>
      <div role="region" aria-label="Platform announcement">
        <div className="mx-auto flex h-9 w-full max-w-7xl items-center justify-center gap-4 px-4 text-xs text-muted-foreground sm:justify-between sm:px-6 lg:px-8">
          <p className="flex items-center gap-2 truncate">
            <span className="size-1.5 shrink-0 rounded-full bg-success" aria-hidden />
            Enterprise Pharma Sourcing: Interlinking Upstream Raw Inputs, Midstream Assets &
            Downstream Distribution
          </p>
          <Link
            href="/register"
            className="hidden shrink-0 items-center gap-1 font-medium text-primary hover:underline sm:flex"
          >
            Onboard Your Company <ArrowRight className="size-3" />
          </Link>
        </div>
      </div>

      <header className="sticky top-0 z-40 border-b border-border/60 bg-card/70 backdrop-blur-md dark:bg-background/70">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <Link href="/" aria-label="Global PharmaChain home">
            <Logo markClassName="size-7 sm:size-8" wordClassName="text-base sm:text-xl" />
          </Link>
          <nav className="hidden items-center lg:flex" aria-label="Landing sections">
            {NAV_LINKS.map(({ href, label, icon: Icon }) => (
              <a
                key={href}
                href={href}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-foreground"
              >
                <Icon aria-hidden className="hidden size-4 text-muted-foreground xl:block" />
                {label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <Button asChild variant="ghost" className="hidden sm:inline-flex">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild className="rounded-lg px-3.5 sm:px-4">
              <Link href="/register">
                Get started <ArrowRight className="hidden sm:inline" />
              </Link>
            </Button>
          </div>
        </div>
      </header>
    </>
  );
}
