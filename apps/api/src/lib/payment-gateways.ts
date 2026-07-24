import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentMethod } from "@pharmachain/core";

/**
 * Payment gateway abstraction (Phase 3 §1). The platform never holds funds:
 * gateways either hand back instructions for a direct transfer (manual bank)
 * or drive an external provider whose webhook confirms the movement.
 *
 * - manual  — bank/EFT instructions + a unique reference; the payee confirms
 * - mock    — sandbox gateway for card/mobile money; its signed webhook
 *             (HMAC over timestamp.ref.status with PAYMENT_WEBHOOK_SECRET)
 *             exercises the full webhook path without a real provider
 * - flutterwave — real card + MTN/M-Pesa mobile money, enabled when
 *             FLUTTERWAVE_SECRET_KEY is set; webhook verified via verif-hash
 *
 * No card or mobile-money credentials ever touch the platform; secrets live
 * in env only.
 */

export interface InitiateResult {
  provider: string;
  providerRef: string;
  /** Human instructions (manual) or a checkout hint (hosted providers). */
  instructions: string;
}

export interface WebhookVerdict {
  valid: boolean;
  providerRef?: string;
  status?: "CONFIRMED" | "FAILED";
  reason?: string;
}

export interface PaymentGateway {
  readonly id: string;
  initiate(input: {
    reference: string;
    amount: number;
    currency: string;
    method: PaymentMethod;
    bankDetails: string;
  }): Promise<InitiateResult>;
  verifyWebhook(body: Record<string, unknown>): WebhookVerdict;
}

const REPLAY_WINDOW_MS = 5 * 60 * 1000;

function hmacSignature(secret: string, timestamp: string, ref: string, status: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${ref}.${status}`).digest("hex");
}

class ManualBankGateway implements PaymentGateway {
  readonly id = "manual";
  async initiate(input: {
    reference: string;
    amount: number;
    currency: string;
    bankDetails: string;
  }): Promise<InitiateResult> {
    return {
      provider: this.id,
      providerRef: input.reference,
      instructions: `Transfer ${input.currency} ${input.amount.toFixed(2)} quoting reference ${input.reference}. ${input.bankDetails}`,
    };
  }
  verifyWebhook(): WebhookVerdict {
    return { valid: false, reason: "manual payments are confirmed in-app, not by webhook" };
  }
}

/** Sandbox gateway: signed webhooks with timestamp replay protection. */
class MockGateway implements PaymentGateway {
  readonly id = "mock";
  constructor(private readonly secret: string) {}
  async initiate(input: { reference: string; method: PaymentMethod }): Promise<InitiateResult> {
    return {
      provider: this.id,
      providerRef: input.reference,
      instructions:
        input.method === "MOBILE_MONEY"
          ? `Sandbox mobile-money prompt sent — confirmation arrives by signed webhook (ref ${input.reference}).`
          : `Sandbox card checkout created — confirmation arrives by signed webhook (ref ${input.reference}).`,
    };
  }
  verifyWebhook(body: Record<string, unknown>): WebhookVerdict {
    const { reference, status, timestamp, signature } = body as Record<string, string>;
    if (!reference || !status || !timestamp || !signature) {
      return { valid: false, reason: "missing fields" };
    }
    const age = Math.abs(Date.now() - Date.parse(timestamp));
    if (!Number.isFinite(age) || age > REPLAY_WINDOW_MS) {
      return { valid: false, reason: "stale or invalid timestamp (replay protection)" };
    }
    const expected = hmacSignature(this.secret, timestamp, reference, status);
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { valid: false, reason: "bad signature" };
    }
    return {
      valid: true,
      providerRef: reference,
      status: status === "successful" ? "CONFIRMED" : "FAILED",
    };
  }
}

/** Flutterwave adapter (cards + MTN MoMo + M-Pesa), env-gated like the Meta
 *  WhatsApp provider: set FLUTTERWAVE_SECRET_KEY + FLUTTERWAVE_VERIF_HASH. */
class FlutterwaveGateway implements PaymentGateway {
  readonly id = "flutterwave";
  constructor(
    private readonly secretKey: string,
    private readonly verifHash: string,
  ) {}
  async initiate(input: {
    reference: string;
    amount: number;
    currency: string;
  }): Promise<InitiateResult> {
    const res = await fetch("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tx_ref: input.reference,
        amount: input.amount,
        currency: input.currency,
        redirect_url: `${process.env.APP_URL}/finance`,
      }),
    });
    if (!res.ok) throw new Error(`flutterwave initiate failed: ${res.status}`);
    const data = (await res.json()) as { data?: { link?: string } };
    return {
      provider: this.id,
      providerRef: input.reference,
      instructions: `Complete payment at: ${data.data?.link ?? "(hosted checkout)"}`,
    };
  }
  verifyWebhook(body: Record<string, unknown>): WebhookVerdict {
    // Flutterwave sends the verif-hash back in the payload we mirror under
    // _verifHash (set by the controller from the header).
    if ((body._verifHash as string) !== this.verifHash) {
      return { valid: false, reason: "bad verif-hash" };
    }
    const data = body.data as { tx_ref?: string; status?: string } | undefined;
    if (!data?.tx_ref) return { valid: false, reason: "missing tx_ref" };
    return {
      valid: true,
      providerRef: data.tx_ref,
      status: data.status === "successful" ? "CONFIRMED" : "FAILED",
    };
  }
}

export function gatewayFor(method: PaymentMethod): PaymentGateway {
  if (method === "BANK_TRANSFER") return new ManualBankGateway();
  const flwKey = process.env.FLUTTERWAVE_SECRET_KEY;
  const flwHash = process.env.FLUTTERWAVE_VERIF_HASH;
  if (flwKey && flwHash) return new FlutterwaveGateway(flwKey, flwHash);
  return new MockGateway(process.env.PAYMENT_WEBHOOK_SECRET ?? "dev-webhook-secret");
}

export function gatewayById(id: string): PaymentGateway | null {
  switch (id) {
    case "manual":
      return new ManualBankGateway();
    case "mock":
      return new MockGateway(process.env.PAYMENT_WEBHOOK_SECRET ?? "dev-webhook-secret");
    case "flutterwave": {
      const key = process.env.FLUTTERWAVE_SECRET_KEY;
      const hash = process.env.FLUTTERWAVE_VERIF_HASH;
      return key && hash ? new FlutterwaveGateway(key, hash) : null;
    }
    default:
      return null;
  }
}

/** Test helper + sandbox tooling: produce a validly-signed mock webhook. */
export function signMockWebhook(
  reference: string,
  status: "successful" | "failed",
  timestamp = new Date().toISOString(),
  secret = process.env.PAYMENT_WEBHOOK_SECRET ?? "dev-webhook-secret",
): Record<string, string> {
  return {
    reference,
    status,
    timestamp,
    signature: hmacSignature(secret, timestamp, reference, status),
  };
}
