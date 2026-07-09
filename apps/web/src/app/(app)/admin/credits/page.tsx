import { PageHeader } from "@/components/page-header";
import { apiServer } from "@/lib/api/server";
import type { AdminCreditRequestRow } from "@/lib/api/types";
import { CreditQueue } from "./credit-queue";

export const metadata = { title: "Credit requests" };

export default async function AdminCreditsPage() {
  const api = await apiServer();
  const requests = await api.get<AdminCreditRequestRow[]>("/admin/credit-requests");

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="Credit requests"
        description="Payments are handled off-platform (US-907); confirm once the fee is received — the company's limit rises immediately for the current month."
      />
      <CreditQueue requests={requests} />
    </div>
  );
}
