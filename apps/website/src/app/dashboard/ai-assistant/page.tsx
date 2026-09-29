"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, BookOpen, Send, FileDown, Copy, Check, Zap } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { aiService, type ChatQuota } from "@/lib/api/services/ai.service";
import { getApiErrorMessage } from "@/lib/api/errors";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { AiAnswer } from "@/components/ai/ai-answer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { downloadAnswerPdf } from "@/lib/ai-pdf";
import Link from "next/link";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  ts: number;
};

const QUICK_TOPICS = [
  { label: "My Subjects", prompt: "Help me understand my registered subjects and optional subjects." },
  { label: "My Grades", prompt: "Explain my grades and how my average is calculated." },
  { label: "Attendance", prompt: "Explain my attendance record and what I should improve." },
  { label: "Library", prompt: "How do I request a physical book or open a digital copy?" },
  { label: "Exams", prompt: "How do I view my exam results and prepare better?" },
  { label: "Subscription", prompt: "Explain my current subscription or school fee status." },
  { label: "Chat", prompt: "Who can I contact from my account and how does student messaging work?" },
  { label: "Live Classes", prompt: "How do live classes work from the student dashboard?" },
];

export default function AiAssistantPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const chatScrollRef = useRef<HTMLDivElement>(null);
  // Each rendered answer, so its own PDF can be made from what is on screen.
  const answerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  // The day's allowance, read on arrival so it is on screen before the first
  // question rather than at the moment someone is turned away.
  const [quota, setQuota] = useState<ChatQuota | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: `Hi${user?.name ? ` ${user.name.split(" ")[0]}` : ""}! I'm your EduIgnite assistant. Ask me about your courses, grades, attendance, messaging, fees, or how to use your student tools.`,
      ts: Date.now(),
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  const conversationHistory = useMemo(
    () => chatMessages.slice(-10).map((entry) => ({ role: entry.role, content: entry.content })),
    [chatMessages]
  );
  const quickRoutes = useMemo(() => {
    const routes = [
      { label: "Career Orientation", href: "/dashboard/career-orientation" },
      { label: "Skill Gap Analysis", href: "/dashboard/grades/skill-gap" },
    ];
    if (["TEACHER", "SCHOOL_ADMIN", "SUB_ADMIN"].includes(user?.role || "")) {
      routes.push({ label: "Generate Exam (AI)", href: "/dashboard/exams/ai-generator" });
    }
    return routes;
  }, [user?.role]);

  useEffect(() => {
    let cancelled = false;
    aiService
      .getChatQuota()
      .then((value) => {
        if (!cancelled) setQuota(value);
      })
      .catch(() => {
        /* The allowance is shown when it can be read; never block the chat. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const scrollToBottom = () => {
    window.setTimeout(() => {
      if (chatScrollRef.current) {
        chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
      }
    }, 80);
  };

  const sendMessage = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || isTyping) {
        return;
      }

      const nextMessages = [...chatMessages, { role: "user" as const, content: message, ts: Date.now() }];
      setChatMessages(nextMessages);
      setChatInput("");
      setIsTyping(true);
      scrollToBottom();

      try {
        const response = await aiService.directChat(
          message,
          nextMessages.slice(-10).map((entry) => ({ role: entry.role, content: entry.content }))
        );
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant", content: response.reply, ts: Date.now() },
        ]);
        if (response.quota) setQuota(response.quota);
      } catch (error: any) {
        // Out of questions for today: say so where the answer would have been,
        // rather than as a toast that disappears.
        const spent = error?.response?.data;
        if (error?.response?.status === 429 && spent?.code === "ai_quota_exhausted") {
          if (spent.quota) setQuota(spent.quota);
          setChatInput(message);
          setIsTyping(false);
          return;
        }
        toast({
          variant: "destructive",
          title: "Assistant unavailable",
          description: getApiErrorMessage(error, "The assistant could not respond right now. Please try again shortly."),
        });
        setChatMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "I could not process that request right now. Please try again in a moment.",
            ts: Date.now(),
          },
        ]);
      } finally {
        setIsTyping(false);
        scrollToBottom();
      }
    },
    [chatMessages, isTyping, toast]
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(chatInput);
    }
  };

  // The question that produced a given answer, for the document it saves to.
  const questionFor = useCallback(
    (index: number) => {
      for (let i = index - 1; i >= 0; i -= 1) {
        if (chatMessages[i].role === "user") return chatMessages[i].content;
      }
      return "EduIgnite AI Assistant";
    },
    [chatMessages],
  );

  const savePdf = useCallback(
    async (index: number) => {
      const node = answerRefs.current[index];
      if (!node) return;
      setSavingIndex(index);
      try {
        const name = await downloadAnswerPdf({
          node,
          question: questionFor(index),
          askedBy: user?.name,
          schoolName: user?.school?.name,
        });
        toast({ title: "Saved", description: name });
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Could not save the PDF",
          description: getApiErrorMessage(error, "Please try again."),
        });
      } finally {
        setSavingIndex(null);
      }
    },
    [questionFor, toast, user?.name, user?.school?.name],
  );

  const copyAnswer = useCallback(
    async (index: number, text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopiedIndex(index);
        window.setTimeout(() => setCopiedIndex(null), 1600);
      } catch {
        toast({
          variant: "destructive",
          title: "Could not copy",
          description: "Select the text and copy it instead.",
        });
      }
    },
    [toast],
  );

  const isEmpty = chatMessages.length <= 1;

  return (
    // A full-height workspace: the page itself does not scroll, only the
    // conversation does. The question box stays where the reader left it, and
    // an answer has the whole window to be read in instead of a small panel.
    <div className="flex h-[calc(100dvh-7rem)] flex-col md:h-[calc(100dvh-8rem)]">
      <div className="flex shrink-0 items-center justify-between gap-3 pb-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="rounded-xl bg-primary p-1.5 shadow-sm">
            <Sparkles className="h-4 w-4 fill-secondary/20 text-secondary" />
          </div>
          <h1 className="truncate text-lg font-black tracking-tight text-primary">EduIgnite AI</h1>
          {quota && !quota.is_pro ? (
            // Said plainly and always visible: nobody should discover the
            // limit by being refused.
            <span
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black",
                quota.remaining === 0
                  ? "bg-amber-100 text-amber-900"
                  : quota.remaining <= 2
                    ? "bg-amber-50 text-amber-800"
                    : "bg-secondary/20 text-primary",
              )}
            >
              {quota.remaining} of {quota.limit} left today
            </span>
          ) : quota?.is_pro ? (
            <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-black text-primary">
              PRO
            </span>
          ) : null}
        </div>
        <div className="hidden shrink-0 gap-1.5 lg:flex">
          {quickRoutes.map((topic) => (
            <Button
              key={topic.href}
              variant="outline"
              size="sm"
              className="h-8 rounded-full border-primary/15 px-3 text-xs font-bold text-primary"
              onClick={() => router.push(topic.href)}
            >
              <BookOpen className="mr-1.5 h-3 w-3" />
              {topic.label}
            </Button>
          ))}
        </div>
      </div>

      {/* ---- The conversation: the only thing on the page that scrolls ---- */}
      <div
        ref={chatScrollRef}
        className="min-h-0 flex-1 overflow-y-auto rounded-t-3xl border border-b-0 border-primary/10 bg-white"
      >
        <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
          {chatMessages.map((message, index) =>
            message.role === "user" ? (
              <div key={`${message.ts}-${index}`} className="mb-6 flex justify-end">
                <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-[15px] leading-relaxed text-white">
                  {message.content}
                </p>
              </div>
            ) : (
              <div key={`${message.ts}-${index}`} className="group mb-8">
                {/* Full width, like a page rather than a speech bubble: an
                    explanation with a chart in it needs the room. */}
                <div
                  ref={(element) => {
                    answerRefs.current[index] = element;
                  }}
                  className="text-[15px] leading-[1.75] text-foreground"
                >
                  <AiAnswer content={message.content} />
                </div>

                {index > 0 ? (
                  <div className="mt-3 flex items-center gap-1.5 transition-opacity focus-within:opacity-100 group-hover:opacity-100 md:opacity-60">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1.5 rounded-full px-2.5 text-[11px] font-bold text-muted-foreground hover:text-primary"
                      onClick={() => void savePdf(index)}
                      disabled={savingIndex === index}
                    >
                      {savingIndex === index ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <FileDown className="h-3 w-3" />
                      )}
                      Download PDF
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1.5 rounded-full px-2.5 text-[11px] font-bold text-muted-foreground hover:text-primary"
                      onClick={() => void copyAnswer(index, message.content)}
                    >
                      {copiedIndex === index ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {copiedIndex === index ? "Copied" : "Copy"}
                    </Button>
                  </div>
                ) : null}
              </div>
            ),
          )}

          {isTyping ? (
            <div className="mb-8 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Thinking...
            </div>
          ) : null}
        </div>
      </div>

      {/* ---- The question box, always in the same place ---- */}
      <div className="shrink-0 rounded-b-3xl border border-primary/10 bg-white px-4 pb-4 pt-3 sm:px-6">
        <div className="mx-auto w-full max-w-3xl">
          {isEmpty ? (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {QUICK_TOPICS.slice(0, 6).map((topic) => (
                <button
                  key={topic.label}
                  type="button"
                  onClick={() => void sendMessage(topic.prompt)}
                  className="rounded-full border border-primary/15 px-3 py-1.5 text-xs font-bold text-primary transition-colors hover:bg-primary/5"
                >
                  {topic.label}
                </button>
              ))}
            </div>
          ) : null}

          {quota?.exhausted ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <Zap className="h-5 w-5" />
              </div>
              <p className="mt-3 text-sm font-black text-amber-900">
                That is all {quota.limit} questions for today
              </p>
              <p className="mx-auto mt-1 max-w-sm text-xs font-medium leading-relaxed text-amber-800">
                Your questions reset tomorrow morning. Pro raises the daily limit if you
                need to keep going today.
              </p>
              <Link
                href="/dashboard/subscription"
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-black uppercase tracking-widest text-white transition-transform hover:-translate-y-0.5"
              >
                <Zap className="h-3.5 w-3.5" />
                Go Pro
              </Link>
            </div>
          ) : (
          <>
          <div className="flex items-end gap-2 rounded-2xl border border-primary/15 bg-accent/10 p-2 focus-within:border-primary/35">
            <Textarea
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder="Ask anything about your subjects, grades, attendance or the platform..."
              className="max-h-40 min-h-[2.75rem] flex-1 resize-none border-none bg-transparent px-2 py-2 text-[15px] shadow-none focus-visible:ring-0"
            />
            <Button
              onClick={() => void sendMessage(chatInput)}
              disabled={isTyping || !chatInput.trim()}
              size="icon"
              className="h-10 w-10 shrink-0 rounded-xl"
            >
              <Send className="h-4 w-4" />
              <span className="sr-only">Send</span>
            </Button>
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Enter to send, Shift and Enter for a new line. Any answer can be saved as a PDF.
          </p>
          </>
          )}
        </div>
      </div>
    </div>
  );
}
