/**
 * WhatsApp delivery (US-604).
 *
 * Meta only lets a business start a conversation with an APPROVED TEMPLATE —
 * free-form text is accepted only inside the 24-hour window that opens when the
 * user messages the business first, which a notification platform never has.
 * So both things this platform sends go out as templates:
 *
 *  - the number-verification code, through an Authentication template with a
 *    copy-code button (the code is the body parameter AND the button's);
 *  - every notification, through one Utility template whose body carries the
 *    short summary-and-link text as its single parameter.
 *
 * The adapter used to post `type: "text"`, which Meta refuses for exactly this
 * reason, and production had no WhatsApp configuration at all — the fallback
 * console provider "sent" every code to the server log while the page said it
 * was on its way (client review, 2026-11-11). Now an unconfigured channel is
 * OFF: nothing claims to send, and the UI says WhatsApp is not available.
 */
export interface WhatsAppProvider {
  /** Notification text (summary + link only; never document content). */
  send(number: string, text: string): Promise<void>;
  /** The 6-digit verification code for a number being registered. */
  sendCode(number: string, code: string): Promise<void>;
}

export type WhatsAppConfig =
  | {
      mode: "meta";
      token: string;
      phoneNumberId: string;
      verifyTemplate: string;
      notifyTemplate: string;
      language: string;
      graphVersion: string;
    }
  | { mode: "console" }
  | { mode: "off"; reason: string };

/** Graph API version used when WHATSAPP_GRAPH_VERSION is unset (v26.0: July 2026). */
export const DEFAULT_GRAPH_VERSION = "v26.0";

/**
 * Reads the channel's configuration. `meta` needs every value — a token
 * without approved templates cannot reach anyone. `console` is a development
 * stand-in and is refused in production, where it would report deliveries
 * that never happened.
 */
export function whatsappConfigFromEnv(env: NodeJS.ProcessEnv = process.env): WhatsAppConfig {
  const provider = env.WHATSAPP_PROVIDER?.trim().toLowerCase();
  if (provider === "meta") {
    const read = (name: string) => env[name]?.trim() ?? "";
    const required = [
      "WHATSAPP_TOKEN",
      "WHATSAPP_PHONE_ID",
      "WHATSAPP_TEMPLATE_VERIFY",
      "WHATSAPP_TEMPLATE_NOTIFY",
    ];
    const missing = required.filter((name) => !read(name));
    if (missing.length > 0) {
      return { mode: "off", reason: `WHATSAPP_PROVIDER=meta but ${missing.join(", ")} unset` };
    }
    return {
      mode: "meta",
      token: read("WHATSAPP_TOKEN"),
      phoneNumberId: read("WHATSAPP_PHONE_ID"),
      verifyTemplate: read("WHATSAPP_TEMPLATE_VERIFY"),
      notifyTemplate: read("WHATSAPP_TEMPLATE_NOTIFY"),
      language: env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || "en",
      graphVersion: env.WHATSAPP_GRAPH_VERSION?.trim() || DEFAULT_GRAPH_VERSION,
    };
  }
  if (provider === "console") {
    return env.NODE_ENV === "production"
      ? { mode: "off", reason: "the console provider is for development only" }
      : { mode: "console" };
  }
  return { mode: "off", reason: "WHATSAPP_PROVIDER is not set" };
}

function maskNumber(number: string): string {
  return number.length > 6 ? `${number.slice(0, 4)}•••${number.slice(-2)}` : "•••";
}

/** Development stand-in — logs a masked line instead of sending. */
class ConsoleWhatsAppProvider implements WhatsAppProvider {
  async send(number: string, text: string): Promise<void> {
    console.log(`[whatsapp:console] to=${maskNumber(number)} text="${text.slice(0, 120)}"`);
  }
  async sendCode(number: string, code: string): Promise<void> {
    console.log(`[whatsapp:console] to=${maskNumber(number)} verification code=${code}`);
  }
}

/** Used when the channel is off. Callers check whatsappAvailable() first; a
 *  call that gets here anyway fails loudly instead of pretending to deliver. */
class DisabledWhatsAppProvider implements WhatsAppProvider {
  constructor(private readonly reason: string) {}
  async send(): Promise<void> {
    throw new Error(`whatsapp is not configured (${this.reason})`);
  }
  async sendCode(): Promise<void> {
    throw new Error(`whatsapp is not configured (${this.reason})`);
  }
}

/**
 * A template parameter may not contain newlines, tabs or more than four
 * consecutive spaces (Meta error 132018), and a body is capped at 1024
 * characters including the template's own text.
 */
export function templateParam(text: string, max = 900): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** Meta WhatsApp Cloud API; throws on non-2xx so the outbox retries. */
export class MetaCloudWhatsAppProvider implements WhatsAppProvider {
  constructor(
    private readonly config: Extract<WhatsAppConfig, { mode: "meta" }>,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async post(number: string, template: Record<string, unknown>): Promise<void> {
    const { graphVersion, phoneNumberId, token } = this.config;
    const res = await this.fetchImpl(
      `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: number.replace(/[^\d]/g, ""),
          type: "template",
          template,
        }),
      },
    );
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      throw new Error(`whatsapp cloud api ${res.status}: ${detail}`);
    }
  }

  send(number: string, text: string): Promise<void> {
    return this.post(number, {
      name: this.config.notifyTemplate,
      language: { code: this.config.language },
      components: [{ type: "body", parameters: [{ type: "text", text: templateParam(text) }] }],
    });
  }

  sendCode(number: string, code: string): Promise<void> {
    // Authentication template with a copy-code button: Meta stores the OTP
    // button as a URL button, so the code is passed as its url parameter too.
    return this.post(number, {
      name: this.config.verifyTemplate,
      language: { code: this.config.language },
      components: [
        { type: "body", parameters: [{ type: "text", text: code }] },
        { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
      ],
    });
  }
}

export function createWhatsAppProvider(config: WhatsAppConfig): WhatsAppProvider {
  switch (config.mode) {
    case "meta":
      return new MetaCloudWhatsAppProvider(config);
    case "console":
      return new ConsoleWhatsAppProvider();
    default:
      return new DisabledWhatsAppProvider(config.reason);
  }
}

/** Whether WhatsApp can actually be delivered here — what the UI and the
 *  notification fan-out ask before offering or queueing the channel. */
export function whatsappAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  return whatsappConfigFromEnv(env).mode !== "off";
}
