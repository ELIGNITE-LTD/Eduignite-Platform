"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ClipboardList, ChevronRight, Loader2, Plus, Trash2, Send, AlertCircle, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api/errors";
import { surveysService } from "@/lib/api/services/surveys.service";
import type { SurveyListItem, SurveyQuestionInput } from "@/lib/api/types";

type DraftQuestion = SurveyQuestionInput & { key: string };

const emptyDraftQuestion = (): DraftQuestion => ({
  key: crypto.randomUUID(),
  question_text: "",
  question_type: "TEXT",
  options: [],
});

/**
 * CEO/CTO can publish a survey here (see backend/apps/surveys'
 * SURVEY_PUBLISHER_ROLES) -- it reaches every authenticated user across
 * every EduIgnite client the moment it's published, mobile/desktop/offline
 * companion alike, since they all read the same GET /surveys/. Everyone
 * else just sees the pending-surveys list, same as
 * apps/offline-companion/src/app/surveys/page.tsx.
 */
export default function SurveysPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canPublish = ["CEO", "CTO"].includes(user?.role || "");

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState<DraftQuestion[]>([emptyDraftQuestion()]);

  const { data: surveys = [], isLoading, isError, refetch } = useQuery<SurveyListItem[]>({
    queryKey: ["surveys", "pending"],
    queryFn: () => surveysService.getPendingSurveys(),
  });

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setQuestions([emptyDraftQuestion()]);
    setShowForm(false);
  };

  const publishMutation = useMutation({
    mutationFn: () =>
      surveysService.publish({
        title,
        description,
        is_active: true,
        questions: questions.map(({ key: _key, ...q }, index) => ({ ...q, order: index + 1 })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["surveys", "pending"] });
      toast({ title: "Survey Published", description: "It's now visible to every EduIgnite app." });
      resetForm();
    },
    onError: (error) => {
      toast({ variant: "destructive", title: "Publish Failed", description: getApiErrorMessage(error, "Could not publish this survey.") });
    },
  });

  const updateQuestion = (key: string, patch: Partial<DraftQuestion>) => {
    setQuestions((prev) => prev.map((q) => (q.key === key ? { ...q, ...patch } : q)));
  };

  const canSubmit =
    title.trim().length > 0 &&
    questions.length > 0 &&
    questions.every(
      (q) =>
        q.question_text.trim().length > 0 &&
        (q.question_type !== "SINGLE_CHOICE" || (q.options && q.options.filter((o) => o.trim()).length >= 2)),
    );

  return (
    <div className="max-w-3xl space-y-8 pb-20">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-black text-primary">
            <div className="rounded-xl bg-primary p-2 text-white shadow-lg">
              <ClipboardList className="h-5 w-5 text-secondary" />
            </div>
            Surveys
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Surveys EduIgnite has published that you haven't answered yet.</p>
        </div>
        {canPublish && (
          <Button onClick={() => setShowForm((v) => !v)} className="h-12 gap-2 rounded-xl px-6 font-black uppercase tracking-widest text-xs">
            <Plus className="h-4 w-4" /> {showForm ? "Cancel" : "Publish Survey"}
          </Button>
        )}
      </div>

      {canPublish && showForm && (
        <Card className="rounded-3xl border-none shadow-xl">
          <CardHeader>
            <CardTitle className="text-lg font-black text-primary">New Survey</CardTitle>
            <CardDescription>Published surveys reach every online app and the offline companion app immediately.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. End of Term Feedback" />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
            </div>

            <div className="space-y-4">
              {questions.map((q, index) => (
                <div key={q.key} className="space-y-3 rounded-2xl border p-4">
                  <div className="flex items-start justify-between gap-2">
                    <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                      Question {index + 1}
                    </Label>
                    {questions.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setQuestions((prev) => prev.filter((item) => item.key !== q.key))}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <Input
                    value={q.question_text}
                    onChange={(e) => updateQuestion(q.key, { question_text: e.target.value })}
                    placeholder="Question text"
                  />
                  <Select
                    value={q.question_type}
                    onValueChange={(value: "TEXT" | "SINGLE_CHOICE") =>
                      updateQuestion(q.key, { question_type: value, options: value === "SINGLE_CHOICE" ? ["", ""] : [] })
                    }
                  >
                    <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TEXT">Free text</SelectItem>
                      <SelectItem value="SINGLE_CHOICE">Single choice</SelectItem>
                    </SelectContent>
                  </Select>
                  {q.question_type === "SINGLE_CHOICE" && (
                    <div className="space-y-2">
                      {(q.options || []).map((opt, optIndex) => (
                        <Input
                          key={optIndex}
                          value={opt}
                          onChange={(e) => {
                            const next = [...(q.options || [])];
                            next[optIndex] = e.target.value;
                            updateQuestion(q.key, { options: next });
                          }}
                          placeholder={`Option ${optIndex + 1}`}
                        />
                      ))}
                      <button
                        type="button"
                        onClick={() => updateQuestion(q.key, { options: [...(q.options || []), ""] })}
                        className="text-xs font-bold text-primary"
                      >
                        + Add option
                      </button>
                    </div>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setQuestions((prev) => [...prev, emptyDraftQuestion()])}
                className="text-sm font-bold text-primary"
              >
                + Add question
              </button>
            </div>
          </CardContent>
          <CardFooter className="justify-end gap-2">
            <Button variant="secondary" onClick={resetForm}>Cancel</Button>
            <Button
              onClick={() => publishMutation.mutate()}
              disabled={!canSubmit || publishMutation.isPending}
              className="gap-2"
            >
              {publishMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Publish
            </Button>
          </CardFooter>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary/30" /></div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-4 rounded-3xl border-2 border-dashed border-destructive/20 bg-white/50 py-16">
          <AlertCircle className="h-12 w-12 text-destructive/30" />
          <p className="font-bold text-muted-foreground">Failed to load surveys.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Retry
          </Button>
        </div>
      ) : surveys.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-muted py-16 text-center">
          <ClipboardList className="mx-auto h-12 w-12 text-primary/20" />
          <p className="mt-4 text-sm font-bold text-muted-foreground">You're all caught up. No pending surveys right now.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {surveys.map((survey) => (
            <Link key={survey.id} href={`/dashboard/surveys/${survey.id}`} className="block">
              <Card className="flex items-center gap-3 rounded-2xl border-none p-5 shadow-md transition hover:shadow-lg">
                <div className="flex-1">
                  <p className="text-base font-black text-primary">{survey.title}</p>
                  {survey.description ? <p className="mt-1 text-sm text-muted-foreground">{survey.description}</p> : null}
                  <p className="mt-2 text-xs text-muted-foreground/70">
                    {survey.question_count} question{survey.question_count === 1 ? "" : "s"}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
