"use client";

import { Alert, AlertDescription, AlertTitle } from "@pharmachain/ui/components/alert";
import { Megaphone, X } from "lucide-react";
import { useEffect, useState } from "react";

export interface AnnouncementItem {
  id: string;
  title: string;
  body: string;
}

export function AnnouncementBanner({ announcements }: { announcements: AnnouncementItem[] }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("gpc_dismissed_announcements");
      if (stored) {
        setDismissed(new Set(JSON.parse(stored)));
      }
    } catch {
      // Ignore storage read failures
    }
    setMounted(true);
  }, []);

  function handleDismiss(id: string) {
    setDismissed((prev) => {
      const next = new Set(prev).add(id);
      try {
        localStorage.setItem("gpc_dismissed_announcements", JSON.stringify(Array.from(next)));
      } catch {
        // Ignore storage write failures
      }
      return next;
    });
  }

  // During SSR or before mount, don't show dismissed items if not yet read
  const visible = announcements.filter((a) => !dismissed.has(a.id));

  if (!mounted || visible.length === 0) return null;

  return (
    <div className="space-y-2">
      {visible.map((a) => (
        <Alert key={a.id} variant="info" className="relative pr-10 border-sky-500/30 bg-sky-500/10">
          <Megaphone className="size-4 text-sky-600 dark:text-sky-400" />
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-md bg-sky-600/15 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:text-sky-300 uppercase tracking-wider">
              System Announcement
            </span>
            <AlertTitle className="font-semibold text-foreground">{a.title}</AlertTitle>
          </div>
          <AlertDescription className="mt-1 text-sm text-foreground/80">{a.body}</AlertDescription>
          <button
            type="button"
            onClick={() => handleDismiss(a.id)}
            aria-label="Dismiss announcement"
            className="absolute top-3.5 right-3.5 rounded-md p-1 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
          >
            <X className="size-4" />
          </button>
        </Alert>
      ))}
    </div>
  );
}
