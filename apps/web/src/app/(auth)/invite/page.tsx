"use client";

import type { AuthenticatedUser } from "@pharmachain/auth";
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
import { PasswordInput } from "@pharmachain/ui/components/password-input";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api/browser";
import { ApiClientError, errorMessage } from "@/lib/api/http";

/** Terminal state for a link that can never work: says why, and offers the
 *  only route forward rather than a form that would fail again. */
function RejectedCard({ reason }: { reason: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>This invitation can’t be used</CardTitle>
        <CardDescription>{reason}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>
          Invitation links expire 72 hours after they are sent. Ask your Company Admin to send a
          fresh one — it will arrive at the same address.
        </p>
        <Button asChild variant="outline">
          <Link href="/login">Back to sign in</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function InviteForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [rejection, setRejection] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const user = await api.post<AuthenticatedUser>("/auth/invites/accept", {
        token,
        name,
        password,
      });
      // Freshly set credentials — sign straight in
      await signIn("credentials", { email: user.email, password, redirect: false });
      toast.success("Welcome to PharmaChain");
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      // US-201: an expired or revoked link is a dead end, not a retry. It used
      // to be reported in a toast that faded while the form sat there looking
      // usable, so the reason never reached the person holding the link —
      // which is how "link rejected with an expiry message" went unconfirmed
      // in QA. Keep the refusal on the page and take the form away.
      if (err instanceof ApiClientError && (err.status === 403 || err.status === 409)) {
        setRejection(err.message);
      } else {
        toast.error(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <RejectedCard reason="The link is missing its token. Ask your Company Admin to send a new invitation (links expire after 72 hours)." />
    );
  }

  if (rejection) return <RejectedCard reason={rejection} />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Accept your invitation</CardTitle>
        <CardDescription>Set up your account to join your company on PharmaChain.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Full name</Label>
            <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Choose a password</Label>
            <PasswordInput
              id="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              At least 8 characters with a letter and a number.
            </p>
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? "Joining…" : "Join company"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function InvitePage() {
  return (
    <Suspense>
      <InviteForm />
    </Suspense>
  );
}
