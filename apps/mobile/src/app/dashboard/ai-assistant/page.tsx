"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCheck,
  Clock3,
  Copy,
  MoreVertical,
  Plus,
  Send,
  Sparkles,
  ThumbsUp,
  X,
} from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { aiService } from "@/lib/api/services/ai.service";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * EduIgnite AI — WhatsApp-grade chat with the platform assistant.
 * - Branded: the EduIgnite logo is the assistant's avatar.
 * - Persistent: the conversation is stored on the device, so previous
 *   exchanges are still there when the app reopens.
 * - Offline-first: messages typed while offline are kept as "pending" and
 *   sent automatically the moment the connection returns — no error pages.
 */

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  ts: number;
  status?: "sent" | "pending";
  liked?: boolean;
};

const AI_AVATAR = "/icons/eduignite-icon-512.png";
const HISTORY_LIMIT = 200;

const QUICK_TOPICS = [
  { label: "My Subjects", prompt: "Help me understand my registered subjects and optional subjects." },
  { label: "My Grades", prompt: "Explain my grades and how my average is calculated." },
  { label: "Attendance", prompt: "Explain my attendance record and what I should improve." },
  { label: "Library", prompt: "How do I request a physical book or open a digital copy?" },
  { label: "Exams", prompt: "How do I view my exam results and prepare better?" },
  { label: "Subscription", prompt: "Explain my current subscription or school fee status." },
  { label: "Live Classes", prompt: "How do live classes work from the student dashboard?" },
];

const timeOfDay = (ts: number) =>
  new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const dayLabel = (ts: number) => {
  const date = new Date(ts);
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return date.toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" });
};

const isNetworkError = (error: any) => !error?.response;

const welcomeMessage = (name?: string): ChatMessage => ({
  id: `welcome_${Date.now()}`,
  role: "assistant",
  content: `Hi${name ? ` ${name.split(" ")[0]}` : ""}! I'm your EduIgnite assistant. Ask me about your courses, grades, attendance, messaging, fees, or how to use your tools.`,
  ts: Date.now(),
  status: "sent",
});

