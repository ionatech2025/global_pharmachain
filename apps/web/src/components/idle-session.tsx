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

const KEEPALIVE_INTERVAL_MS = 5 * 60 * 1000;
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"] as const;

/**
 * 30-minute idle timeout with a warning at 25 minutes (US-205).
 * The keepalive ping refreshes the rolling JWT cookie only while the user is
 * actually active — an idle tab lets the session expire naturally.
 */
export function IdleSession() {
  const lastActivity = useRef(Date.now());
  const lastKeepalive = useRef(Date.now());
  const [warning, setWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const keepalive = useCallback(() => {
    lastKeepalive.current = Date.now();
    // Auth.js session route refreshes the cookie when updateAge has passed
    fetch("/api/auth/session").catch(() => undefined);
  }, []);

  useEffect(() => {
    const onActivity = () => {
      lastActivity.current = Date.now();
    };
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true });
    }

    const tick = setInterval(() => {
      const idleMs = Date.now() - lastActivity.current;
      const idleSeconds = Math.floor(idleMs / 1000);

      if (idleSeconds >= SESSION_MAX_AGE_SECONDS) {
        signOut({ callbackUrl: "/login" });
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
        window.removeEventListener(event, onActivity);
      }
    };
  }, [keepalive]);

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
          <Button variant="outline" onClick={() => signOut({ callbackUrl: "/login" })}>
            Sign out now
          </Button>
          <Button
            onClick={() => {
              lastActivity.current = Date.now();
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
