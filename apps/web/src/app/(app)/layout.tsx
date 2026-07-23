import type { AuthenticatedUser } from "@pharmachain/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { AppShell } from "@/components/app-shell";
import { Providers } from "@/components/providers";
import { ApiClientError } from "@/lib/api/http";
import { apiServer } from "@/lib/api/server";
import type { AnnouncementRow } from "@/lib/api/types";

// Server-side guard on the layout (data-layer auth — no middleware.ts).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  const api = await apiServer();
  try {
    // Fresh state from the API — role/verification changes apply immediately
    const [me, announcements] = await Promise.all([
      api.get<AuthenticatedUser>("/auth/me"),
      api.get<AnnouncementRow[]>("/announcements/active"),
    ]);
    return (
      <Providers nonce={nonce}>
        <AppShell me={me} announcements={announcements}>
          {children}
        </AppShell>
      </Providers>
    );
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 401) {
      // Session revoked (deactivation, password reset, sessionVersion bump)
      await signOut({ redirect: false });
      redirect("/login");
    }
    throw err;
  }
}
