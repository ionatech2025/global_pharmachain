"use client";

import { Button } from "@pharmachain/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pharmachain/ui/components/card";
import { Input } from "@pharmachain/ui/components/input";
import { Label } from "@pharmachain/ui/components/label";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/http";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"password" | "otp">("password");
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function requestOtp() {
    setBusy(true);
    try {
      await api.post("/auth/otp/request", { email });
      setOtpSent(true);
      toast.success("If the account exists, a 6-digit code is on its way");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const result =
        mode === "password"
          ? await signIn("credentials", { email, password, redirect: false })
          : await signIn("otp", { email, otp, redirect: false });
      if (result?.error) {
        toast.error("Invalid email or password");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          {params.get("registered")
            ? "Registration received — sign in to upload your verification documents."
            : "Access your PharmaChain workspace."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm">
          {(["password", "otp"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1.5 transition-colors ${
                mode === m ? "bg-background font-medium shadow-sm" : "text-muted-foreground"
              }`}
            >
              {m === "password" ? "Password" : "Email code"}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email">Work email</Label>
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {mode === "password" ? (
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link href="/forgot-password" className="text-xs text-primary underline">
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="otp">6-digit code</Label>
              <div className="flex gap-2">
                <Input
                  id="otp"
                  inputMode="numeric"
                  pattern="\d{6}"
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  disabled={!otpSent}
                  required={otpSent}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={requestOtp}
                  disabled={busy || !email}
                >
                  {otpSent ? "Resend" : "Send code"}
                </Button>
              </div>
            </div>
          )}
          <Button type="submit" disabled={busy || (mode === "otp" && !otpSent)}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          New to PharmaChain?{" "}
          <Link href="/register" className="text-primary underline">
            Register your company
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
