import { PageHeader } from "@/components/page-header";
import { PushOptIn } from "@/components/push-optin";
import { apiServer } from "@/lib/api/server";
import type { NotificationRow, Paginated } from "@/lib/api/types";
import { NotificationList, PreferencesPanel } from "./notifications-panel";

export const metadata = { title: "Notifications" };

interface PreferencesResponse {
  preferences: Array<{ eventType: string; email: boolean; whatsapp: boolean }>;
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const api = await apiServer();
  const [notifications, prefs] = await Promise.all([
    api.get<Paginated<NotificationRow>>("/notifications", {
      query: { page: params.page ?? 1 },
    }),
    api.get<PreferencesResponse>("/notifications/preferences"),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="Notifications"
        description="In-app notifications are always on; choose which events also reach you by email or WhatsApp."
      >
        <PushOptIn />
      </PageHeader>
      <NotificationList notifications={notifications} />
      <PreferencesPanel initial={prefs.preferences} />
    </div>
  );
}
