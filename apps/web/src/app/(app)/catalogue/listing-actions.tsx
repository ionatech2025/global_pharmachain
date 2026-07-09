"use client";

import { Button } from "@pharmachain/ui/components/button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/http";

export function ListingRowActions({
  listingId,
  status,
  kind,
}: {
  listingId: string;
  status: "DRAFT" | "PUBLISHED" | "DEACTIVATED";
  kind: "RAW_MATERIAL" | "FINISHED_PRODUCT";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run(action: "publish" | "deactivate" | "reactivate") {
    setBusy(true);
    try {
      await api.post(`/catalogue/${listingId}/${action}`);
      toast.success(`Listing ${action === "publish" ? "published" : `${action}d`}`);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex justify-end gap-1">
      {kind === "FINISHED_PRODUCT" && (
        <Button asChild size="sm" variant="ghost">
          <Link href={`/catalogue/${listingId}/bom`}>BOM</Link>
        </Button>
      )}
      {status === "DRAFT" && (
        <Button size="sm" onClick={() => run("publish")} disabled={busy}>
          Publish
        </Button>
      )}
      {status === "PUBLISHED" && (
        <Button size="sm" variant="outline" onClick={() => run("deactivate")} disabled={busy}>
          Deactivate
        </Button>
      )}
      {status === "DEACTIVATED" && (
        <Button size="sm" variant="outline" onClick={() => run("reactivate")} disabled={busy}>
          Reactivate
        </Button>
      )}
    </div>
  );
}
