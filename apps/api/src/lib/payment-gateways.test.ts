import { afterEach, describe, expect, test } from "bun:test";
import {
  gatewayById,
  mockWebhookSecret,
  signMockWebhook,
  webhookAmountMismatch,
} from "./payment-gateways";

const ENV_KEYS = [
  "NODE_ENV",
  "PAYMENT_WEBHOOK_SECRET",
  "FLUTTERWAVE_SECRET_KEY",
  "FLUTTERWAVE_VERIF_HASH",
] as const;
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

// NODE_ENV is typed read-only; the tests need to flip it.
const env = process.env as Record<string, string | undefined>;

function setEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  for (const key of ENV_KEYS) {
    const value = values[key];
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
}

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = saved[key];
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
});

describe("mockWebhookSecret", () => {
  test("production has no fallback secret", () => {
    expect(mockWebhookSecret({ NODE_ENV: "production" })).toBeNull();
  });

  test("a configured secret is used everywhere", () => {
    expect(mockWebhookSecret({ NODE_ENV: "production", PAYMENT_WEBHOOK_SECRET: "s" })).toBe("s");
    expect(mockWebhookSecret({ PAYMENT_WEBHOOK_SECRET: "s" })).toBe("s");
  });

  test("local development keeps a stand-in so the sandbox flow can be exercised", () => {
    expect(mockWebhookSecret({ NODE_ENV: "development" })).not.toBeNull();
  });
});

describe("sandbox webhook verification", () => {
  test("in production without a configured secret, nothing verifies", () => {
    setEnv({ NODE_ENV: "production" });
    const gateway = gatewayById("mock");
    if (!gateway) throw new Error("mock gateway missing");
    const body = signMockWebhook("PAY-TEST", "successful", undefined, "dev-webhook-secret");
    const verdict = gateway.verifyWebhook(body);
    expect(verdict.valid).toBe(false);
    expect(verdict.reason).toBe("sandbox webhook secret not configured");
  });

  test("with a configured secret, only that secret's signatures verify", () => {
    setEnv({ NODE_ENV: "production", PAYMENT_WEBHOOK_SECRET: "configured-secret" });
    const gateway = gatewayById("mock");
    if (!gateway) throw new Error("mock gateway missing");

    const good = gateway.verifyWebhook(signMockWebhook("PAY-TEST", "successful"));
    expect(good).toMatchObject({ valid: true, providerRef: "PAY-TEST", status: "CONFIRMED" });

    const forged = gateway.verifyWebhook(
      signMockWebhook("PAY-TEST", "successful", undefined, "dev-webhook-secret"),
    );
    expect(forged.valid).toBe(false);
  });
});

describe("Flutterwave webhook verification", () => {
  test("a wrong verif-hash is rejected", () => {
    setEnv({ FLUTTERWAVE_SECRET_KEY: "sk", FLUTTERWAVE_VERIF_HASH: "expected-hash" });
    const gateway = gatewayById("flutterwave");
    if (!gateway) throw new Error("flutterwave gateway missing");
    const verdict = gateway.verifyWebhook({
      _verifHash: "wrong",
      data: { tx_ref: "PAY-1", status: "successful", amount: 100, currency: "USD" },
    });
    expect(verdict.valid).toBe(false);
  });

  test("a valid payload reports the amount and currency that moved", () => {
    setEnv({ FLUTTERWAVE_SECRET_KEY: "sk", FLUTTERWAVE_VERIF_HASH: "expected-hash" });
    const gateway = gatewayById("flutterwave");
    if (!gateway) throw new Error("flutterwave gateway missing");
    const verdict = gateway.verifyWebhook({
      _verifHash: "expected-hash",
      data: { tx_ref: "PAY-1", status: "successful", amount: "250.50", currency: "UGX" },
    });
    expect(verdict).toMatchObject({
      valid: true,
      providerRef: "PAY-1",
      status: "CONFIRMED",
      amount: 250.5,
      currency: "UGX",
    });
  });
});

describe("webhookAmountMismatch", () => {
  test("a short payment or a different currency does not settle", () => {
    expect(
      webhookAmountMismatch({ status: "CONFIRMED", amount: 99, currency: "USD" }, 100, "USD"),
    ).toContain("less than");
    expect(
      webhookAmountMismatch({ status: "CONFIRMED", amount: 100, currency: "EUR" }, 100, "USD"),
    ).toContain("currency");
  });

  test("the full amount, or more, in the right currency settles", () => {
    expect(
      webhookAmountMismatch({ status: "CONFIRMED", amount: 100, currency: "USD" }, 100, "USD"),
    ).toBeNull();
    expect(
      webhookAmountMismatch(
        { status: "CONFIRMED", amount: 100.004, currency: "USD" },
        100.005,
        "USD",
      ),
    ).toBeNull();
  });

  test("failures and payloads without amounts are not checked", () => {
    expect(
      webhookAmountMismatch({ status: "FAILED", amount: 1, currency: "EUR" }, 100, "USD"),
    ).toBeNull();
    expect(webhookAmountMismatch({ status: "CONFIRMED" }, 100, "USD")).toBeNull();
  });
});
