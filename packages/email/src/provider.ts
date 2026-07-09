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

/** Resend HTTP API via fetch — the API key travels in a request header only. */
class ResendEmailProvider implements EmailProvider {
  constructor(
    private from: string,
    private apiKey: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });
    if (!res.ok) {
      // Never include headers/body of our request in the error.
      throw new Error(`Resend API responded ${res.status}`);
    }
  }
}

export interface EmailProviderConfig {
  provider: "console" | "resend";
  from: string;
  resendApiKey?: string;
}

export function createEmailProvider(config: EmailProviderConfig): EmailProvider {
  if (config.provider === "resend") {
    if (!config.resendApiKey) {
      throw new Error("EMAIL_PROVIDER=resend requires RESEND_API_KEY to be set");
    }
    return new ResendEmailProvider(config.from, config.resendApiKey);
  }
  return new ConsoleEmailProvider(config.from);
}
