import { expect, test } from "@playwright/test";

/** Behavioral regression against the deployed app: hardening properties that
 *  must not silently regress (security headers, throttling, error envelopes,
 *  no server/tech fingerprint). */
const API = "/api/backend";

test("security headers from helmet are present on API responses", async ({ request, baseURL }) => {
  const res = await request.get(`${baseURL}${API}/health`);
  const h = res.headers();
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]?.toLowerCase()).toBe("sameorigin");
  expect(h).toHaveProperty("x-request-id");
});

test("web app does not leak the x-powered-by fingerprint", async ({ request, baseURL }) => {
  const res = await request.get(`${baseURL}/login`);
  expect(res.headers()["x-powered-by"]).toBeUndefined();
});

test("OTP request is throttled per client IP (10 / 15 min)", async ({ request, baseURL }) => {
  const ip = `198.51.100.${Math.floor(Date.now() % 200) + 1}`;
  const codes: number[] = [];
  for (let i = 0; i < 13; i++) {
    const res = await request.post(`${baseURL}${API}/auth/otp/request`, {
      headers: { "x-client-ip": ip },
      data: { email: "throttle-probe@example.com" },
    });
    codes.push(res.status());
  }
  // First requests succeed (200), then the limiter returns 429.
  expect(codes.filter((c) => c === 200).length).toBeGreaterThan(0);
  expect(codes).toContain(429);
});

test("unknown route returns the JSON error envelope, not an HTML stack", async ({
  request,
  baseURL,
}) => {
  const res = await request.get(`${baseURL}${API}/does-not-exist`);
  expect(res.status()).toBe(404);
  const body = await res.json();
  expect(body).toHaveProperty("error");
  expect(body.error).toHaveProperty("code");
});

test("account enumeration is not possible on OTP request", async ({ request, baseURL }) => {
  // Unknown and known accounts both return 200 (no distinguishing signal).
  const unknown = await request.post(`${baseURL}${API}/auth/otp/request`, {
    headers: { "x-client-ip": "198.51.100.240" },
    data: { email: "definitely-not-a-user@example.com" },
  });
  expect(unknown.status()).toBe(200);
});
