import {
  createCipheriv,
  createECDH,
  createPrivateKey,
  hkdfSync,
  randomBytes,
  sign as signEcdsa,
} from "node:crypto";

/**
 * Web Push (Phase 4 §1) implemented directly on node:crypto: VAPID (RFC
 * 8292) ES256 tokens and aes128gcm payload encryption (RFC 8291/8188). The
 * protocol is stable and small enough that ~150 lines beat a dependency —
 * and every browser push service speaks exactly this profile.
 *
 * Keys: VAPID_PUBLIC_KEY (base64url, 65-byte uncompressed P-256 point) and
 * VAPID_PRIVATE_KEY (base64url, 32-byte scalar). Generate once with
 * generateVapidKeys() and keep in env.
 */

export interface PushSubscriptionKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

const b64url = (buf: Buffer): string => buf.toString("base64url");
const fromB64url = (value: string): Buffer => Buffer.from(value, "base64url");

export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    publicKey: b64url(ecdh.getPublicKey()),
    privateKey: b64url(ecdh.getPrivateKey()),
  };
}

/** ES256 VAPID JWT for the push service origin. */
function vapidJwt(audience: string, publicKey: string, privateKey: string): string {
  const header = b64url(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64url(
    Buffer.from(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: process.env.VAPID_SUBJECT ?? "mailto:no-reply@pharmachain.local",
      }),
    ),
  );
  const unsigned = `${header}.${claims}`;
  const pub = fromB64url(publicKey);
  const key = createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      x: b64url(pub.subarray(1, 33)),
      y: b64url(pub.subarray(33, 65)),
      d: privateKey,
    },
    format: "jwk",
  });
  // ieee-p1363 = raw r||s — the JOSE signature format, no DER conversion.
  const signature = signEcdsa("sha256", Buffer.from(unsigned), {
    key,
    dsaEncoding: "ieee-p1363",
  });
  return `${unsigned}.${b64url(signature)}`;
}

/** RFC 8291 aes128gcm encryption of a push payload for one subscription. */
export function encryptPushPayload(plaintext: Buffer, p256dh: string, auth: string): Buffer {
  const uaPublic = fromB64url(p256dh);
  const authSecret = fromB64url(auth);

  const ephemeral = createECDH("prime256v1");
  ephemeral.generateKeys();
  const asPublic = ephemeral.getPublicKey();
  const ecdhSecret = ephemeral.computeSecret(uaPublic);

  // PRK = HKDF(auth, ecdh, "WebPush: info" || 0x00 || ua_public || as_public)
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]);
  const prk = Buffer.from(hkdfSync("sha256", ecdhSecret, authSecret, keyInfo, 32));

  const salt = randomBytes(16);
  const cek = Buffer.from(
    hkdfSync("sha256", prk, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16),
  );
  const nonce = Buffer.from(
    hkdfSync("sha256", prk, salt, Buffer.from("Content-Encoding: nonce\0"), 12),
  );

  // aes128gcm body: header(salt | rs | idlen | keyid) || ciphertext
  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(4096);
  const header = Buffer.concat([salt, recordSize, Buffer.from([asPublic.length]), asPublic]);

  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const padded = Buffer.concat([plaintext, Buffer.from([2])]); // 0x02 = last record
  const ciphertext = Buffer.concat([cipher.update(padded), cipher.final(), cipher.getAuthTag()]);
  return Buffer.concat([header, ciphertext]);
}

export interface PushResult {
  ok: boolean;
  status: number;
  /** true when the subscription is dead and should be pruned (404/410). */
  gone: boolean;
}

/** Deliver one encrypted notification to a push endpoint. */
export async function sendWebPush(
  subscription: PushSubscriptionKeys,
  payload: Record<string, unknown>,
): Promise<PushResult> {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return { ok: false, status: 0, gone: false };

  const audience = new URL(subscription.endpoint).origin;
  const jwt = vapidJwt(audience, publicKey, privateKey);
  const body = encryptPushPayload(
    Buffer.from(JSON.stringify(payload)),
    subscription.p256dh,
    subscription.auth,
  );
  const res = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${jwt}, k=${publicKey}`,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      Urgency: "normal",
    },
    body: body.slice().buffer as ArrayBuffer,
    signal: AbortSignal.timeout(10_000),
  });
  return { ok: res.ok, status: res.status, gone: res.status === 404 || res.status === 410 };
}

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}
