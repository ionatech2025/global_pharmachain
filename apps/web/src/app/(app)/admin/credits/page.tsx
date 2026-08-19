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
        description="Card and mobile-money fees confirm themselves on the provider webhook. These are the bank-transfer and escrow ones: match the reference against the statement, then confirm — the company's limit rises immediately for the current month."
      />
      <CreditQueue requests={requests} />
    </div>
  );
}
