import type { EmailContent } from "./provider";

/**
 * Every dynamic value is escaped before it touches HTML. Message excerpts,
 * company names, RFQ titles and notes are user-controlled — unescaped they
 * would let one tenant inject markup (links, fake buttons) into another
 * tenant's inbox. Templates own the escaping so call sites cannot forget it;
 * callers pass plain text only (newlines are rendered as line breaks).
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function textToHtml(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, "<br/>");
}

/** Subjects are header values — never let a newline through. */
function subjectLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;background:#f4f6f8;margin:0;padding:24px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;padding:32px">
  <tr><td style="font-size:18px;font-weight:bold;color:#00579a;padding-bottom:16px">PharmaChain</td></tr>
  <tr><td style="font-size:16px;font-weight:bold;color:#111827;padding-bottom:12px">${escapeHtml(title)}</td></tr>
  <tr><td style="font-size:14px;color:#374151;line-height:1.6">${bodyHtml}</td></tr>
  <tr><td style="font-size:12px;color:#9ca3af;padding-top:24px">You receive this because you have a PharmaChain account. Manage notification preferences in Settings.</td></tr>
  </table></td></tr></table></body></html>`;
}

/** Only platform-built URLs reach this helper; the label is escaped. */
function link(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;background:#00579a;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;margin-top:12px">${escapeHtml(label)}</a>`;
}

export function welcomeEmail(args: { companyName: string; appUrl: string }): EmailContent {
  const title = "Registration received";
  const bodyText = `Thanks for registering ${args.companyName} on PharmaChain. Your company is now pending verification — upload your compliance documents so our team can review them.`;
  const bodyHtml = `Thanks for registering <strong>${escapeHtml(args.companyName)}</strong> on PharmaChain. Your company is now pending verification — upload your compliance documents so our team can review them.`;
  return {
    subject: "PharmaChain — registration received",
    html: layout(
      title,
      `${bodyHtml}${link(`${args.appUrl}/company/verification`, "Upload documents")}`,
    ),
    text: `${title}\n\n${bodyText}\n${args.appUrl}/company/verification`,
  };
}

export function otpEmail(args: { code: string }): EmailContent {
  const title = "Your sign-in code";
  return {
    subject: "PharmaChain — your sign-in code",
    html: layout(
      title,
      `Use this one-time code to sign in. It expires in 10 minutes.<div style="font-size:28px;font-weight:bold;letter-spacing:6px;margin-top:12px">${escapeHtml(args.code)}</div>`,
    ),
    text: `${title}\n\nYour one-time code (valid 10 minutes): ${args.code}`,
  };
}

export function inviteEmail(args: {
  companyName: string;
  roleLabel: string;
  url: string;
}): EmailContent {
  const title = `You're invited to join ${args.companyName}`;
  const bodyText = `You have been invited to join ${args.companyName} on PharmaChain as ${args.roleLabel}. The invitation link expires in 72 hours.`;
  const bodyHtml = `You have been invited to join <strong>${escapeHtml(args.companyName)}</strong> on PharmaChain as <strong>${escapeHtml(args.roleLabel)}</strong>. The invitation link expires in 72 hours.`;
  return {
    subject: subjectLine(`PharmaChain — invitation to join ${args.companyName}`),
    html: layout(title, `${bodyHtml}${link(args.url, "Accept invitation")}`),
    text: `${title}\n\n${bodyText}\n${args.url}`,
  };
}

export function passwordResetEmail(args: { url: string }): EmailContent {
  const title = "Reset your password";
  const body =
    "We received a request to reset your password. The link below is valid for 60 minutes. If you didn't request this, you can ignore this email.";
  return {
    subject: "PharmaChain — password reset",
    html: layout(title, `${escapeHtml(body)}${link(args.url, "Reset password")}`),
    text: `${title}\n\n${body}\n${args.url}`,
  };
}

export function verificationDecisionEmail(args: {
  companyName: string;
  approved: boolean;
  reason?: string;
  appUrl: string;
}): EmailContent {
  const title = args.approved ? "Your company is verified 🎉" : "Verification not approved";
  const bodyText = args.approved
    ? `${args.companyName} has been verified. You now have full access to the PharmaChain marketplace.`
    : `${args.companyName} was not approved.\n\nReason: ${args.reason ?? "—"}\n\nYou can correct the issues and resubmit your documents.`;
  const bodyHtml = args.approved
    ? `<strong>${escapeHtml(args.companyName)}</strong> has been verified. You now have full access to the PharmaChain marketplace.`
    : `<strong>${escapeHtml(args.companyName)}</strong> was not approved.<br/><br/><em>Reason:</em> ${escapeHtml(args.reason ?? "—")}<br/><br/>You can correct the issues and resubmit your documents.`;
  return {
    subject: `PharmaChain — verification ${args.approved ? "approved" : "rejected"}`,
    html: layout(title, `${bodyHtml}${link(`${args.appUrl}/company/verification`, "View status")}`),
    text: `${title}\n\n${bodyText}`,
  };
}

/** `body` is plain text — it is escaped here and newlines become line breaks. */
export function genericEventEmail(args: {
  title: string;
  body: string;
  url?: string;
  cta?: string;
}): EmailContent {
  return {
    subject: subjectLine(`PharmaChain — ${args.title}`),
    html: layout(
      args.title,
      `${textToHtml(args.body)}${args.url ? link(args.url, args.cta ?? "Open PharmaChain") : ""}`,
    ),
    text: `${args.title}\n\n${args.body}${args.url ? `\n${args.url}` : ""}`,
  };
}
