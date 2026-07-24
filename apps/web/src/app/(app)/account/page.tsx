import { COMPANY_ROLE_LABELS } from "@pharmachain/core";
import { PageHeader } from "@/components/page-header";
import { getViewer } from "@/lib/api/server";
import { AccountPanels } from "./account-panels";

export const metadata = { title: "Account" };

export default async function AccountPage() {
  const me = await getViewer();

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
      <AccountPanels totpEnabled={Boolean(me.totpEnabled)} />
    </div>
  );
}
