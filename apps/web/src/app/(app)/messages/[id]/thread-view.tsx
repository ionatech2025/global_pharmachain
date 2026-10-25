"use client";

import { ALLOWED_MIMES, MAX_MESSAGE_ATTACHMENTS, validateUpload } from "@pharmachain/core";
import { Badge } from "@pharmachain/ui/components/badge";
import { Button } from "@pharmachain/ui/components/button";
import { Textarea } from "@pharmachain/ui/components/textarea";
import { cn } from "@pharmachain/ui/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Paperclip, SendHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { DocumentChip } from "@/components/document-chip";
import { api } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/http";
import type { ThreadMessages } from "@/lib/api/types";
import { fmtDateTime } from "@/lib/format";
import { uploadDocument } from "@/lib/upload";

// SSE pushes "changed" pings for near-instant updates; the slow poll is the
// safety net when the stream can't connect (old proxies, buffering CDNs).
const FALLBACK_POLL_INTERVAL_MS = 20_000;
/** The API's window size: a full window means there may be more before it. */
const PAGE_SIZE = 200;

function entityHref(thread: ThreadMessages["thread"]): { href: string; label: string } | null {
  if (thread.order)
    return { href: `/orders/${thread.order.id}`, label: `Order ${thread.order.orderNo}` };
  if (thread.rfq) return { href: `/rfqs/${thread.rfq.id}`, label: `RFQ ${thread.rfq.refNo}` };
  if (thread.quotation) return { href: "/quotes", label: `Quotation ${thread.quotation.refNo}` };
  return null;
}

