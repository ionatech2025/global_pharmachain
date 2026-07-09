import type { AuthenticatedUser } from "@pharmachain/auth";
import { notFound } from "next/navigation";
import { ApiClientError } from "@/lib/api/http";
import { apiServer } from "@/lib/api/server";
import type { ThreadMessages } from "@/lib/api/types";
import { ThreadView } from "./thread-view";

export const metadata = { title: "Conversation" };

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const api = await apiServer();

  let initial: ThreadMessages;
  try {
    initial = await api.get<ThreadMessages>(`/threads/${id}/messages`);
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 404) notFound();
    throw err;
  }
  const me = await api.get<AuthenticatedUser>("/auth/me");

  return <ThreadView threadId={id} initial={initial} meUserId={me.id} />;
}
