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
  smtp?: Partial<SmtpConfig>;
}

const DEFAULT_FROM = "PharmaChain <no-reply@pharmachain.local>";
const DEFAULT_PORT = 587;
/** The port that means implicit TLS, when SMTP_SECURE does not say. */
const SMTPS_PORT = 465;

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

  return {
    provider,
    // A relay almost always rejects a From it does not own, so the mailbox we
    // authenticate as beats the dev placeholder when EMAIL_FROM is unset.
    from: env.EMAIL_FROM || (user?.includes("@") ? user : DEFAULT_FROM),
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
    return new SmtpEmailProvider(config.from, {
      host: smtp.host,
      port: smtp.port ?? DEFAULT_PORT,
      secure: smtp.secure ?? (smtp.port ?? DEFAULT_PORT) === SMTPS_PORT,
      user: smtp.user,
      password: smtp.password,
    });
  }
  return new ConsoleEmailProvider(config.from);
}
