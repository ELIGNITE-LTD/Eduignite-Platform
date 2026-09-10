"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Loader2, Quote, Star } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { communityService } from "@/lib/api/services/community.service";
import { getApiErrorMessage } from "@/lib/api/errors";
import { AppHeader } from "@/components/app-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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
        <AppHeader
          title="Share a Testimony"
          subtitle="Tell other schools about your experience with EduIgnite. Approved testimonies may be featured publicly."
          backHref="/workspace/"
        />

        {submitted ? (
          <Card className="p-6 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
            <p className="mt-3 text-sm font-bold text-primary-dark">Thank you!</p>
            <p className="mt-1 text-sm text-gray-500">
              Your testimony was submitted and is pending review by the EduIgnite team.
            </p>
            <Link href="/workspace/" className="mt-4 inline-block">
              <Button>Back to Workspace</Button>
            </Link>
          </Card>
        ) : (
          <Card className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
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
                      <Star className={"h-7 w-7 " + (n <= rating ? "fill-accent text-accent" : "text-gray-200")} />
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

              <Button type="submit" isLoading={isSubmitting} className="w-full">
                <Quote className="h-4 w-4" />
                Submit Testimony
              </Button>
            </form>
          </Card>
        )}
      </div>
    </main>
  );
}
