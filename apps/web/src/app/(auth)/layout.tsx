import Link from "next/link";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden p-4">
      <div aria-hidden className="absolute inset-0 -z-10 bg-hero-glow" />
      <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-[28rem] bg-grid-fade" />
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <Link href="/" aria-label="Back to PharmaChain home" className="mb-6">
        <Logo markClassName="size-10 sm:size-12" />
      </Link>
      <div className="w-full max-w-lg">{children}</div>
      <p className="mt-6 text-xs text-muted-foreground">
        B2B pharmaceutical sourcing ·{" "}
        <Link href="/privacy" className="underline hover:text-foreground">
          Privacy policy
        </Link>
      </p>
    </main>
  );
}
