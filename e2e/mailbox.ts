/**
 * A real, readable inbox for the flows whose acceptance criteria are about
 * mail arriving (US-201 invitations, US-203 admin password resets).
 *
 * Asserting that the API *tried* to send is not the same claim as the one QA
 * made — "user doesn't receive email" — so these tests read a genuine mailbox
 * over the public mail.tm API rather than trusting a return value. It is an
 * external service, so every entry point degrades to `null` and the calling
 * test skips instead of failing when it cannot be reached.
 */

const API = "https://api.mail.tm";
const TIMEOUT_MS = 20_000;

/**
 * Retried: one dropped connection is not evidence the service is down, and
 * treating it as such is worse than a slow test — every case needing a
 * mailbox then skips, and a green run means nothing was actually checked.
 * Only the transport is retried; an HTTP error is an answer, not a blip.
 */
async function call<T>(
  path: string,
  init?: { method?: string; body?: unknown; token?: string },
): Promise<T | null> {
  const attempts = 4;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetch(`${API}${path}`, {
        method: init?.method ?? "GET",
        headers: {
          accept: "application/json",
          ...(init?.body ? { "content-type": "application/json" } : {}),
          ...(init?.token ? { authorization: `Bearer ${init.token}` } : {}),
        },
        body: init?.body ? JSON.stringify(init.body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch {
      if (attempt === attempts - 1) return null;
      await new Promise((resolve) => setTimeout(resolve, 1_000 * (attempt + 1)));
    }
  }
  return null;
}

export interface Mailbox {
  address: string;
  token: string;
}

/** A fresh disposable inbox, or null when the service is unreachable. */
export async function createMailbox(label: string): Promise<Mailbox | null> {
  const domains = await call<{ "hydra:member": { domain: string; isActive: boolean }[] }>(
    "/domains",
  );
  const domain = domains?.["hydra:member"]?.find((d) => d.isActive)?.domain;
  if (!domain) return null;

  const address = `${label}-${Date.now().toString(36)}@${domain}`;
  const password = `Probe-${Math.random().toString(36).slice(2)}-1A`;
  if (!(await call("/accounts", { method: "POST", body: { address, password } }))) return null;

  const auth = await call<{ token: string }>("/token", {
    method: "POST",
    body: { address, password },
  });
  return auth?.token ? { address, token: auth.token } : null;
}

interface MessageSummary {
  id: string;
  subject: string;
}

/**
 * Waits for a message whose subject matches, and returns its plain-text body.
 * Polls rather than streams: delivery is a relay hop plus the recipient's own
 * queue, so it lands seconds after the API call returns, not synchronously.
 */
export async function waitForEmail(
  mailbox: Mailbox,
  subject: RegExp,
  timeoutMs = 90_000,
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const list = await call<{ "hydra:member": MessageSummary[] }>("/messages", {
      token: mailbox.token,
    });
    const hit = list?.["hydra:member"]?.find((m) => subject.test(m.subject));
    if (hit) {
      const full = await call<{ text?: string; html?: string[] }>(`/messages/${hit.id}`, {
        token: mailbox.token,
      });
      if (full) return full.text ?? full.html?.join("\n") ?? "";
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  return null;
}

/** First absolute link in a message body — the invite or reset URL. */
export function linkIn(body: string, path: string): string | null {
  return body.match(new RegExp(`https?://\\S*${path}\\S*`))?.[0]?.replace(/[.,)\\]]+$/, "") ?? null;
}
