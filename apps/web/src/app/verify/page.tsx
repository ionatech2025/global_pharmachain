import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { ThemeOnlyProviders } from "@/components/theme-only-providers";
import { ThemeToggle } from "@/components/theme-toggle";
import { VerifyForm } from "./verify-form";

export const metadata: Metadata = {
  title: "Verify a shipment",
  description:
    "Anti-counterfeit verification: check any Global PharmaChain trace hash against the tamper-evident supply-chain ledger.",
};

/**
 * Public anti-counterfeit verification (Phase 5 §2): anyone holding an order
 * reference + trace hash (printed on shipment paperwork) can confirm the
 * event belongs to an intact ledger — no account needed. This is the
 * foundation regulator portals (UNBS, URA/NDA, Rwanda FDA, TMDA) integrate
 * against, alongside the signed webhook feed.
 */
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ orderNo?: string; hash?: string }>;
}) {
  // Dynamic render so the per-request CSP nonce reaches the theme bootstrap.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const params = await searchParams;
  return (
    <ThemeOnlyProviders nonce={nonce}>
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <main
        id="main"
        tabIndex={-1}
        className="flex min-h-screen flex-col bg-background outline-none"
      >
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-10">
          <div className="mb-8 flex items-center justify-between">
            <Link href="/" aria-label="Global PharmaChain home">
              <Logo markClassName="size-8" wordClassName="text-lg" />
            </Link>
            <ThemeToggle />
          </div>
          <p className="eyebrow text-primary">Anti-counterfeit check</p>
          <h1 className="text-display mt-3 text-3xl sm:text-4xl">Verify a shipment event</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Every supply-chain event on Global PharmaChain is sealed into a hash-chained ledger.
            Enter the order reference and the trace hash from the shipment paperwork — if the ledger
            is intact and the hash belongs to it, the event is authentic.
          </p>
          <VerifyForm
            initialOrderNo={params.orderNo ?? ""}
            initialHash={/^[0-9a-fA-F]{64}$/.test(params.hash ?? "") ? (params.hash as string) : ""}
          />
        </div>
      </main>
    </ThemeOnlyProviders>
  );
}
