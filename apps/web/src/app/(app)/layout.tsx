import type { AuthenticatedUser } from "@pharmachain/auth";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { AppShell } from "@/components/app-shell";
import { Providers } from "@/components/providers";
import { TimeZoneSync, TZ_COOKIE } from "@/components/time-zone-sync";
import { ApiClientError } from "@/lib/api/http";
import { apiServer, getViewer } from "@/lib/api/server";
import type { AnnouncementRow } from "@/lib/api/types";
import { decodeTimeZoneCookie, setViewerFormat } from "@/lib/format";

// Server-side guard on the layout (data-layer auth — no middleware.ts).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  const api = await apiServer();
  try {
    // Fresh state from the API — role/verification changes apply immediately
    const [me, announcements] = await Promise.all([
      getViewer(),
      api.get<AnnouncementRow[]>("/announcements/active"),
    ]);
    // Prime the request-scoped formatter store so server-rendered dates and
    // amounts honour the viewer's saved locale/time zone. The cookie <TimeZoneSync/>
    // writes only backfills a zone the account has not set — without it Intl
    // falls back to the serverless function's own zone (UTC) and every
    // timestamp is off by the viewer's offset (US-205 QA, 2026-08-30).
    const browserTimeZone = decodeTimeZoneCookie((await cookies()).get(TZ_COOKIE)?.value);
    setViewerFormat({ locale: me.locale, timeZone: me.timeZone ?? browserTimeZone });
    return (
      <Providers nonce={nonce}>
        <TimeZoneSync />
        <AppShell me={me} announcements={announcements} fallbackTimeZone={browserTimeZone}>
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
