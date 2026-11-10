import { PageHeader } from "@/components/page-header";
import { PushOptIn } from "@/components/push-optin";
import { apiServer } from "@/lib/api/server";
import type { NotificationRow, Paginated } from "@/lib/api/types";
import { NotificationList, PreferencesPanel } from "./notifications-panel";

export const metadata = { title: "Notifications" };

interface PreferencesResponse {
  preferences: Array<{ eventType: string; email: boolean; whatsapp: boolean }>;
}

interface WhatsappStatus {
  available: boolean;
  verified: boolean;
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const api = await apiServer();
  const [notifications, prefs, whatsapp] = await Promise.all([
    api.get<Paginated<NotificationRow>>("/notifications", {
      query: { page: params.page ?? 1 },
    }),
    api.get<PreferencesResponse>("/notifications/preferences"),
    api.get<WhatsappStatus>("/auth/me/whatsapp"),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="Notifications"
        description={
          whatsapp.available
            ? "In-app notifications are always on; choose which events also reach you by email or WhatsApp."
            : "In-app notifications are always on; choose which events also reach you by email."
        }
      >
        <PushOptIn />
      </PageHeader>
      <NotificationList notifications={notifications} />
      <PreferencesPanel
        initial={prefs.preferences}
        whatsappAvailable={whatsapp.available}
        whatsappVerified={whatsapp.verified}
      />
    </div>
  );
}
