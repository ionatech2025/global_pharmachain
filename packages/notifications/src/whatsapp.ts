export interface WhatsAppProvider {
  send(number: string, text: string): Promise<void>;
}

function maskNumber(number: string): string {
  return number.length > 6 ? `${number.slice(0, 4)}•••${number.slice(-2)}` : "•••";
}

/** Phase 1 stub — logs a masked delivery line. Swapping in Twilio/Meta Cloud
 *  API later means implementing this interface and changing WHATSAPP_PROVIDER. */
class ConsoleWhatsAppProvider implements WhatsAppProvider {
  async send(number: string, text: string): Promise<void> {
    console.log(`[whatsapp:console] to=${maskNumber(number)} text="${text.slice(0, 120)}"`);
  }
}

export function createWhatsAppProvider(_provider: string | undefined): WhatsAppProvider {
  return new ConsoleWhatsAppProvider();
}
