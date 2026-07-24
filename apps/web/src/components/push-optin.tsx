"use client";

import { Button } from "@pharmachain/ui/components/button";
import { BellRing } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/http";

function base64UrlToUint8Array(value: string): Uint8Array {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob((value + padding).replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Device push notifications (Phase 4 §1): wired to the notification engine
 *  and the same preference matrix as every other channel. */
export function PushOptIn() {
  const [state, setState] = useState<"unsupported" | "off" | "on" | "unavailable">("unsupported");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    void (async () => {
      const { publicKey } = await api
        .get<{ publicKey: string | null }>("/push/vapid-key")
        .catch(() => ({ publicKey: null }));
      if (!publicKey) {
        setState("unavailable");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      setState(existing ? "on" : "off");
    })();
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const { publicKey } = await api.get<{ publicKey: string | null }>("/push/vapid-key");
      if (!publicKey) throw new Error("Push is not configured on this deployment");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error("Notifications were blocked by the browser");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(publicKey).slice().buffer as ArrayBuffer,
      });
      const json = subscription.toJSON();
      await api.post("/push/subscriptions", {
        endpoint: subscription.endpoint,
        keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
      });
      setState("on");
      toast.success("Push notifications enabled on this device");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await api
          .post("/push/subscriptions/remove", { endpoint: subscription.endpoint })
          .catch(() => {});
        await subscription.unsubscribe();
      }
      setState("off");
      toast.success("Push disabled on this device");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (state === "unsupported") return null;
  if (state === "unavailable") {
    return (
      <p className="text-xs text-muted-foreground">
        Device push is not configured on this deployment.
      </p>
    );
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant={state === "on" ? "outline" : "default"}
        disabled={busy}
        onClick={state === "on" ? disable : enable}
      >
        <BellRing className="size-4" />
        {state === "on" ? "Disable push on this device" : "Enable push on this device"}
      </Button>
      {state === "off" && (
        <p className="max-w-64 text-right text-[11px] text-muted-foreground">
          Your browser will ask for permission. On iPhone, install the app first (Share → Add to
          Home Screen).
        </p>
      )}
    </div>
  );
}
