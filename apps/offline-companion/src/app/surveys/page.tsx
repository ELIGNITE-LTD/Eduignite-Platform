"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronRight, Loader2, SquareCheckBig } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { surveysService } from "@/lib/api/services/surveys.service";
import { getApiErrorMessage } from "@/lib/api/errors";
import type { SurveyListItem } from "@/lib/api/types";

export default function SurveysPage() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const router = useRouter();
  const [surveys, setSurveys] = useState<SurveyListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/login/");
    }
  }, [authLoading, isAuthenticated, router]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await surveysService.getPendingSurveys();
      setSurveys(data);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not load surveys."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) load();
  }, [isAuthenticated, load]);

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
          <h1 className="mt-2 text-2xl font-black text-primary">Surveys</h1>
          <p className="mt-2 text-sm text-gray-500">Surveys EduIgnite has published that you haven't answered yet.</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>
        ) : surveys.length === 0 ? (
          <div className="rounded-2xl border bg-white p-6 text-center shadow-sm">
            <SquareCheckBig className="mx-auto h-8 w-8 text-gray-300" />
            <p className="mt-3 text-sm text-gray-500">You're all caught up — no pending surveys.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {surveys.map((survey) => (
              <Link
                key={survey.id}
                href={`/surveys/${survey.id}/`}
                className="flex items-center gap-3 rounded-2xl bg-white p-5 shadow-xl transition hover:-translate-y-0.5"
              >
                <div className="flex-1">
                  <p className="text-base font-black text-primary">{survey.title}</p>
                  {survey.description ? (
                    <p className="mt-1 text-sm text-gray-500">{survey.description}</p>
                  ) : null}
                  <p className="mt-2 text-xs text-gray-400">
                    {survey.question_count} question{survey.question_count === 1 ? "" : "s"}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
