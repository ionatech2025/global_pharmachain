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
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/http";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      // The API answers the same for registered and unregistered addresses on
      // purpose (account enumeration) — never branch on whether one existed.
      const res = await api.post<{ ok: boolean; message: string }>("/auth/password/forgot", {
        email,
      });
      setMessage(res.message);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>Reset your password</h1>
        </CardTitle>
        <CardDescription>
          {message ??
            "Enter your work email and, if it belongs to an active account, we'll send a reset link."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {message ? (
          <div className="grid gap-3">
            <p role="status" className="text-sm text-muted-foreground">
              Check your inbox (and spam folder). Wrong address?{" "}
              <button
                type="button"
                className="text-primary underline"
                onClick={() => setMessage(null)}
              >
                Try another email
              </button>
              .
            </p>
            <Button asChild variant="outline" className="w-full">
              <Link href="/login">Back to sign in</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Work email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? "Sending…" : "Send reset link"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