export default function AiAssistantPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const isReplyingRef = useRef(false);

  const storageKey = `eduignite_ai_history_${user?.id || "anon"}`;
  const bannerKey = "eduignite_ai_banner_dismissed";

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [showTopics, setShowTopics] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  // Load the saved conversation (previous chats stay visible).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      const saved: ChatMessage[] = raw ? JSON.parse(raw) : [];
      setMessages(saved.length ? saved : [welcomeMessage(user?.name)]);
      setShowBanner(window.localStorage.getItem(bannerKey) !== "1");
    } catch {
      setMessages([welcomeMessage(user?.name)]);
    }
    setIsOnline(window.navigator.onLine);
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Persist on every change.
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(messages.slice(-HISTORY_LIMIT)));
    } catch {
      /* storage full — keep chatting in memory */
    }
  }, [messages, hydrated, storageKey]);

  const scrollToBottom = () => {
    window.setTimeout(() => {
      if (chatScrollRef.current) {
        chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
      }
    }, 80);
  };

  useEffect(() => {
    if (hydrated) scrollToBottom();
  }, [hydrated]);

  const requestReply = useCallback(
    async (history: ChatMessage[], userMessageId: string) => {
      if (isReplyingRef.current) return;
      isReplyingRef.current = true;
      setIsTyping(true);
      try {
        const context = history
          .filter((m) => m.status !== "pending" || m.id === userMessageId)
          .slice(-10)
          .map((m) => ({ role: m.role, content: m.content }));
        const target = history.find((m) => m.id === userMessageId);
        const response = await aiService.directChat(target?.content || "", context);
        setMessages((prev) => [
          ...prev.map((m) => (m.id === userMessageId ? { ...m, status: "sent" as const } : m)),
          { id: `ai_${Date.now()}`, role: "assistant", content: response.reply, ts: Date.now(), status: "sent" },
        ]);
        scrollToBottom();
      } catch (error: any) {
        if (isNetworkError(error)) {
          // Offline: keep the message pending — it will auto-send later.
          setIsOnline(false);
        } else {
          setMessages((prev) => [
            ...prev.map((m) => (m.id === userMessageId ? { ...m, status: "sent" as const } : m)),
            {
              id: `ai_${Date.now()}`,
              role: "assistant",
              content: "I could not process that request right now. Please try again in a moment.",
              ts: Date.now(),
              status: "sent",
            },
          ]);
        }
      } finally {
        setIsTyping(false);
        isReplyingRef.current = false;
      }
    },
    []
  );

  // Flush pending messages when the connection returns (and every 20s as a
  // safety net) — WhatsApp-style auto send.
  useEffect(() => {
    const flush = () => {
      setIsOnline(window.navigator.onLine);
      if (!window.navigator.onLine || isReplyingRef.current) return;
      setMessages((prev) => {
        const pending = prev.find((m) => m.role === "user" && m.status === "pending");
        if (pending) {
          void requestReply(prev, pending.id);
        }
        return prev;
      });
    };
    window.addEventListener("online", flush);
    window.addEventListener("offline", () => setIsOnline(false));
    const interval = window.setInterval(flush, 20000);
    return () => {
      window.removeEventListener("online", flush);
      window.clearInterval(interval);
    };
  }, [requestReply]);

  const sendMessage = useCallback(
    (text: string) => {
      const content = text.trim();
      if (!content || isTyping) return;

      const userMessage: ChatMessage = {
        id: `u_${Date.now()}`,
        role: "user",
        content,
        ts: Date.now(),
        status: window.navigator.onLine ? "sent" : "pending",
      };
      const next = [...messages, userMessage];
      setMessages(next);
      setChatInput("");
      setShowTopics(false);
      scrollToBottom();

      if (window.navigator.onLine) {
        void requestReply(next, userMessage.id);
      } else {
        setIsOnline(false);
      }
    },
    [messages, isTyping, requestReply]
  );

  const handleCopy = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      toast({ title: "Copied", description: "The reply was copied to your clipboard." });
    } catch {
      toast({ variant: "destructive", title: "Copy failed" });
    }
  };

  const handleHelpful = (id: string) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, liked: !m.liked } : m)));
  };

  const handleNewConversation = () => {
    setMessages([welcomeMessage(user?.name)]);
    toast({ title: "New conversation started" });
  };

  const dismissBanner = () => {
    setShowBanner(false);
    try {
      window.localStorage.setItem(bannerKey, "1");
    } catch {
      /* non-fatal */
    }
  };

  const renderContent = (text: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, index) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={index}>{part.slice(2, -2)}</strong>
      ) : (
        <span key={index}>{part}</span>
      )
    );
  };

  const handleBack = () => {
    if (window.history.length > 1) router.back();
    else router.push("/dashboard/workspace");
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#f6f4fb]">
      {/* header — per the design: back, logo, name, online, menu */}
      <div
        className="flex items-center gap-2 border-b border-border/60 bg-white px-2 py-2"
        style={{ paddingTop: "max(env(safe-area-inset-top, 0px), 10px)" }}
      >
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={handleBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Avatar className="h-10 w-10 shrink-0 border border-primary/15 bg-white">
          <AvatarImage src={AI_AVATAR} className="object-contain p-0.5" />
          <AvatarFallback className="bg-primary/10 font-black text-primary">AI</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-black leading-tight text-foreground">EduIgnite</p>
          <p className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
            <span className={cn("inline-block h-2 w-2 rounded-full", isOnline ? "bg-emerald-500" : "bg-amber-400")} />
            {isOnline ? "Online" : "Offline — messages will send automatically"}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0">
              <MoreVertical className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="rounded-2xl">
            <DropdownMenuItem onClick={handleNewConversation} className="font-semibold">
              New conversation
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleNewConversation} className="font-semibold text-red-500">
              Clear history
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* messages */}
      <div ref={chatScrollRef} className="flex-1 overflow-y-auto px-3 py-3">
        {showBanner && (
          <div className="mb-3 flex items-start gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-primary/10">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-black text-foreground">Hi! I&apos;m EduIgnite AI.</p>
              <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                Your study buddy. Ask me anything about topics, homework or exam prep.
              </p>
            </div>
            <button onClick={dismissBanner} aria-label="Dismiss" className="shrink-0 p-1 text-muted-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="space-y-2">
          {messages.map((message, index) => {
            const isOwn = message.role === "user";
            const previous = messages[index - 1];
            const showDay =
              !previous || new Date(previous.ts).toDateString() !== new Date(message.ts).toDateString();
            const showAvatar = !isOwn && (!previous || previous.role !== "assistant" || showDay);
            return (
              <div key={message.id}>
                {showDay && (
                  <div className="my-3 flex justify-center">
                    <span className="rounded-lg bg-white px-3 py-1 text-[11px] font-bold text-muted-foreground shadow-sm">
                      {dayLabel(message.ts)}
                    </span>
                  </div>
                )}

                {isOwn ? (
                  <div className="flex flex-col items-end">
                    <div className="max-w-[84%] rounded-2xl rounded-br-md bg-primary/10 px-3.5 py-2.5 ring-1 ring-primary/10">
                      <p className="whitespace-pre-wrap break-words text-[14.5px] leading-[1.45] text-foreground">
                        {message.content}
                      </p>
                    </div>
                    <span className="mt-1 flex items-center gap-1 pr-1 text-[10.5px] text-muted-foreground">
                      {timeOfDay(message.ts)}
                      {message.status === "pending" ? (
                        <Clock3 className="h-3 w-3" />
                      ) : (
                        <CheckCheck className="h-3.5 w-3.5 text-primary" />
                      )}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <Avatar className={cn("mt-1 h-8 w-8 shrink-0 border border-primary/10 bg-white", !showAvatar && "invisible")}>
                      <AvatarImage src={AI_AVATAR} className="object-contain p-0.5" />
                      <AvatarFallback className="text-[10px] font-black text-primary">AI</AvatarFallback>
                    </Avatar>
                    <div className="flex max-w-[84%] flex-col items-start">
                      <div className="rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 shadow-sm ring-1 ring-black/[0.04]">
                        <p className="whitespace-pre-wrap break-words text-[14.5px] leading-[1.5] text-foreground">
                          {renderContent(message.content)}
                        </p>
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          <button
                            onClick={() => handleHelpful(message.id)}
                            className={cn(
                              "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11.5px] font-bold transition-colors",
                              message.liked
                                ? "border-primary bg-primary text-white"
                                : "border-primary/30 text-primary"
                            )}
                          >
                            <ThumbsUp className="h-3 w-3" />
                            Helpful
                          </button>
                          <button
                            onClick={() => handleCopy(message.content)}
                            className="flex items-center gap-1.5 rounded-lg border border-primary/30 px-2.5 py-1 text-[11.5px] font-bold text-primary"
                          >
                            <Copy className="h-3 w-3" />
                            Copy
                          </button>
                        </div>
                      </div>
                      <span className="mt-1 pl-1 text-[10.5px] text-muted-foreground">
                        {timeOfDay(message.ts)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {isTyping ? (
            <div className="flex items-start gap-2">
              <Avatar className="mt-1 h-8 w-8 shrink-0 border border-primary/10 bg-white">
                <AvatarImage src={AI_AVATAR} className="object-contain p-0.5" />
                <AvatarFallback className="text-[10px] font-black text-primary">AI</AvatarFallback>
              </Avatar>
              <div className="rounded-2xl rounded-bl-md bg-white px-4 py-3 shadow-sm">
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/40 [animation-delay:0ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/40 [animation-delay:120ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/40 [animation-delay:240ms]" />
                </span>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* composer */}
      <div
        className="shrink-0 border-t border-border/60 bg-white px-2 pb-2 pt-1.5"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 8px)" }}
      >
        {showTopics && (
          <div className="-mx-1 mb-1.5 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
            {QUICK_TOPICS.map((topic) => (
              <button
                key={topic.label}
                onClick={() => sendMessage(topic.prompt)}
                disabled={isTyping}
                className="shrink-0 rounded-full bg-primary/5 px-3 py-1.5 text-[11.5px] font-bold text-primary ring-1 ring-primary/15"
              >
                {topic.label}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-1.5">
          <button
            onClick={() => setShowTopics((v) => !v)}
            aria-label="Quick topics"
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-all",
              showTopics ? "rotate-45 bg-primary/10 text-primary" : "bg-accent/60 text-muted-foreground"
            )}
          >
            <Plus className="h-5 w-5" />
          </button>
          <div className="flex min-h-11 flex-1 items-center rounded-full bg-accent/50 px-4 ring-1 ring-black/[0.04]">
            <Input
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  sendMessage(chatInput);
                }
              }}
              placeholder="Type a message..."
              className="h-10 flex-1 border-none bg-transparent px-0 text-[15px] shadow-none focus-visible:ring-0"
            />
          </div>
          <Button
            className="h-11 w-11 shrink-0 rounded-full bg-primary text-white shadow-lg"
            size="icon"
            onClick={() => sendMessage(chatInput)}
            disabled={!chatInput.trim() || isTyping}
            aria-label="Send"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
