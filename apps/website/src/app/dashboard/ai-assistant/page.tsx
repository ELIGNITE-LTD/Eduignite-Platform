"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, BookOpen, Send, FileDown, Copy, Check, ImagePlus, X } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { aiService } from "@/lib/api/services/ai.service";
import { getApiErrorMessage } from "@/lib/api/errors";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { AiAnswer } from "@/components/ai/ai-answer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { downloadAnswerPdf } from "@/lib/ai-pdf";
import { CreditPill, LowCreditNotice, OutOfCreditsPanel } from "@/components/ai-credits/credit-summary";
import { useAiCreditBalance, useSetAiCreditBalance } from "@/lib/hooks/useAiCredits";
import { formatCredits } from "@/lib/ai-credits";
import { MAX_QUESTION_IMAGES, prepareQuestionImage, type PreparedImage } from "@/lib/ai-images";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  ts: number;
  /** What the answer cost, shown quietly beside it. */
  creditsUsed?: number;
  /** Small copies of the photos a question was sent with. */
  images?: string[];
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
  // AI credits, on screen before the first question rather than at the
  // moment someone is turned away, and updated from every answer.
  const { data: credits } = useAiCreditBalance();
  const setCredits = useSetAiCreditBalance();

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: `Hi${user?.name ? ` ${user.name.split(" ")[0]}` : ""}! I'm your EduIgnite assistant. Ask me about your courses, grades, attendance, messaging, fees, or how to use your student tools.`,
      ts: Date.now(),
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  // Photos of the question, prepared on the device and waiting to be sent.
  const [attachments, setAttachments] = useState<PreparedImage[]>([]);
  const [preparing, setPreparing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addPhotos = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      const room = MAX_QUESTION_IMAGES - attachments.length;
      if (room <= 0) {
        toast({ title: `Up to ${MAX_QUESTION_IMAGES} photos per question` });
        return;
      }
      setPreparing(true);
      try {
        const prepared: PreparedImage[] = [];
        for (const file of Array.from(files).slice(0, room)) {
          prepared.push(await prepareQuestionImage(file));
        }
        setAttachments((current) => [...current, ...prepared].slice(0, MAX_QUESTION_IMAGES));
        if (files.length > room) toast({ title: `Only ${MAX_QUESTION_IMAGES} photos can go with one question` });
      } catch (error: any) {
        toast({ variant: "destructive", title: "Could not add the photo", description: error?.message });
      } finally {
        setPreparing(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [attachments.length, toast],
  );

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
      const photos = attachments;
      if ((!message && photos.length === 0) || isTyping || preparing) {
        return;
      }

      const nextMessages = [
        ...chatMessages,
        {
          role: "user" as const,
          content: message,
          ts: Date.now(),
          images: photos.length ? photos.map((photo) => photo.thumb) : undefined,
        },
      ];
      setChatMessages(nextMessages);
      setChatInput("");
      setAttachments([]);
      setIsTyping(true);
      scrollToBottom();

      try {
        const response = await aiService.directChat(
          message,
          nextMessages.slice(-10).map((entry) => ({ role: entry.role, content: entry.content })),
          photos.map((photo) => photo.dataUrl),
        );
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant", content: response.reply, ts: Date.now(), creditsUsed: response.credits_used },
        ]);
        setCredits(response.credits);
      } catch (error: any) {
        // Not enough credits, or the person chose not to spend them: the
        // credits dialog has already said so. The question goes back in the
        // box, unanswered and uncharged.
        if (error?.aiCreditsHandled || error?.aiCreditsCancelled) {
          setChatMessages((prev) => prev.slice(0, -1));
          setChatInput(message);
          setAttachments(photos);
          setIsTyping(false);
          return;
        }
        setCredits(error?.response?.data?.credits);
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
    [attachments, chatMessages, isTyping, preparing, setCredits, toast]
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
          {/* Said plainly and always visible: nobody should discover their
              balance by being refused. */}
          <CreditPill className="py-1" />
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
              <div key={`${message.ts}-${index}`} className="mb-6 flex flex-col items-end gap-1.5">
                {message.images?.length ? (
                  <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
                    {message.images.map((src, imageIndex) => (
                      <img
                        key={imageIndex}
                        src={src}
                        alt={`Photo ${imageIndex + 1} of the question`}
                        className="h-28 w-auto rounded-xl border border-primary/15 object-cover"
                      />
                    ))}
                  </div>
                ) : null}
                {message.content ? (
                  <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-[15px] leading-relaxed text-white">
                    {message.content}
                  </p>
                ) : null}
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
                    {message.creditsUsed ? (
                      <span className="ml-1 text-[11px] font-medium text-muted-foreground">
                        {formatCredits(message.creditsUsed)} credits
                      </span>
                    ) : null}
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

          {credits?.exhausted ? (
            <OutOfCreditsPanel balance={credits} />
          ) : (
          <>
          <LowCreditNotice balance={credits} className="mb-2" />
          {attachments.length ? (
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {attachments.map((photo, photoIndex) => (
                <div key={photoIndex} className="relative">
                  <img
                    src={photo.thumb}
                    alt={`Photo ${photoIndex + 1} to send`}
                    className="h-16 w-16 rounded-xl border border-primary/15 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setAttachments((current) => current.filter((_, i) => i !== photoIndex))}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background"
                    aria-label={`Remove photo ${photoIndex + 1}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <span className="text-[11px] text-muted-foreground">
                Questions sent as photos use more credits, because the AI reads the picture first.
              </span>
            </div>
          ) : null}
          <div className="flex items-end gap-2 rounded-2xl border border-primary/15 bg-accent/10 p-2 focus-within:border-primary/35">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => void addPhotos(event.target.files)}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 shrink-0 rounded-xl text-primary"
              onClick={() => fileInputRef.current?.click()}
              disabled={isTyping || preparing || attachments.length >= MAX_QUESTION_IMAGES}
              aria-label="Add a photo of your question"
              title="Add a photo of your question"
            >
              {preparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
            </Button>
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
              disabled={isTyping || preparing || (!chatInput.trim() && attachments.length === 0)}
              size="icon"
              className="h-10 w-10 shrink-0 rounded-xl"
            >
              <Send className="h-4 w-4" />
              <span className="sr-only">Send</span>
            </Button>
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Enter to send, Shift and Enter for a new line. Add a photo of a question to have it read. Any
            answer can be saved as a PDF.
          </p>
          </>
          )}
        </div>
      </div>
    </div>
  );
}
