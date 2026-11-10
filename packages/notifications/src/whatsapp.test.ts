import { describe, expect, test } from "bun:test";
import {
  DEFAULT_GRAPH_VERSION,
  MetaCloudWhatsAppProvider,
  templateParam,
  whatsappAvailable,
  whatsappConfigFromEnv,
} from "./whatsapp";

const META = {
  WHATSAPP_PROVIDER: "meta",
  WHATSAPP_TOKEN: "token",
  WHATSAPP_PHONE_ID: "1234567890",
  WHATSAPP_TEMPLATE_VERIFY: "pharmachain_verify",
  WHATSAPP_TEMPLATE_NOTIFY: "pharmachain_update",
} as unknown as NodeJS.ProcessEnv;

describe("WhatsApp channel configuration (US-604, client review 2026-11-11)", () => {
  test("unset is off — production shipped like this and pretended to send", () => {
    const config = whatsappConfigFromEnv({ NODE_ENV: "production" } as NodeJS.ProcessEnv);
    expect(config.mode).toBe("off");
    expect(whatsappAvailable({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBe(false);
  });

  test("the console stand-in is refused in production", () => {
    const env = { NODE_ENV: "production", WHATSAPP_PROVIDER: "console" } as NodeJS.ProcessEnv;
    expect(whatsappConfigFromEnv(env).mode).toBe("off");
  });

  test("the console stand-in works in development", () => {
    const env = { NODE_ENV: "development", WHATSAPP_PROVIDER: "console" } as NodeJS.ProcessEnv;
    expect(whatsappConfigFromEnv(env).mode).toBe("console");
  });

  test("meta without approved templates is off, and says what is missing", () => {
    const env = { ...META, WHATSAPP_TEMPLATE_NOTIFY: "" } as NodeJS.ProcessEnv;
    const config = whatsappConfigFromEnv(env);
    expect(config.mode).toBe("off");
    expect(config.mode === "off" && config.reason).toContain("WHATSAPP_TEMPLATE_NOTIFY");
  });

  test("meta with everything set is on, with defaults for language and version", () => {
    const config = whatsappConfigFromEnv(META);
    expect(config).toMatchObject({
      mode: "meta",
      language: "en",
      graphVersion: DEFAULT_GRAPH_VERSION,
    });
  });
});

describe("Meta Cloud API payloads", () => {
  function capture() {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const config = whatsappConfigFromEnv(META);
    if (config.mode !== "meta") throw new Error("expected meta config");
    return { calls, provider: new MetaCloudWhatsAppProvider(config, fetchImpl) };
  }

  test("a notification is a template message, never free-form text", async () => {
    const { calls, provider } = capture();
    await provider.send(
      "+256 700 000 001",
      "PharmaChain: new quotation on RFQ-1. https://x/rfqs/1",
    );
    expect(calls[0]?.url).toBe(
      `https://graph.facebook.com/${DEFAULT_GRAPH_VERSION}/1234567890/messages`,
    );
    expect(calls[0]?.body).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "256700000001",
      type: "template",
      template: {
        name: "pharmachain_update",
        language: { code: "en" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: "PharmaChain: new quotation on RFQ-1. https://x/rfqs/1" },
            ],
          },
        ],
      },
    });
  });

  test("the verification code uses the authentication template's copy-code button", async () => {
    const { calls, provider } = capture();
    await provider.sendCode("+256700000001", "123456");
    expect(calls[0]?.body.template).toEqual({
      name: "pharmachain_verify",
      language: { code: "en" },
      components: [
        { type: "body", parameters: [{ type: "text", text: "123456" }] },
        {
          type: "button",
          sub_type: "url",
          index: "0",
          parameters: [{ type: "text", text: "123456" }],
        },
      ],
    });
  });

  test("a refused send throws, so the outbox retries and the API reports it", async () => {
    const config = whatsappConfigFromEnv(META);
    if (config.mode !== "meta") throw new Error("expected meta config");
    const provider = new MetaCloudWhatsAppProvider(
      config,
      (async () =>
        new Response('{"error":{"code":131026}}', { status: 400 })) as unknown as typeof fetch,
    );
    await expect(provider.sendCode("+256700000001", "123456")).rejects.toThrow("400");
  });

  test("template parameters are single-line and bounded (Meta error 132018)", () => {
    expect(templateParam("a\nb\t c      d")).toBe("a b c d");
    expect(templateParam("x".repeat(2000)).length).toBe(900);
  });
});
