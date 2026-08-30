import { createTransport, type Transporter } from "nodemailer";

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

export interface EmailMessage extends EmailContent {
  to: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

/** Bare mailbox out of a From header, whether or not it carries a display
 *  name — `PharmaChain <a@b.c>` and `a@b.c` both yield `a@b.c`. */
export function addressOf(from: string): string {
  return from.match(/<([^>]+)>/)?.[1]?.trim() ?? from.trim();
}

const DISPLAY_NAME = "PharmaChain";

/** A bare address shows up in a mail client as just the mailbox, which for a
 *  consumer relay means recipients see a personal-looking account rather than
 *  the product. Give it the product's name unless one is already set. */
function withDisplayName(from: string): string {
  return from.includes("<") ? from : `${DISPLAY_NAME} <${from}>`;
}

/** Dev provider: prints the full email to stdout (this is how OTP codes and
 *  invite links are read during local development). */
class ConsoleEmailProvider implements EmailProvider {
  constructor(private from: string) {}

  async send(message: EmailMessage): Promise<void> {
    console.log(
      [
        "────────────────────── email (console provider) ──────────────────────",
        `From:    ${this.from}`,
        `To:      ${message.to}`,
        `Subject: ${message.subject}`,
        "",
        message.text,
        "───────────────────────────────────────────────────────────────────────",
      ].join("\n"),
    );
  }
}

/** Bounded so a hung provider can never stall the calling request. */
const SEND_TIMEOUT_MS = 10_000;

export interface SmtpConfig {
  host: string;
  port: number;
  /** Implicit TLS from the first byte (SMTPS, conventionally port 465). Leave
   *  false for submission on 587/25, where STARTTLS is negotiated instead. */
  secure: boolean;
  user?: string;
  password?: string;
}

/** SMTP submission through nodemailer. Credentials live in the transport and
 *  are never logged; the message body is multipart/alternative, so the same
 *  html + text the templates produce reach the recipient. */
class SmtpEmailProvider implements EmailProvider {
  private readonly transport: Transporter;

