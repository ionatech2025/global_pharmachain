"use client";

import {
  PREFERENCE_EVENT_LABELS,
  PREFERENCE_EVENT_TYPES,
  type PreferenceEventType,
} from "@pharmachain/core";
import { Button } from "@pharmachain/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pharmachain/ui/components/card";
import { cn } from "@pharmachain/ui/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { api } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/http";
import type { NotificationRow, Paginated } from "@/lib/api/types";
import { timeAgo } from "@/lib/format";

export function NotificationList({ notifications }: { notifications: Paginated<NotificationRow> }) {
  const router = useRouter();

  async function open(notification: NotificationRow) {
    try {
      if (!notification.readAt) await api.post(`/notifications/${notification.id}/read`);
      if (notification.href) router.push(notification.href);
      else router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function markAll() {
    try {
      await api.post("/notifications/read-all");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  if (notifications.items.length === 0) {
    return <EmptyState title="No notifications" hint="Platform activity will show up here." />;
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" onClick={markAll}>
          Mark all read
        </Button>
      </div>
      <ul className="divide-y rounded-lg border">
        {notifications.items.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => open(n)}
              className={cn(
                "block w-full px-4 py-3 text-left transition-colors hover:bg-accent",
                !n.readAt && "bg-primary/5",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={cn("text-sm", !n.readAt && "font-medium")}>{n.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {timeAgo(n.createdAt)}
                </span>
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>
            </button>
          </li>
        ))}
      </ul>
      {notifications.totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Page {notifications.page} of {notifications.totalPages}
          </span>
          <div className="flex gap-2">
            {notifications.page > 1 && (
              <Link
                className="text-primary hover:underline"
                href={`/notifications?page=${notifications.page - 1}`}
              >
                Newer
              </Link>
            )}
            {notifications.page < notifications.totalPages && (
              <Link
                className="text-primary hover:underline"
                href={`/notifications?page=${notifications.page + 1}`}
              >
                Older
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface Preference {
  eventType: string;
  email: boolean;
  whatsapp: boolean;
}

export function PreferencesPanel({ initial }: { initial: Preference[] }) {
  const [prefs, setPrefs] = useState<Preference[]>(initial);
  const [busy, setBusy] = useState(false);

  function toggle(eventType: string, channel: "email" | "whatsapp") {
    setPrefs((prev) =>
      prev.map((p) => (p.eventType === eventType ? { ...p, [channel]: !p[channel] } : p)),
    );
  }

  async function save() {
    setBusy(true);
    try {
      await api.put("/notifications/preferences", { preferences: prefs });
      toast.success("Preferences saved");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Channel preferences</CardTitle>
        <CardDescription>
          In-app notifications can't be disabled. WhatsApp requires a number on your account page.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-6 gap-y-2 text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Event
          </span>
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Email
          </span>
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            WhatsApp
          </span>
          {PREFERENCE_EVENT_TYPES.map((eventType) => {
            const pref = prefs.find((p) => p.eventType === eventType);
            if (!pref) return null;
            return (
              <div key={eventType} className="contents">
                <span>{PREFERENCE_EVENT_LABELS[eventType as PreferenceEventType]}</span>
                <input
                  type="checkbox"
                  aria-label={`Email for ${eventType}`}
                  checked={pref.email}
                  onChange={() => toggle(eventType, "email")}
                />
                <input
                  type="checkbox"
                  aria-label={`WhatsApp for ${eventType}`}
                  checked={pref.whatsapp}
                  onChange={() => toggle(eventType, "whatsapp")}
                />
              </div>
            );
          })}
        </div>
        <Button size="sm" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save preferences"}
        </Button>
      </CardContent>
    </Card>
  );
}
