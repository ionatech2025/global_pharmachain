"use client";

import type { DocumentKind } from "@pharmachain/core";
import { api } from "@/lib/api/browser";

export interface UploadLinks {
  listingId?: string;
  rfqId?: string;
  quotationId?: string;
  orderId?: string;
}

interface UploadRequested {
  document: { id: string; kind: string; fileName: string };
  upload: { url: string; headers: Record<string, string>; expiresIn: number };
}

/**
 * Browser upload flow: request a presigned URL → PUT the file straight to
 * object storage → confirm completion (triggers the scan stub + versioning).
 */
export async function uploadDocument(args: {
  file: File;
  kind: DocumentKind;
  expiresAt?: string;
  replacesDocumentId?: string;
  links?: UploadLinks;
}): Promise<{ id: string; fileName: string }> {
  const { file, kind, expiresAt, replacesDocumentId, links } = args;
  const requested = await api.post<UploadRequested>("/documents/request-upload", {
    fileName: file.name,
    contentType: file.type || "application/octet-stream",
    size: file.size,
    kind,
    expiresAt,
    replacesDocumentId,
    ...links,
  });

  const put = await fetch(requested.upload.url, {
    method: "PUT",
    headers: requested.upload.headers,
    body: file,
  });
  if (!put.ok) {
    throw new Error(`Upload failed (${put.status}) — check the storage service is running`);
  }

  const completed = await api.post<{ id: string; fileName: string }>(
    `/documents/${requested.document.id}/complete`,
  );
  return { id: completed.id, fileName: completed.fileName };
}

export async function downloadDocument(documentId: string): Promise<void> {
  const { url } = await api.get<{ url: string }>(`/documents/${documentId}/download-url`);
  window.open(url, "_blank", "noopener");
}
