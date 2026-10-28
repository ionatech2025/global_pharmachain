import { prisma } from "@pharmachain/db";
import { genericEventEmail } from "@pharmachain/email";
import { notify } from "@pharmachain/notifications";
import { env } from "../../env";
import { renewalComplete } from "./verification-checklist";

/**
 * A company flagged EXPIRED_DOCUMENT whose renewal is in goes back to the
 * verification queue, as a rejected company's re-upload already does. It stays
 * unverified — marketplace actions still wait for a platform admin — but it now
 * reads "Awaiting re-approval" instead of "Document expired", and the platform
 * team is told there is something to review (client review, 2026-10-27).
 *
 * Called after a verification upload completes and by the daily expiry sweep.
 * The move is conditional, so the two racing each other move the company once.
 */
export async function requeueIfRenewed(companyId: string, now = new Date()): Promise<boolean> {
  if (!(await renewalComplete(companyId, now))) return false;
  const moved = await prisma.company.updateMany({
    where: { id: companyId, verificationStatus: "EXPIRED_DOCUMENT" },
    data: { verificationStatus: "PENDING_VERIFICATION", rejectionReason: null },
  });
  if (moved.count === 0) return false;

  const [company, platformAdmins] = await Promise.all([
    prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { name: true } }),
    prisma.user.findMany({ where: { isSuperAdmin: true, status: "ACTIVE" }, select: { id: true } }),
  ]);
  await notify({
    userIds: platformAdmins.map((u) => u.id),
    type: "APPROVAL_PENDING",
    title: `${company.name}: renewal awaiting re-approval`,
    body: "Its expired documents have been replaced and every check passes. Review the new documents and re-approve the company.",
    href: `/admin/companies/${companyId}`,
    emailContent: genericEventEmail({
      title: `${company.name} is awaiting re-approval`,
      body: `${company.name} has replaced its expired compliance documents and every automated check passes. It stays unverified until a platform administrator re-approves it.`,
      url: `${env.APP_URL}/admin/companies/${companyId}`,
      cta: "Review the company",
    }),
  });
  await notify({
    companyId,
    roles: ["COMPANY_ADMIN"],
    type: "DOCUMENT_EXPIRY",
    title: "Renewal received — awaiting re-approval",
    body: "Your renewed documents are with the platform team. Marketplace actions unlock again once they re-approve your company.",
    href: "/company/verification",
  });
  return true;
}