/** Polling thread view (US-601/602): immutable messages, ≤5 attachments each. */
export function ThreadView({
  threadId,
  initial,
  meUserId,
}: {
  threadId: string;
  initial: ThreadMessages;
  meUserId: string;
}) {
  const queryClient = useQueryClient();
  // True while the change feed is connected: the poll is the safety net for
  // when it is not, so the two never run together.
  const [streaming, setStreaming] = useState(false);
  const { data } = useQuery({
    queryKey: ["thread", threadId],
    queryFn: () => api.get<ThreadMessages>(`/threads/${threadId}/messages`),
    initialData: initial,
    refetchInterval: streaming ? false : FALLBACK_POLL_INTERVAL_MS,
  });
  const { thread, messages, systemEvents = [] } = data;

  // Deferred item: SSE change feed — on ping, refetch through the one query
  // path (no second payload shape, trivial dedupe). Held open only while the
  // tab is visible: every open stream keeps a function instance and a
  // database poll alive server-side, which a background tab has no use for.
  // Returning to the tab reconnects and catches up at once.
  useEffect(() => {
    let source: EventSource | null = null;
    const refetch = () => void queryClient.invalidateQueries({ queryKey: ["thread", threadId] });
    const open = () => {
      if (source) return;
      source = new EventSource(`/api/proxy/threads/${threadId}/stream`);
      source.onopen = () => setStreaming(true);
      // The browser reconnects on its own; the poll covers the gap meanwhile.
      source.onerror = () => setStreaming(false);
      source.onmessage = refetch;
    };
    const close = () => {
      source?.close();
      source = null;
      setStreaming(false);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        open();
        refetch();
      } else {
        close();
      }
    };
    if (document.visibilityState === "visible") open();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      close();
    };
  }, [threadId, queryClient]);

  // History beyond the latest window, paged in on request. Kept apart from
  // the query data, which every poll replaces with the latest window.
  const [older, setOlder] = useState<ThreadMessages["messages"]>([]);
  const [olderExhausted, setOlderExhausted] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const allMessages = useMemo(() => {
    const latest = new Set(messages.map((m) => m.id));
    return [...older.filter((m) => !latest.has(m.id)), ...messages];
  }, [older, messages]);
  const canLoadOlder = !olderExhausted && (older.length > 0 || messages.length >= PAGE_SIZE);

  async function loadOlder() {
    const oldest = allMessages[0];
    if (!oldest) return;
    setLoadingOlder(true);
    try {
      const page = await api.get<ThreadMessages>(`/threads/${threadId}/messages`, {
        query: { before: oldest.createdAt },
      });
      setOlder((prev) => [...page.messages, ...prev]);
      if (page.messages.length < PAGE_SIZE) setOlderExhausted(true);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoadingOlder(false);
    }
  }

  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastMessageId = messages.at(-1)?.id;

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when a new message lands
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [lastMessageId]);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files, ...Array.from(list)].slice(0, MAX_MESSAGE_ATTACHMENTS);
    const rejection = next
      .map((f) => validateUpload("MESSAGE_ATTACHMENT", f))
      .find((message) => message !== null);
    if (rejection) {
      toast.error(rejection);
      return;
    }
    setFiles(next);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    try {
      const attachmentDocumentIds: string[] = [];
      for (const file of files) {
        const uploaded = await uploadDocument({ file, kind: "MESSAGE_ATTACHMENT" });
        attachmentDocumentIds.push(uploaded.id);
      }
      await api.post(`/threads/${threadId}/messages`, {
        body: body.trim(),
        attachmentDocumentIds,
      });
      setBody("");
      setFiles([]);
      await queryClient.invalidateQueries({ queryKey: ["thread", threadId] });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const entity = entityHref(thread);
  const counterparty = messages.find((m) => m.sender.id !== meUserId);

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-3xl flex-col">
      <div className="flex items-center justify-between border-b pb-3">
        <div>
          <h1 className="font-semibold">
            {thread.buyerCompany.name} ↔ {thread.supplierCompany.name}
          </h1>
          <p className="text-xs text-muted-foreground">
            Messages are permanent and visible to both companies.
          </p>
        </div>
        {entity && (
          <Link href={entity.href}>
            <Badge variant="outline">{entity.label}</Badge>
          </Link>
        )}
      </div>

      <div
        className="flex-1 space-y-3 overflow-y-auto py-4"
        role="log"
        aria-live="polite"
        aria-label="Conversation message history"
      >
        {canLoadOlder && (
          <div className="flex justify-center">
            <Button variant="outline" size="sm" disabled={loadingOlder} onClick={loadOlder}>
              {loadingOlder ? "Loading…" : "Load earlier messages"}
            </Button>
          </div>
        )}
        {allMessages.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No messages yet — start the conversation below.
          </p>
        )}
        {[
          ...allMessages.map((m) => ({ kind: "message" as const, at: m.createdAt, message: m })),
          ...systemEvents.map((e) => ({ kind: "system" as const, at: e.createdAt, event: e })),
        ]
          .sort((a, b) => a.at.localeCompare(b.at))
          .map((entry) => {
            if (entry.kind === "system") {
              const e = entry.event;
              return (
                <div key={`sys-${e.id}`} className="flex justify-center">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed bg-card px-3 py-1 text-xs text-muted-foreground">
                    <span aria-hidden className="size-1.5 rounded-full bg-info" />
                    {e.status.replaceAll("_", " ").toLowerCase()}
                    {e.note ? ` — ${e.note}` : ""}
                    {" · "}
                    {fmtDateTime(e.createdAt)}
                  </span>
                </div>
              );
            }
            const message = entry.message;
            const mine = message.sender.id === meUserId;
            return (
              <div key={message.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                    mine ? "bg-primary text-primary-foreground" : "bg-muted",
                  )}
                >
                  <p
                    className={cn(
                      "mb-0.5 text-xs",
                      mine ? "text-primary-foreground/80" : "text-muted-foreground",
                    )}
                  >
                    {message.sender.name}
                    {" · "}
                    {message.senderCompanyId === thread.buyerCompany.id
                      ? thread.buyerCompany.name
                      : thread.supplierCompany.name}
                    {message.senderRole
                      ? ` · ${message.senderRole.toLowerCase().replace("_", " ")}`
                      : ""}
                    {" · "}
                    {fmtDateTime(message.createdAt)}
                  </p>
                  <p className="whitespace-pre-wrap">{message.body}</p>
                  {message.attachments.length > 0 && (
                    <div
                      className={cn(
                        "mt-1.5 space-y-0.5",
                        mine && "[&_button]:text-primary-foreground",
                      )}
                    >
                      {message.attachments.map((a) => (
                        <DocumentChip key={a.id} id={a.id} fileName={a.fileName} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="space-y-2 border-t pt-3">
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {files.map((file, i) => (
              <Badge
                key={`${file.name}-${file.size}-${file.lastModified}`}
                variant="secondary"
                className="gap-1"
              >
                {file.name}
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  className="inline-flex size-6 items-center justify-center rounded-full hover:text-destructive"
                  onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <Textarea
            rows={2}
            aria-label="Message"
            placeholder={counterparty ? `Message ${counterparty.sender.name}…` : "Write a message…"}
            value={body}
            maxLength={5000}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(e);
            }}
          />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            accept={ALLOWED_MIMES.MESSAGE_ATTACHMENT.join(",")}
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Attach files"
            disabled={files.length >= MAX_MESSAGE_ATTACHMENTS}
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="size-4" />
          </Button>
          <Button type="submit" size="icon" aria-label="Send" disabled={busy || !body.trim()}>
            <SendHorizontal className="size-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}