  constructor(
    private from: string,
    config: SmtpConfig,
    /** Where replies should land when the relay overrides our From. A
     *  consumer relay (Gmail, and others that only accept their own
     *  mailboxes) silently rewrites a From it does not own to the
     *  authenticated account, so the address an operator configured in
     *  EMAIL_FROM never reaches the recipient. Reply-To survives that
     *  rewrite, so the brand mailbox still gets the replies. */
    private replyTo?: string,
  ) {
    this.transport = createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user ? { user: config.user, pass: config.password ?? "" } : undefined,
      // Every stage is bounded: an unreachable relay must fail the send, not
      // hold the request open.
      connectionTimeout: SEND_TIMEOUT_MS,
      greetingTimeout: SEND_TIMEOUT_MS,
      socketTimeout: SEND_TIMEOUT_MS,
    });
  }

  async send(message: EmailMessage): Promise<void> {
    try {
      await this.transport.sendMail({
        from: this.from,
        replyTo: this.replyTo,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
    } catch (err) {
      // Enough to tell a bad password (EAUTH) from an unreachable relay
      // (ECONNECTION/ETIMEDOUT), without echoing what we sent.
      const { code, responseCode } = err as { code?: string; responseCode?: number };
      throw new Error(
        `SMTP send failed (${code ?? "unknown"}${responseCode ? ` ${responseCode}` : ""})`,
      );
    }
  }
}

export interface EmailProviderConfig {
  provider: "console" | "smtp";
  from: string;
  /** Set when EMAIL_FROM names a mailbox the relay does not authenticate as,
   *  and the relay is therefore liable to rewrite the From. */
  replyTo?: string;
  smtp?: Partial<SmtpConfig>;
}

const DEFAULT_FROM = "PharmaChain <no-reply@pharmachain.local>";
const DEFAULT_PORT = 587;
/** The port that means implicit TLS, when SMTP_SECURE does not say. */
const SMTPS_PORT = 465;

/**
 * Consumer mailbox providers send as the account you logged in as, full stop:
 * a From naming any other mailbox is silently replaced on the way out, taking
 * our display name with it.
 *
 * QA 2026-08-30 hit exactly that — production had EMAIL_FROM on one Gmail
 * mailbox while authenticating as another, so invitations landed from an
 * unfamiliar personal address with no product name on it. Unrecognisable to
 * the recipient, and a strong spam signal.
 *
 * Sending the aligned address ourselves is the only way to keep a display
 * name on it. Deliberately narrow: a transactional relay (SendGrid, SES,
 * Postmark) or a company MTA is *expected* to send as any address on a
 * verified domain, and overriding the operator's EMAIL_FROM there would be a
 * regression — so the rule keys on the relays that actually enforce this, and
 * every other host keeps EMAIL_FROM exactly as configured.
 */
const ALIGNED_FROM_HOSTS = [
  "smtp.gmail.com",
  "smtp.mail.yahoo.com",
  "smtp-mail.outlook.com",
  "smtp.office365.com",
  "smtp.mail.me.com",
];

function rewritesUnownedFrom(host: string | undefined, user: string | undefined): user is string {
  if (!host || !user?.includes("@")) return false;
  return ALIGNED_FROM_HOSTS.includes(host.toLowerCase());
}

/**
 * The API and the notification fan-out both build a provider, and they must
 * never disagree about how mail leaves the system — so both read the
 * environment through here rather than each picking the variables apart.
 *
 * Configuring a relay is the switch: set SMTP_HOST and mail goes out over it.
 * EMAIL_PROVIDER only needs setting to override that — "console" to keep a
 * machine with real credentials printing to stdout instead.
 */
export function emailConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): EmailProviderConfig {
  const host = env.SMTP_HOST || undefined;
  const user = env.SMTP_USER || undefined;
  const parsedPort = Number(env.SMTP_PORT);
  const port = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : DEFAULT_PORT;

  let provider: EmailProviderConfig["provider"] = host ? "smtp" : "console";
  if (env.EMAIL_PROVIDER === "smtp") provider = "smtp";
  if (env.EMAIL_PROVIDER === "console") provider = "console";

  // A relay almost always rejects a From it does not own, so the mailbox we
  // authenticate as beats the dev placeholder when EMAIL_FROM is unset.
  const configuredFrom = env.EMAIL_FROM || (user?.includes("@") ? user : DEFAULT_FROM);
  const rewritten = rewritesUnownedFrom(host, user) && addressOf(configuredFrom) !== user;
  const from = withDisplayName(rewritten ? (user as string) : configuredFrom);

  return {
    provider,
    from,
    // Keep the configured mailbox reachable even where the relay took the
    // From away from us.
    replyTo: rewritten ? configuredFrom : undefined,
    smtp: {
      host,
      port,
      // Unset follows the port's convention, which is what an operator expects
      // from a bare host/port pair.
      secure: env.SMTP_SECURE ? env.SMTP_SECURE === "true" : port === SMTPS_PORT,
      user,
      password: env.SMTP_PASSWORD || undefined,
    },
  };
}

export function createEmailProvider(config: EmailProviderConfig): EmailProvider {
  if (config.provider === "smtp") {
    const smtp = config.smtp;
    // A misconfigured relay must be a deploy failure, not a silent fallback to
    // printing password-reset links into the server log.
    if (!smtp?.host) {
      throw new Error("EMAIL_PROVIDER=smtp requires SMTP_HOST to be set");
    }
    return new SmtpEmailProvider(
      config.from,
      {
        host: smtp.host,
        port: smtp.port ?? DEFAULT_PORT,
        secure: smtp.secure ?? (smtp.port ?? DEFAULT_PORT) === SMTPS_PORT,
        user: smtp.user,
        password: smtp.password,
      },
      config.replyTo,
    );
  }
  return new ConsoleEmailProvider(config.from);
}
