import type { AuthenticatedUser } from "@pharmachain/auth";
import { COMPANY_ROLE_LABELS } from "@pharmachain/core";
import { PageHeader } from "@/components/page-header";
import { apiServer } from "@/lib/api/server";
import { AccountPanels } from "./account-panels";

export const metadata = { title: "Account" };

export default async function AccountPage() {
  const api = await apiServer();
  const me = await api.get<AuthenticatedUser>("/auth/me");

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title={me.name}
        description={`${me.email}${
          me.membership
            ? ` · ${COMPANY_ROLE_LABELS[me.membership.role]} at ${me.membership.companyName}`
            : me.isSuperAdmin
              ? " · Platform super admin"
              : ""
        }`}
      />
      <AccountPanels />
    </div>
  );
}
