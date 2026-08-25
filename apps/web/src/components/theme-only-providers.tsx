"use client";

import { ThemeProvider } from "next-themes";

/**
 * Theme only, for pages with no client-side data fetching or toasts (the
 * public landing page) — kept in its own module, deliberately not
 * co-located with <Providers>, so this route's dependency graph never
 * reaches @tanstack/react-query or sonner and the bundler can't hoist them
 * into a chunk this page has to load. (A same-file sibling export was tried
 * first and didn't work: Next still bundled both, since the module itself —
 * imports and all — is the unit it chunks, not individual exports. Verified
 * via `next build`'s route JS sizes, not just runtime behaviour.)
 */
export function ThemeOnlyProviders({
  children,
  nonce,
}: {
  children: React.ReactNode;
  /** CSP nonce for next-themes' inline bootstrap script (set on CSP'd routes). */
  nonce?: string;
}) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      nonce={nonce}
    >
      {children}
    </ThemeProvider>
  );
}
