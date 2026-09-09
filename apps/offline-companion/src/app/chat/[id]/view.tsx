"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Send } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { chatService } from "@/lib/api/services/chat.service";
import { getApiErrorMessage } from "@/lib/api/errors";
import type { ChatMessage, ConversationDetail } from "@/lib/api/types";

/**
 * Minimal conversation thread — no websockets, no typing indicators, no
 * attachments/reactions (unlike apps/mobile's full chat UI). Loads the
 * conversation's 20 most recent messages, lets the user send a reply, and
 * refetches. Good enough for "message EduIgnite about a licensing issue."
 */
export default function ChatConversationPage() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const conversationId = params?.id;

  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/login/");
    }
  }, [authLoading, isAuthenticated, router]);

  const load = useCallback(async () => {
    if (!conversationId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await chatService.getConversation(conversationId);
      setConversation(data);
      chatService.markRead(conversationId).catch(() => {});
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not load this conversation."));
    } finally {
      setIsLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    if (isAuthenticated && conversationId) load();
  }, [isAuthenticated, conversationId, load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation?.recent_messages?.length]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || !conversationId) return;
    setIsSending(true);
    setError(null);
    try {
      await chatService.sendMessage(conversationId, draft.trim());
      setDraft("");
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not send your message."));
    } finally {
      setIsSending(false);
    }
  };

  if (authLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const messages: ChatMessage[] = conversation
    ? [...conversation.recent_messages].sort((a, b) => a.created_at.localeCompare(b.created_at))
    : [];

  return (
    <main className="flex min-h-screen flex-col bg-background px-6 py-10">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col space-y-4">
        <div>
          <Link href="/chat/" className="inline-flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-primary">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Contacts
          </Link>
          <h1 className="mt-2 text-xl font-black text-primary">{conversation?.name || "Conversation"}</h1>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto rounded-2xl bg-white p-4 shadow-xl" style={{ minHeight: "50vh" }}>
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : messages.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">No messages yet. Say hello.</p>
          ) : (
            messages.map((msg) => {
              const isMine = msg.sender_id === user?.id;
              return (
                <div key={msg.id} className={"flex " + (isMine ? "justify-end" : "justify-start")}>
                  <div
                    className={
                      "max-w-[80%] rounded-2xl px-4 py-2 text-sm " +
                      (isMine ? "bg-primary text-white" : "bg-gray-100 text-gray-700")
                    }
                  >
                    {!isMine ? <p className="mb-0.5 text-xs font-bold opacity-70">{msg.sender_name}</p> : null}
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <form onSubmit={handleSend} className="flex items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a message..."
            className="h-12 flex-1 rounded-xl border border-gray-300 px-4 text-sm outline-none"
          />
          <button
            type="submit"
            disabled={isSending || !draft.trim()}
            aria-label="Send"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-white shadow-md transition hover:bg-primary-dark disabled:opacity-60"
          >
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </form>
      </div>
    </main>
  );
}
