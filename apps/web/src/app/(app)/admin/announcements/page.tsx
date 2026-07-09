import { PageHeader } from "@/components/page-header";
import { apiServer } from "@/lib/api/server";
import type { AdminAnnouncementRow } from "@/lib/api/types";
import { AnnouncementManager } from "./announcement-manager";

export const metadata = { title: "Announcements" };

export default async function AdminAnnouncementsPage() {
  const api = await apiServer();
  const announcements = await api.get<AdminAnnouncementRow[]>("/admin/announcements");

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="Announcements"
        description="Shown as a banner and in the notification centre for the chosen audience until expiry or retraction (US-902). No emails are sent."
      />
      <AnnouncementManager announcements={announcements} />
    </div>
  );
}
