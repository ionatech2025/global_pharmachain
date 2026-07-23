import { PageHeader } from "@/components/page-header";
import { apiServer } from "@/lib/api/server";
import type { AdminAnnouncementRow } from "@/lib/api/types";
import { AnnouncementManager } from "./announcement-manager";

export const metadata = { title: "Announcements" };

export default async function AdminAnnouncementsPage() {
  const api = await apiServer();
  const [announcements, companies] = await Promise.all([
    api.get<AdminAnnouncementRow[]>("/admin/announcements"),
    api.get<{ items: Array<{ id: string; name: string }> }>("/admin/companies", {
      query: { pageSize: 100 },
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="Announcements"
        description="Shown as a banner and in the notification centre for the chosen audience until expiry or retraction (US-902). No emails are sent."
      />
      <AnnouncementManager announcements={announcements} companies={companies.items} />
    </div>
  );
}
