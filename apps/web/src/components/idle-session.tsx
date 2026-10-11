"use client";

import { IDLE_WARNING_AFTER_SECONDS, SESSION_MAX_AGE_SECONDS } from "@pharmachain/auth";
import { Button } from "@pharmachain/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@pharmachain/ui/components/dialog";
import { signOut } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { loginUrlFor } from "@/lib/callback-url";

const KEEPALIVE_INTERVAL_MS = 5 * 60 * 1000;
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"] as const;
/** Last activity in ANY tab of this browser, shared through localStorage. */
const SHARED_ACTIVITY_KEY = "pc:last-activity";
const SHARE_EVERY_MS = 15_000;

function readSharedActivity(): number {
  try {
    return Number(window.localStorage.getItem(SHARED_ACTIVITY_KEY)) || 0;
  } catch {
    return 0; // storage blocked (private mode, policy): this tab decides alone
  }
}

function shareActivity(at: number): void {
  try {
    window.localStorage.setItem(SHARED_ACTIVITY_KEY, String(at));
  } catch {
    // storage blocked — harmless, see readSharedActivity
  }
}

/** Sign out, then come back to this page after signing in again. */
function signOutHere(): void {
  void signOut({
    callbackUrl: loginUrlFor(`${window.location.pathname}${window.location.search}`),
  });
}

/**
 * 30-minute idle timeout with a warning at 25 minutes (US-205).
 * The keepalive ping refreshes the rolling JWT cookie only while the user is
 * actually active — an idle tab lets the session expire naturally.
 *
 * Idleness is judged across every tab of the browser: the session cookie is
 * shared, so a forgotten background tab used to sign the user out of the tab
 * they were working in. Activity anywhere now counts everywhere.
 */
export function IdleSession() {
  const lastActivity = useRef(Date.now());
  const lastShared = useRef(0);
  const lastKeepalive = useRef(Date.now());
  const [warning, setWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const keepalive = useCallback(() => {
    lastKeepalive.current = Date.now();
    // Auth.js session route refreshes the cookie when updateAge has passed
    fetch("/api/auth/session").catch(() => undefined);
  }, []);

  const markActive = useCallback(() => {
    const now = Date.now();
    lastActivity.current = now;
    if (now - lastShared.current >= SHARE_EVERY_MS) {
      lastShared.current = now;
      shareActivity(now);
    }
  }, []);

  useEffect(() => {
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, markActive, { passive: true });
    }
    markActive();

    const tick = setInterval(() => {
      const last = Math.max(lastActivity.current, readSharedActivity());
      const idleSeconds = Math.floor((Date.now() - last) / 1000);

      if (idleSeconds >= SESSION_MAX_AGE_SECONDS) {
        signOutHere();
        return;
      }
      if (idleSeconds >= IDLE_WARNING_AFTER_SECONDS) {
        setWarning(true);
        setSecondsLeft(SESSION_MAX_AGE_SECONDS - idleSeconds);
      } else {
        setWarning(false);
        // Active user → keep the rolling session alive
        if (Date.now() - lastKeepalive.current >= KEEPALIVE_INTERVAL_MS) {
          keepalive();
        }
      }
    }, 5_000);

    return () => {
      clearInterval(tick);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, markActive);
      }
    };
  }, [keepalive, markActive]);

  return (
    <Dialog open={warning}>
      <DialogContent className="sm:max-w-sm" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Still there?</DialogTitle>
          <DialogDescription>
            For security you'll be signed out in about {Math.max(0, Math.ceil(secondsLeft / 60))}{" "}
            minute(s) of further inactivity.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => signOutHere()}>
            Sign out now
          </Button>
          <Button
            onClick={() => {
              lastShared.current = 0; // share immediately: other tabs stand down too
              markActive();
              setWarning(false);
              keepalive();
            }}
          >
            Stay signed in
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
