"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, ChevronRight, BookOpen, Send } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { aiService } from "@/lib/api/services/ai.service";
import { getApiErrorMessage } from "@/lib/api/errors";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

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
      } catch (error) {
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

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(chatInput);
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

  return (
    <div className="flex h-[calc(100vh-140px)] flex-col gap-4">
      <div className="shrink-0">
        <h1 className="flex items-center gap-2 text-3xl font-bold text-primary font-headline">
          <div className="rounded-xl bg-primary p-2 shadow-lg">
            <Sparkles className="h-6 w-6 fill-secondary/20 text-secondary" />
          </div>
          AI Assistant
        </h1>
        <p className="mt-1 text-muted-foreground">
          Live student support powered by your actual EduIgnite data and platform tools.
        </p>
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        <div className="hidden w-60 shrink-0 lg:flex">
          <Card className="flex-1 border-none shadow-lg">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm">
                <BookOpen className="h-4 w-4 text-primary" />
                Quick Prompts
              </CardTitle>
              <CardDescription className="text-xs">
                Start with a real student workflow question.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-2 pt-0">
              <ScrollArea className="h-full max-h-[calc(100vh-280px)]">
                <div className="space-y-1">
                  {quickRoutes.map((topic) => (
                    <Button
                      key={topic.href}
                      variant="secondary"
                      size="sm"
                      className="h-8 w-full justify-start px-2 text-xs font-bold"
                      onClick={() => router.push(topic.href)}
                    >
                      <ChevronRight className="mr-1 h-3 w-3 shrink-0" />
                      {topic.label}
                    </Button>
                  ))}
                  {QUICK_TOPICS.map((topic) => (
                    <Button
                      key={topic.label}
                      variant="ghost"
                      size="sm"
                      className="h-8 w-full justify-start px-2 text-xs text-muted-foreground hover:bg-primary/5 hover:text-primary"
                      onClick={() => void sendMessage(topic.prompt)}
                    >
                      <ChevronRight className="mr-1 h-3 w-3 shrink-0" />
                      {topic.label}
                    </Button>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        <Card className="flex min-h-0 flex-1 flex-col border-none shadow-lg">
          <CardHeader className="shrink-0 border-b py-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-5 w-5 text-primary" />
                EduIgnite Assistant
              </CardTitle>
              <Badge variant="secondary" className="border-none bg-secondary/20 font-black text-primary">
                LIVE
              </Badge>
            </div>
            <CardDescription>
              Ask about student features, academic progress, support flows, and linked services.
            </CardDescription>
          </CardHeader>

          <CardContent className="flex min-h-0 flex-1 flex-col p-0">
            <div
              ref={chatScrollRef}
              className="flex-1 space-y-4 overflow-y-auto bg-accent/10 p-4"
            >
              {chatMessages.map((message, index) => (
                <div
                  key={`${message.ts}-${index}`}
                  className={cn(
                    "flex w-full",
                    message.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm",
                      message.role === "user"
                        ? "bg-primary text-white"
                        : "bg-white text-foreground"
                    )}
                  >
                    {renderContent(message.content)}
                  </div>
                </div>
              ))}

              {isTyping ? (
                <div className="flex justify-start">
                  <div className="rounded-2xl bg-white px-4 py-3 text-sm shadow-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Thinking...
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="shrink-0 border-t bg-white p-4">
              <div className="flex items-center gap-2">
                <Input
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about your subjects, grades, attendance, or platform tools..."
                  className="h-12 rounded-xl border-accent bg-accent/20"
                />
                <Button
                  className="h-12 rounded-xl px-5"
                  onClick={() => void sendMessage(chatInput)}
                  disabled={!chatInput.trim() || isTyping}
                >
                  {isTyping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 lg:hidden">
                {QUICK_TOPICS.slice(0, 4).map((topic) => (
                  <Button
                    key={topic.label}
                    variant="outline"
                    size="sm"
                    className="rounded-full text-[11px]"
                    onClick={() => void sendMessage(topic.prompt)}
                  >
                    {topic.label}
                  </Button>
                ))}
              </div>

              <p className="mt-3 text-[11px] text-muted-foreground">
                Your last {conversationHistory.length} messages are used as context for follow-up help.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
