"use client";

import { Eye, EyeOff } from "lucide-react";
import * as React from "react";
import { cn } from "../lib/utils";
import { Input } from "./input";

/**
 * Password field with a show/hide toggle — the one password control in the
 * app, so sign-in, registration, invite acceptance, reset and change-password
 * all behave identically.
 *
 * The toggle is a real <button type="button"> so it never submits the form it
 * sits in, and it is `tabIndex={-1}`: reaching it with Tab would land between
 * the password field and the submit button on every sign-in, which is worse
 * for keyboard users than the mouse/AT affordance it provides. Screen readers
 * still reach it in browse mode, and aria-pressed reports the current state.
 */
function PasswordInput({ className, ...props }: Omit<React.ComponentProps<typeof Input>, "type">) {
  const [visible, setVisible] = React.useState(false);
  const Icon = visible ? EyeOff : Eye;

  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        // Room for the toggle so a long password never runs under the icon.
        className={cn("pr-10", className)}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        disabled={props.disabled}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground disabled:pointer-events-none disabled:opacity-50"
      >
        <Icon className="size-4" aria-hidden />
      </button>
    </div>
  );
}

export { PasswordInput };
