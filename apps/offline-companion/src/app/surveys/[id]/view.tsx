"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Loader2, SquareCheckBig } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { surveysService } from "@/lib/api/services/surveys.service";
import { getApiErrorMessage } from "@/lib/api/errors";
import type { SurveyDetail } from "@/lib/api/types";

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
        <div>
          <Link href="/surveys/" className="inline-flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-primary">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Surveys
          </Link>
          {survey ? (
            <>
              <h1 className="mt-2 text-2xl font-black text-primary">{survey.title}</h1>
              {survey.description ? <p className="mt-2 text-sm text-gray-500">{survey.description}</p> : null}
            </>
          ) : null}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : submitted ? (
          <div className="rounded-2xl border bg-white p-6 text-center shadow-sm">
            <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
            <p className="mt-3 text-sm font-bold text-primary">Thanks for answering!</p>
            <p className="mt-1 text-sm text-gray-500">Your response has been recorded.</p>
            <Link
              href="/surveys/"
              className="mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-black text-white shadow-md transition hover:bg-primary-dark"
            >
              Back to Surveys
            </Link>
          </div>
        ) : !survey ? (
          <div className="rounded-2xl border bg-white p-6 text-center shadow-sm">
            <SquareCheckBig className="mx-auto h-8 w-8 text-gray-300" />
            <p className="mt-3 text-sm text-gray-500">{error || "This survey is not available."}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {survey.questions.map((question, index) => (
              <div key={question.id} className="rounded-2xl bg-white p-5 shadow-xl">
                <p className="text-sm font-black text-primary">
                  {index + 1}. {question.question_text}
                </p>

                {question.question_type === "SINGLE_CHOICE" ? (
                  <div className="mt-3 space-y-2">
                    {question.options.map((option) => (
                      <label
                        key={option}
                        className={
                          "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition " +
                          (answers[question.id] === option
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-gray-200 text-gray-600")
                        }
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
              </div>
            ))}

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-black text-white shadow-md transition hover:bg-primary-dark disabled:opacity-60"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <SquareCheckBig className="h-4 w-4" />}
              Submit Answers
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
