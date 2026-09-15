"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ClipboardList, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { getApiErrorMessage } from "@/lib/api/errors";
import { surveysService } from "@/lib/api/services/surveys.service";
import type { SurveyDetail, SurveyListItem } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/**
 * Asks a signed-in person to answer the surveys published for them.
 *
 * The server lists only surveys this person is in the audience for and has
 * not answered, so nobody is asked twice. "Answer later" hides a survey until
 * the next sign-in; it stays available on the Surveys page meanwhile.
 */

const DISMISSED_KEY = "eduignite_survey_prompt_dismissed";

function readDismissed(userId: string): number[] {
  try {
    const raw = sessionStorage.getItem(`${DISMISSED_KEY}:${userId}`);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "number") : [];
  } catch {
    return [];
  }
}

function writeDismissed(userId: string, ids: number[]) {
  try {
    sessionStorage.setItem(`${DISMISSED_KEY}:${userId}`, JSON.stringify(ids));
  } catch {
    /* private mode or storage full: the prompt simply returns next time */
  }
}

export function SurveyPrompt() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ? String(user.id) : "";
  const [dismissed, setDismissed] = useState<number[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (userId) setDismissed(readDismissed(userId));
  }, [userId]);

  const { data: pending = [] } = useQuery<SurveyListItem[]>({
    // Keyed by account so a second person signing in on the same device is
    // never shown the previous person's surveys.
    queryKey: ["surveys", "pending", userId],
    queryFn: () => surveysService.getPendingSurveys(),
    enabled: Boolean(userId),
    staleTime: 60_000,
  });

  const next = useMemo(
    () => pending.find((survey) => !survey.has_responded && !survey.is_own && !dismissed.includes(survey.id)),
    [pending, dismissed]
  );

  const { data: survey, isLoading } = useQuery<SurveyDetail>({
    queryKey: ["surveys", "detail", next?.id],
    queryFn: () => surveysService.getSurvey(next!.id),
    enabled: Boolean(next),
  });

  useEffect(() => {
    setAnswers({});
    setError(null);
    setDone(false);
  }, [next?.id]);

  if (!next) return null;

  const hide = () => {
    const ids = [...dismissed, next.id];
    setDismissed(ids);
    writeDismissed(userId, ids);
  };

  const close = () => {
    if (done) {
      queryClient.invalidateQueries({ queryKey: ["surveys", "pending"] });
    }
    hide();
  };

  const submit = async () => {
    if (!survey) return;
    const missing = survey.questions.filter((q) => !(answers[q.id] || "").trim());
    if (missing.length > 0) {
      setError("Please answer every question before submitting.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await surveysService.submitResponse(
        survey.id,
        survey.questions.map((q) => ({ question_id: q.id, answer_text: answers[q.id] }))
      );
      setDone(true);
    } catch (err: any) {
      if (err?.response?.status === 409) {
        setDone(true);
      } else {
        setError(getApiErrorMessage(err, "Could not submit your answers. Please try again."));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => (!open ? close() : undefined)}>
      <DialogContent className="max-h-[88dvh] overflow-y-auto rounded-3xl sm:max-w-lg">
        <DialogHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
            <ClipboardList className="h-5 w-5 text-primary" />
          </div>
          <DialogTitle className="text-left text-xl font-black text-primary">{next.title}</DialogTitle>
          <DialogDescription className="text-left">
            {next.description || "EduIgnite would like your views. It takes a minute."}
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="space-y-2 py-6 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
            <p className="text-sm font-bold text-primary">Thank you. Your answers have been recorded.</p>
          </div>
        ) : isLoading || !survey ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-7 w-7 animate-spin text-primary/40" />
          </div>
        ) : (
          <div className="space-y-4">
            {survey.questions.map((question, index) => (
              <div key={question.id} className="rounded-2xl border p-4">
                <p className="text-sm font-bold text-primary">
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
                            : "border-input text-muted-foreground"
                        )}
                      >
                        <input
                          type="radio"
                          name={`prompt-question-${question.id}`}
                          value={option}
                          checked={answers[question.id] === option}
                          onChange={() => setAnswers((prev) => ({ ...prev, [question.id]: option }))}
                          className="accent-primary"
                        />
                        {option}
                      </label>
                    ))}
                  </div>
                ) : (
                  <textarea
                    value={answers[question.id] || ""}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [question.id]: e.target.value }))}
                    rows={3}
                    className="mt-3 w-full rounded-xl border border-input p-3 text-sm outline-none focus:border-primary"
                    placeholder="Your answer"
                  />
                )}
              </div>
            ))}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {done ? (
            <Button onClick={close} className="w-full sm:w-auto">
              Close
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={hide} disabled={submitting}>
                Answer later
              </Button>
              <Button onClick={submit} disabled={submitting || !survey} className="gap-2">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Submit answers
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
