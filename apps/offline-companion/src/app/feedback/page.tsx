"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Loader2, MessageSquareWarning } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { feedbackService } from "@/lib/api/services/feedback.service";
import { getApiErrorMessage } from "@/lib/api/errors";
import type { CreateFeedbackRequest } from "@/lib/api/types";
import { AppHeader } from "@/components/app-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PRIORITIES: CreateFeedbackRequest["priority"][] = ["Low", "Medium", "High", "Critical"];

export default function FeedbackPage() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState<CreateFeedbackRequest["priority"]>("Medium");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/login/");
    }
  }, [authLoading, isAuthenticated, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      setError("Enter a subject and a message.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await feedbackService.createFeedback({ subject: subject.trim(), message: message.trim(), priority });
      setSubmitted(true);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not submit your feedback. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-sm space-y-6">
        <AppHeader
          title="Feedback"
          subtitle="Report an issue or suggest an improvement to EduIgnite."
          backHref="/workspace/"
        />

        {submitted ? (
          <Card className="p-6 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
            <p className="mt-3 text-sm font-bold text-primary-dark">Feedback sent</p>
            <p className="mt-1 text-sm text-gray-500">The EduIgnite team will review it and follow up if needed.</p>
            <Link href="/workspace/" className="mt-4 inline-block">
              <Button>Back to Workspace</Button>
            </Link>
          </Card>
        ) : (
          <Card className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="subject" className="text-xs font-bold text-gray-600">
                  Subject
                </label>
                <input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="h-12 w-full rounded-xl border border-gray-300 px-3 text-sm outline-none"
                  placeholder="e.g. Trouble activating our license"
                />
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-bold text-gray-600">Priority</p>
                <div className="grid grid-cols-4 gap-2">
                  {PRIORITIES.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      className={cn(
                        "h-10 rounded-xl text-xs font-bold transition",
                        priority === p ? "bg-primary text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="message" className="text-xs font-bold text-gray-600">
                  Message
                </label>
                <textarea
                  id="message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  className="w-full rounded-xl border border-gray-300 p-3 text-sm outline-none"
                  placeholder="Describe the issue or suggestion..."
                />
              </div>

              {error ? <p className="text-sm text-destructive">{error}</p> : null}

              <Button type="submit" isLoading={isSubmitting} className="w-full">
                <MessageSquareWarning className="h-4 w-4" />
                Send Feedback
              </Button>
            </form>
          </Card>
        )}
      </div>
    </main>
  );
}
