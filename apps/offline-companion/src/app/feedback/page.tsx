"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Loader2, MessageSquareWarning } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { feedbackService } from "@/lib/api/services/feedback.service";
import { getApiErrorMessage } from "@/lib/api/errors";
import type { CreateFeedbackRequest } from "@/lib/api/types";

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
        <div>
          <Link href="/home/" className="inline-flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-primary">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Companion
          </Link>
          <h1 className="mt-2 text-2xl font-black text-primary">Feedback</h1>
          <p className="mt-2 text-sm text-gray-500">Report an issue or suggest an improvement to EduIgnite.</p>
        </div>

        {submitted ? (
          <div className="rounded-2xl border bg-white p-6 text-center shadow-sm">
            <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
            <p className="mt-3 text-sm font-bold text-primary">Feedback sent</p>
            <p className="mt-1 text-sm text-gray-500">The EduIgnite team will review it and follow up if needed.</p>
            <Link
              href="/home/"
              className="mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-black text-white shadow-md transition hover:bg-primary-dark"
            >
              Back to Companion
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl bg-white p-6 shadow-xl">
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
                    className={
                      "h-10 rounded-xl text-xs font-bold transition " +
                      (priority === p ? "bg-primary text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200")
                    }
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

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-black text-white shadow-md transition hover:bg-primary-dark disabled:opacity-60"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquareWarning className="h-4 w-4" />}
              Send Feedback
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
