// PharmaChain service worker. Conservative strategy for a live-data,
// auth-gated app: navigations are network-first with an offline fallback,
// immutable static assets are cache-first, and the API/auth surface is never
// cached (always the network). Bump CACHE to invalidate on release.
const CACHE = "pharmachain-v2";
const PRECACHE = ["/offline.html", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API or auth — they must always hit the network.
  if (url.pathname.startsWith("/api/")) return;

  // Navigations: network-first, fall back to the offline page when offline.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline.html")));
    return;
  }

  // Content-hashed static assets: cache-first (they are immutable).
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
            return res;
          }),
      ),
    );
  }
});

// ─── Phase 4 §1: Web Push ─────────────────────────────────────────────────
// Payloads arrive aes128gcm-encrypted (RFC 8291); the browser hands us the
// decrypted JSON. Clicking focuses an existing tab or opens the deep link.
self.addEventListener("push", (event) => {
  let data = { title: "PharmaChain", body: "You have a new notification.", href: "/notifications" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    /* keep defaults */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { href: data.href },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification.data?.href || "/notifications";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          client.navigate(href);
          return client.focus();
        }
      }
      return self.clients.openWindow(href);
    }),
  );
});

// ─── Phase 4 §1: offline delivery-confirmation queue ──────────────────────
// Field submissions (proof of delivery, GPS pings) made while offline are
// queued in IndexedDB and replayed when connectivity returns — the app tags
// them with X-Offline-Queue so only idempotent capture calls participate.
const QUEUE_DB = "pc-offline-queue";
const QUEUE_STORE = "requests";

function openQueue() {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(QUEUE_DB, 1);
    open.onupgradeneeded = () =>
      open.result.createObjectStore(QUEUE_STORE, { keyPath: "id", autoIncrement: true });
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}

async function enqueueRequest(request) {
  const db = await openQueue();
  const body = await request.clone().text();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    tx.objectStore(QUEUE_STORE).add({
      url: request.url,
      method: request.method,
      body,
      queuedAt: Date.now(),
    });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function flushQueue() {
  const db = await openQueue();
  const entries = await new Promise((resolve) => {
    const tx = db.transaction(QUEUE_STORE, "readonly");
    const req = tx.objectStore(QUEUE_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
  for (const entry of entries) {
    try {
      const res = await fetch(entry.url, {
        method: entry.method,
        headers: { "content-type": "application/json" },
        body: entry.body,
        credentials: "include",
      });
      // Replayed successfully (or permanently rejected): drop from the queue.
      if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)) {
        await new Promise((resolve) => {
          const tx = db.transaction(QUEUE_STORE, "readwrite");
          tx.objectStore(QUEUE_STORE).delete(entry.id);
          tx.oncomplete = resolve;
          tx.onerror = resolve;
        });
      }
    } catch {
      break; // still offline — retry on the next sync/activation
    }
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "POST") return;
  if (!request.headers.get("X-Offline-Queue")) return;
  event.respondWith(
    fetch(request.clone()).catch(async () => {
      await enqueueRequest(request);
      return new Response(
        JSON.stringify({ queued: true, message: "Saved offline — will sync when back online" }),
        { status: 202, headers: { "content-type": "application/json" } },
      );
    }),
  );
});

self.addEventListener("sync", (event) => {
  if (event.tag === "pc-flush-queue") event.waitUntil(flushQueue());
});
self.addEventListener("message", (event) => {
  if (event.data === "flush-queue") flushQueue();
});
self.addEventListener("activate", () => {
  flushQueue();
});
