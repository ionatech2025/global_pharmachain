export interface WhatsAppProvider {
  send(number: string, text: string): Promise<void>;
}

function maskNumber(number: string): string {
  return number.length > 6 ? `${number.slice(0, 4)}•••${number.slice(-2)}` : "•••";
}

/** Dev/default provider — logs a masked delivery line. */
class ConsoleWhatsAppProvider implements WhatsAppProvider {
  async send(number: string, text: string): Promise<void> {
    console.log(`[whatsapp:console] to=${maskNumber(number)} text="${text.slice(0, 120)}"`);
  }
}

/**
 * Meta WhatsApp Cloud API. Activates when WHATSAPP_PROVIDER=meta and both
 * WHATSAPP_TOKEN + WHATSAPP_PHONE_ID are set; throws on non-2xx so the
 * caller's outbox captures the failure for retry.
 */
class MetaCloudWhatsAppProvider implements WhatsAppProvider {
  constructor(
    private readonly token: string,
    private readonly phoneNumberId: string,
  ) {}

  async send(number: string, text: string): Promise<void> {
    const to = number.replace(/[^\d]/g, "");
    const res = await fetch(`https://graph.facebook.com/v20.0/${this.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      }),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      throw new Error(`whatsapp cloud api ${res.status}: ${detail}`);
    }
  }
}

export function createWhatsAppProvider(provider: string | undefined): WhatsAppProvider {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_ID;
  if (provider === "meta" && token && phoneNumberId) {
    return new MetaCloudWhatsAppProvider(token, phoneNumberId);
  }
  if (provider === "meta") {
    console.warn(
      "[whatsapp] WHATSAPP_PROVIDER=meta but WHATSAPP_TOKEN/WHATSAPP_PHONE_ID missing — using console provider",
    );
  }
  return new ConsoleWhatsAppProvider();
}
