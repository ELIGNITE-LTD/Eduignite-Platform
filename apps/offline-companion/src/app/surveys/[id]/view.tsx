"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Loader2, SquareCheckBig } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { surveysService } from "@/lib/api/services/surveys.service";
import { getApiErrorMessage } from "@/lib/api/errors";
import type { SurveyDetail } from "@/lib/api/types";
import { AppHeader } from "@/components/app-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";

export default function AnswerSurveyPage() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const surveyId = params?.id;

  const [survey, setSurvey] = useState<SurveyDetail | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/login/");
    }
  }, [authLoading, isAuthenticated, router]);

  const load = useCallback(async () => {
    if (!surveyId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await surveysService.getSurvey(surveyId);
      setSurvey(data);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not load this survey."));
    } finally {
      setIsLoading(false);
    }
  }, [surveyId]);

  useEffect(() => {
    if (isAuthenticated && surveyId) load();
  }, [isAuthenticated, surveyId, load]);

  const setAnswer = (questionId: number, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!survey || !surveyId) return;

    const missing = survey.questions.filter((q) => !(answers[q.id] || "").trim());
    if (missing.length > 0) {
      setError("Please answer every question before submitting.");
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await surveysService.submitResponse(
        surveyId,
        survey.questions.map((q) => ({ question_id: q.id, answer_text: answers[q.id] }))
      );
      setSubmitted(true);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not submit your answers. Please try again."));
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
          title={survey?.title || "Survey"}
          subtitle={survey?.description}
          backHref="/surveys/"
          backLabel="Back to Surveys"
        />

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : submitted ? (
          <Card className="p-6 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
            <p className="mt-3 text-sm font-bold text-primary-dark">Thanks for answering!</p>
            <p className="mt-1 text-sm text-gray-500">Your response has been recorded.</p>
            <Link href="/surveys/" className="mt-4 inline-block">
              <Button>Back to Surveys</Button>
            </Link>
          </Card>
        ) : !survey ? (
          <EmptyState icon={SquareCheckBig} title="Survey unavailable" description={error || "This survey is not available."} />
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {survey.questions.map((question, index) => (
              <Card key={question.id} className="p-5">
                <p className="text-sm font-black text-primary-dark">
                  {index + 1}. {question.question_text}
                </p>

                {question.question_type === "SINGLE_CHOICE" ? (
                  <div className="mt-3 space-y-2">
                    {question.options.map((option) => (
                      <label
                        key={option}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition",
                          answers[question.id] === option
                            ? "border-primary bg-primary/5 text-primary-dark"
                            : "border-gray-200 text-gray-600"
                        )}
                      >
                        <input
                          type="radio"
                          name={`question-${question.id}`}
                          value={option}
                          checked={answers[question.id] === option}
                          onChange={() => setAnswer(question.id, option)}
                          className="accent-primary"
                        />
                        {option}
                      </label>
                    ))}
                  </div>
                ) : (
                  <textarea
                    value={answers[question.id] || ""}
                    onChange={(e) => setAnswer(question.id, e.target.value)}
                    rows={3}
                    className="mt-3 w-full rounded-xl border border-gray-300 p-3 text-sm outline-none"
                    placeholder="Your answer..."
                  />
                )}
              </Card>
            ))}

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <Button type="submit" isLoading={isSubmitting} className="w-full">
              <SquareCheckBig className="h-4 w-4" />
              Submit Answers
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
