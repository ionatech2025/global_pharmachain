import { PageHeader } from "@/components/page-header";
import { apiServer } from "@/lib/api/server";
import type { DeletionRequestRow } from "@/lib/api/types";
import { DeletionQueue } from "./deletion-queue";

export const metadata = { title: "Data deletion requests" };

export default async function AdminDataRequestsPage() {
  const api = await apiServer();
  const requests = await api.get<DeletionRequestRow[]>("/admin/data-deletion-requests");

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="Data deletion requests"
        description="GDPR requests, oldest first — process within 30 days. Anonymizing tombstones the user's personal data and deactivates the account."
      />
      <DeletionQueue requests={requests} />
    </div>
  );
}
