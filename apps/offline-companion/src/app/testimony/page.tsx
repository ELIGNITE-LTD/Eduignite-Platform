"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Loader2, Quote, Star } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { communityService } from "@/lib/api/services/community.service";
import { getApiErrorMessage } from "@/lib/api/errors";

export default function TestimonyPage() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const router = useRouter();
  const [schoolName, setSchoolName] = useState("");
  const [roleDisplay, setRoleDisplay] = useState("");
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState(5);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/login/");
    }
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (user?.school?.name) setSchoolName(user.school.name);
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolName.trim() || !roleDisplay.trim() || !message.trim()) {
      setError("Fill in your school, your role, and your testimony.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await communityService.createTestimony({
        school_name: schoolName.trim(),
        role_display: roleDisplay.trim(),
        message: message.trim(),
        rating,
      });
      setSubmitted(true);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not submit your testimony. Please try again."));
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
          <h1 className="mt-2 text-2xl font-black text-primary">Share a Testimony</h1>
          <p className="mt-2 text-sm text-gray-500">
            Tell other schools about your experience with EduIgnite. Approved testimonies may be featured publicly.
          </p>
        </div>

        {submitted ? (
          <div className="rounded-2xl border bg-white p-6 text-center shadow-sm">
            <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
            <p className="mt-3 text-sm font-bold text-primary">Thank you!</p>
            <p className="mt-1 text-sm text-gray-500">
              Your testimony was submitted and is pending review by the EduIgnite team.
            </p>
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
              <label htmlFor="schoolName" className="text-xs font-bold text-gray-600">
                School name
              </label>
              <input
                id="schoolName"
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                className="h-12 w-full rounded-xl border border-gray-300 px-3 text-sm outline-none"
                placeholder="e.g. Bilingual Academy of Excellence"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="roleDisplay" className="text-xs font-bold text-gray-600">
                Your role
              </label>
              <input
                id="roleDisplay"
                value={roleDisplay}
                onChange={(e) => setRoleDisplay(e.target.value)}
                className="h-12 w-full rounded-xl border border-gray-300 px-3 text-sm outline-none"
                placeholder="e.g. School Administrator"
              />
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-bold text-gray-600">Rating</p>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n} star${n > 1 ? "s" : ""}`}>
                    <Star
                      className={"h-7 w-7 " + (n <= rating ? "fill-accent text-accent" : "text-gray-200")}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="message" className="text-xs font-bold text-gray-600">
                Your testimony
              </label>
              <textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                className="w-full rounded-xl border border-gray-300 p-3 text-sm outline-none"
                placeholder="Share how EduIgnite has helped your school..."
              />
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-black text-white shadow-md transition hover:bg-primary-dark disabled:opacity-60"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Quote className="h-4 w-4" />}
              Submit Testimony
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
