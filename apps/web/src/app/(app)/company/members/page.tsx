import { PageHeader } from "@/components/page-header";
import { apiServer, getViewer } from "@/lib/api/server";
import type { InviteRow, MemberRow } from "@/lib/api/types";
import { InvitePanel, MembersTable } from "./members-panel";

export const metadata = { title: "Team members" };

export default async function MembersPage() {
  const api = await apiServer();
  const [members, invites, me] = await Promise.all([
    api.get<MemberRow[]>("/companies/me/members"),
    api.get<InviteRow[]>("/companies/me/invites"),
    // Request-deduplicated: the layout already fetched this.
    getViewer(),
  ]);
  const isAdmin = me.membership?.role === "COMPANY_ADMIN";

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="Team members"
        description="Invite colleagues and manage their roles. At least one active Company Admin is always required."
      />
      {isAdmin && <InvitePanel invites={invites} />}
      <MembersTable members={members} meUserId={me.id} canManage={isAdmin} />
    </div>
  );
}
