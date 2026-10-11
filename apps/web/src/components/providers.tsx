"use client";

import { Toaster } from "@pharmachain/ui/components/sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState } from "react";
import { ApiClientError } from "@/lib/api/http";
import { loginUrlFor } from "@/lib/callback-url";

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
              // Session died (deactivation, sessionVersion bump) → sign in
              // again, and come back to this page afterwards.
              if (error instanceof ApiClientError && error.status === 401) {
                window.location.assign(
                  loginUrlFor(`${window.location.pathname}${window.location.search}`),
                );
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
