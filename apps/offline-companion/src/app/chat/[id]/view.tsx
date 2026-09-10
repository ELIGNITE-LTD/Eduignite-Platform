"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, MessageCircle, Send } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { chatService } from "@/lib/api/services/chat.service";
import { getApiErrorMessage } from "@/lib/api/errors";
import type { ChatMessage, ConversationDetail } from "@/lib/api/types";
import { AppHeader } from "@/components/app-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/**
 * A dedicated support-messaging thread (spec section 6) — no websockets, no
 * typing indicators, no attachments/reactions (unlike apps/mobile's full
 * chat UI). Loads the conversation's most recent messages, lets the user
 * send a reply, and refetches. Good enough for "message EduIgnite about a
 * licensing issue" while feeling like a modern support chat: clear
 * incoming/outgoing bubble distinction, per-message timestamps, and
 * loading/empty states via the shared design system.
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
        <AppHeader title={conversation?.name || "Conversation"} backHref="/chat/" backLabel="Back to Contacts" />

        <div className="flex-1 space-y-3 overflow-y-auto rounded-2xl bg-white p-4 shadow-sm" style={{ minHeight: "50vh" }}>
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <EmptyState icon={MessageCircle} title="No messages yet" description="Say hello to get things started." />
            </div>
          ) : (
            messages.map((msg) => {
              const isMine = msg.sender_id === user?.id;
              return (
                <div key={msg.id} className={cn("flex", isMine ? "justify-end" : "justify-start")}>
                  <div className="max-w-[80%]">
                    <div
                      className={cn(
                        "rounded-2xl px-4 py-2 text-sm shadow-sm",
                        isMine ? "bg-primary text-white" : "bg-gray-100 text-gray-700"
                      )}
                    >
                      {!isMine ? <p className="mb-0.5 text-xs font-bold opacity-70">{msg.sender_name}</p> : null}
                      <p className="whitespace-pre-wrap">{msg.text}</p>
                    </div>
                    <p className={cn("mt-1 text-[10px] text-gray-400", isMine ? "text-right" : "text-left")}>
                      {formatTime(msg.created_at)}
                    </p>
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
          <Button type="submit" size="icon" disabled={isSending || !draft.trim()} isLoading={isSending} aria-label="Send">
            {!isSending ? <Send className="h-4 w-4" /> : null}
          </Button>
        </form>
      </div>
    </main>
  );
}
