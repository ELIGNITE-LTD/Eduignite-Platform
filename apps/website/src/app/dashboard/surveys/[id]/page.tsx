"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Loader2, ClipboardList, ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getApiErrorMessage } from "@/lib/api/errors";
import { surveysService } from "@/lib/api/services/surveys.service";
import type { SurveyDetail } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/**
 * Answer-a-survey screen -- mirrors apps/mobile and apps/desktop's
 * dashboard/surveys/[id] view exactly (same backend, same request/response
 * shape), adapted to this app's dashboard layout/shadcn primitives.
 */
export default function AnswerSurveyPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const surveyId = params?.id;

  const [survey, setSurvey] = useState<SurveyDetail | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

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
    if (surveyId) load();
  }, [surveyId, load]);

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
        survey.questions.map((q) => ({ question_id: q.id, answer_text: answers[q.id] })),
      );
      setSubmitted(true);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not submit your answers. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6 pb-20">
      <button
        type="button"
        onClick={() => router.push("/dashboard/surveys")}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Surveys
      </button>

      <div>
        <h1 className="text-2xl font-black text-primary">{survey?.title || "Survey"}</h1>
        {survey?.description ? <p className="mt-1 text-sm text-muted-foreground">{survey.description}</p> : null}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary/30" /></div>
      ) : submitted ? (
        <Card className="rounded-3xl p-8 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
          <p className="mt-3 text-sm font-bold text-primary">Thanks for answering!</p>
          <p className="mt-1 text-sm text-muted-foreground">Your response has been recorded.</p>
          <Link href="/dashboard/surveys" className="mt-4 inline-block">
            <Button>Back to Surveys</Button>
          </Link>
        </Card>
      ) : !survey ? (
        <div className="rounded-3xl border-2 border-dashed border-muted py-16 text-center">
          <ClipboardList className="mx-auto h-12 w-12 text-primary/20" />
          <p className="mt-4 text-sm font-bold text-muted-foreground">{error || "This survey is not available."}</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {survey.questions.map((question, index) => (
            <Card key={question.id} className="rounded-2xl p-5">
              <p className="text-sm font-black text-primary">
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
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-input text-muted-foreground",
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
                  className="mt-3 w-full rounded-xl border border-input p-3 text-sm outline-none"
                  placeholder="Your answer..."
                />
              )}
            </Card>
          ))}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <Button type="submit" disabled={isSubmitting} className="w-full gap-2">
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Submit Answers
          </Button>
        </form>
      )}
    </div>
  );
}
