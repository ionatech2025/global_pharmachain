import { notFound } from "next/navigation";
import { ApiClientError } from "@/lib/api/http";
import { apiServer, getViewer } from "@/lib/api/server";
import type { ThreadMessages } from "@/lib/api/types";
import { ThreadView } from "./thread-view";

export const metadata = { title: "Conversation" };

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const api = await apiServer();

  // getViewer() is the request-deduplicated /auth/me the layout already
  // fetched, so this costs nothing beyond the thread read it runs alongside.
  const [messagesResult, me] = await Promise.all([
    api.get<ThreadMessages>(`/threads/${id}/messages`).catch((err: unknown) => err),
    getViewer(),
  ]);
  if (messagesResult instanceof Error) {
    if (messagesResult instanceof ApiClientError && messagesResult.status === 404) notFound();
    throw messagesResult;
  }
  const initial = messagesResult as ThreadMessages;

  return <ThreadView threadId={id} initial={initial} meUserId={me.id} />;
}
