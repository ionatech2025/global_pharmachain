"use client";

import { Button } from "@pharmachain/ui/components/button";
import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/http";

export function ResubmitButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function resubmit() {
    setBusy(true);
    try {
      await api.post("/companies/me/verification/resubmit");
      toast.success("Documents resubmitted for verification review");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="default"
      size="sm"
      disabled={busy}
      onClick={resubmit}
      data-testid="resubmit-documents-button"
      className="gap-2"
    >
      <RotateCcw className={`size-3.5 ${busy ? "animate-spin" : ""}`} />
      {busy ? "Resubmitting…" : "Resubmit Documents"}
    </Button>
  );
}
