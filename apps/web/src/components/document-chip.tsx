"use client";

import { FileText } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api/http";
import { downloadDocument } from "@/lib/upload";

/** Clickable file chip — fetches a short-lived signed URL and opens it. */
export function DocumentChip({ id, fileName }: { id: string; fileName: string }) {
  return (
    <button
      type="button"
      onClick={() => downloadDocument(id).catch((err) => toast.error(errorMessage(err)))}
      className="flex items-center gap-1.5 text-sm text-primary hover:underline"
    >
      <FileText className="size-3.5" />
      {fileName}
    </button>
  );
}
