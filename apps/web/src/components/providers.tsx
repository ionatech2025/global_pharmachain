"use client";

import { Toaster } from "@pharmachain/ui/components/sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState } from "react";
import { ApiClientError } from "@/lib/api/http";

export function Providers({
  children,
  nonce,
}: {
  children: React.ReactNode;
  /** CSP nonce for next-themes' inline bootstrap script (set on CSP'd routes). */
  nonce?: string;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            retry: (failureCount, error) => {
              // Session died (deactivation, sessionVersion bump) → sign in again
              if (error instanceof ApiClientError && error.status === 401) {
                window.location.assign("/login");
                return false;
              }
              return failureCount < 2;
            },
          },
        },
      }),
  );

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      nonce={nonce}
    >
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster richColors position="top-right" />
      </QueryClientProvider>
    </ThemeProvider>
  );
}

/**
 * Theme only, for pages with no client-side data fetching or toasts (the
 * public landing page) — skips shipping react-query + sonner's JS to every
 * anonymous visitor (Lighthouse: this was the biggest first-party script in
 * the landing page's bootup-time breakdown, and the landing page's tree has
 * zero useQuery/useMutation/toast calls to justify it).
 */
export function ThemeOnlyProviders({
  children,
  nonce,
}: {
  children: React.ReactNode;
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
