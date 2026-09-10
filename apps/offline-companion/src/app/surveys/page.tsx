"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Loader2, SquareCheckBig } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { surveysService } from "@/lib/api/services/surveys.service";
import { getApiErrorMessage } from "@/lib/api/errors";
import type { SurveyListItem } from "@/lib/api/types";
import { AppHeader } from "@/components/app-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";

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
        <AppHeader
          title="Surveys"
          subtitle="Surveys EduIgnite has published that you haven't answered yet."
          backHref="/workspace/"
        />

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>
        ) : surveys.length === 0 ? (
          <EmptyState icon={SquareCheckBig} title="You're all caught up" description="No pending surveys right now." />
        ) : (
          <div className="space-y-3">
            {surveys.map((survey) => (
              <Link key={survey.id} href={`/surveys/${survey.id}/`} className="block">
                <Card interactive className="flex items-center gap-3 p-5">
                  <div className="flex-1">
                    <p className="text-base font-black text-primary-dark">{survey.title}</p>
                    {survey.description ? <p className="mt-1 text-sm text-gray-500">{survey.description}</p> : null}
                    <p className="mt-2 text-xs text-gray-400">
                      {survey.question_count} question{survey.question_count === 1 ? "" : "s"}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
