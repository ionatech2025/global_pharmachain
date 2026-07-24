import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { Providers } from "@/components/providers";
import { VerifyForm } from "./verify-form";

export const metadata: Metadata = {
  title: "Verify a shipment",
  description:
    "Anti-counterfeit verification: check any PharmaChain trace hash against the tamper-evident supply-chain ledger.",
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
    <Providers nonce={nonce}>
      <main className="flex min-h-screen flex-col bg-background">
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-10">
          <Link href="/" aria-label="PharmaChain home" className="mb-8">
            <Logo markClassName="size-8" wordClassName="text-lg" />
          </Link>
          <p className="eyebrow text-primary">Anti-counterfeit check</p>
          <h1 className="text-display mt-3 text-3xl sm:text-4xl">Verify a shipment event</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Every supply-chain event on PharmaChain is sealed into a hash-chained ledger. Enter the
            order reference and the trace hash from the shipment paperwork — if the ledger is intact
            and the hash belongs to it, the event is authentic.
          </p>
          <VerifyForm
            initialOrderNo={params.orderNo ?? ""}
            initialHash={/^[0-9a-fA-F]{64}$/.test(params.hash ?? "") ? (params.hash as string) : ""}
          />
        </div>
      </main>
    </Providers>
  );
}
