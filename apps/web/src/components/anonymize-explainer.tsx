import Link from "next/link";

/**
 * What erasing a person's data does, in words a reviewer can check against the code
 * (AdminService.tombstoneUser). The client asked what it means and what
 * "tombstoning" is (review, 2026-10-27); the company page and the
 * data-requests queue share this so the two can never describe it differently.
 */
export function AnonymizeExplainer({
  name,
  soleAdmin,
}: {
  name: string;
  /** Set when the person is their company's only active Company Admin. */
  soleAdmin?: {
    companyName?: string;
    /** Link to the company page, where a new admin is appointed. */
    companyHref?: string;
    /** Other active members; unknown when omitted. */
    otherMembers?: number;
  };
}) {
  const company = soleAdmin?.companyName ?? "the company";
  return (
    <div className="space-y-2 text-sm">
      <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
        <li>
          <span className="font-medium text-foreground">Erased:</span> {name}&rsquo;s name, email
          address, WhatsApp number, password, passkeys and authenticator app, the devices and IP
          addresses in their sign-in history, their notifications, saved searches and settings. The
          email address can be registered again.
        </li>
        <li>
          <span className="font-medium text-foreground">Closed:</span> they are signed out
          everywhere and the account can never sign in again.
        </li>
        <li>
          <span className="font-medium text-foreground">Kept:</span> the orders, RFQs, documents,
          payments and order messages they took part in, now shown as &ldquo;Deleted User&rdquo; —
          trade records must be retained. The audit log keeps the email address they acted under, as
          the legal record of who did what.
        </li>
        <li>
          <span className="font-medium text-foreground">Told:</span> they are emailed a confirmation
          saying what was erased, what was kept and why, and how to complain.
        </li>
      </ul>
      <p className="font-medium">This cannot be undone.</p>
      {soleAdmin && (
        <p className="rounded-md border border-warning/40 bg-warning/10 p-2.5">
          {soleAdmin.otherMembers === 0 ? (
            <>
              {name} is the only active member of {company}. Afterwards nobody can act for it —
              consider deactivating the company as well.
            </>
          ) : (
            <>
              {name} is the only Company Admin of {company}. Afterwards it has no admin until you
              appoint one of its other members with &ldquo;Appoint as Company Admin&rdquo; on{" "}
              {soleAdmin.companyHref ? (
                <Link href={soleAdmin.companyHref} className="font-medium underline">
                  the company page
                </Link>
              ) : (
                "the company page"
              )}
              .
            </>
          )}
        </p>
      )}
    </div>
  );
}
