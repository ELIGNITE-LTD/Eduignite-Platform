"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertCircle,
  BarChart3,
  ChevronRight,
  ClipboardList,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  UserPlus,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import { getApiErrorMessage } from "@/lib/api/errors";
import { surveysService } from "@/lib/api/services/surveys.service";
import type {
  SurveyAccess,
  SurveyAudience,
  SurveyListItem,
  SurveyManaged,
  SurveyPublisher,
  SurveyQuestionInput,
  SurveyResponsesReport,
} from "@/lib/api/types";

type DraftQuestion = SurveyQuestionInput & { key: string };

const emptyDraftQuestion = (): DraftQuestion => ({
  key: crypto.randomUUID(),
  question_text: "",
  question_type: "TEXT",
  options: [],
});

const AUDIENCES: { value: SurveyAudience; label: string; perSchool: boolean }[] = [
  { value: "ALL_EDUIGNITE_USERS", label: "All EduIgnite users", perSchool: false },
  { value: "ALL_SCHOOL_USERS", label: "All school users", perSchool: true },
  { value: "EXECUTIVE", label: "EduIgnite executives", perSchool: false },
  { value: "PRINCIPAL", label: "Principals and school administrators", perSchool: true },
  { value: "SCHOOL_STAFF", label: "School staff", perSchool: true },
  { value: "TEACHER", label: "Teachers", perSchool: true },
  { value: "STUDENT", label: "Students", perSchool: true },
  { value: "PARENT", label: "Parents", perSchool: true },
];

const ALL_SCHOOLS = "__all__";

/**
 * Surveys. Everyone sees the surveys waiting for their answer. People who may
 * publish (the CEO, the CTO and anyone they authorise) also choose each
 * survey's audience, open or close their surveys and read the responses.
 * The server enforces all of it; this page only shows what it allows.
 */
export default function SurveysPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [audience, setAudience] = useState<SurveyAudience>("ALL_EDUIGNITE_USERS");
  const [targetSchool, setTargetSchool] = useState(ALL_SCHOOLS);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [questions, setQuestions] = useState<DraftQuestion[]>([emptyDraftQuestion()]);
  const [reportFor, setReportFor] = useState<SurveyManaged | null>(null);
  const [publisherMatricule, setPublisherMatricule] = useState("");

  const { data: access } = useQuery<SurveyAccess>({
    queryKey: ["surveys", "access"],
    queryFn: () => surveysService.getAccess(),
    staleTime: 5 * 60 * 1000,
  });
  const canPublish = Boolean(access?.can_publish);
  const canManagePublishers = Boolean(access?.can_manage_publishers);
  const audienceMeta = AUDIENCES.find((option) => option.value === audience);

  const { data: surveys = [], isLoading, isError, refetch } = useQuery<SurveyListItem[]>({
    queryKey: ["surveys", "pending"],
    queryFn: () => surveysService.getPendingSurveys(),
  });

  const { data: managed = [], isLoading: managedLoading } = useQuery<SurveyManaged[]>({
    queryKey: ["surveys", "managed"],
    queryFn: () => surveysService.getManaged(),
    enabled: canPublish,
  });

  const { data: publishers = [] } = useQuery<SurveyPublisher[]>({
    queryKey: ["surveys", "publishers"],
    queryFn: () => surveysService.getPublishers(),
    enabled: canManagePublishers,
  });

  const { data: schoolOptions = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["surveys", "school-options"],
    queryFn: async () => {
      const { data } = await apiClient.get(API.SCHOOLS.BASE, { params: { page_size: 500 } });
      return Array.isArray(data) ? data : (data?.results ?? []);
    },
    enabled: canPublish && showForm && Boolean(audienceMeta?.perSchool),
    staleTime: 10 * 60 * 1000,
  });

  const { data: report, isLoading: reportLoading } = useQuery<SurveyResponsesReport>({
    queryKey: ["surveys", "responses", reportFor?.id],
    queryFn: () => surveysService.getResponses(reportFor!.id),
    enabled: Boolean(reportFor),
  });

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setAudience("ALL_EDUIGNITE_USERS");
    setTargetSchool(ALL_SCHOOLS);
    setAllowMultiple(false);
    setQuestions([emptyDraftQuestion()]);
    setShowForm(false);
  };

  const publishMutation = useMutation({
    mutationFn: () =>
      surveysService.publish({
        title,
        description,
        is_active: true,
        audience,
        target_school: audienceMeta?.perSchool && targetSchool !== ALL_SCHOOLS ? targetSchool : null,
        allow_multiple_responses: allowMultiple,
        questions: questions.map(({ key: _key, ...q }, index) => ({ ...q, order: index + 1 })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["surveys"] });
      toast({ title: "Survey published", description: `It is now open to ${audienceMeta?.label.toLowerCase()}.` });
      resetForm();
    },
    onError: (error) => {
      toast({ variant: "destructive", title: "Could not publish", description: getApiErrorMessage(error, "Could not publish this survey.") });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (survey: SurveyManaged) => surveysService.update(survey.id, { is_active: !survey.is_active }),
    onSuccess: (_data, survey) => {
      queryClient.invalidateQueries({ queryKey: ["surveys"] });
      toast({ title: survey.is_active ? "Survey closed" : "Survey reopened" });
    },
    onError: (error) => {
      toast({ variant: "destructive", title: "Could not update", description: getApiErrorMessage(error) });
    },
  });

  const addPublisherMutation = useMutation({
    mutationFn: () => surveysService.addPublisher(publisherMatricule.trim()),
    onSuccess: (publisher) => {
      queryClient.invalidateQueries({ queryKey: ["surveys", "publishers"] });
      setPublisherMatricule("");
      toast({ title: "Publisher authorised", description: `${publisher.user_name} can now publish surveys.` });
    },
    onError: (error) => {
      toast({ variant: "destructive", title: "Could not authorise", description: getApiErrorMessage(error) });
    },
  });

  const removePublisherMutation = useMutation({
    mutationFn: (id: number) => surveysService.removePublisher(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["surveys", "publishers"] }),
    onError: (error) => {
      toast({ variant: "destructive", title: "Could not remove", description: getApiErrorMessage(error) });
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
        (q.question_type !== "SINGLE_CHOICE" || (q.options && q.options.filter((o) => o.trim()).length >= 2))
    );

  const waiting = surveys.filter((survey) => !survey.is_own);

  return (
    <div className="max-w-4xl space-y-8 pb-20">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-black text-primary">
            <div className="rounded-xl bg-primary p-2 text-white shadow-lg">
              <ClipboardList className="h-5 w-5 text-secondary" />
            </div>
            Surveys
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {canPublish
              ? "Publish surveys to a chosen audience and follow the responses."
              : "Surveys waiting for your answer."}
          </p>
        </div>
        {canPublish && (
          <Button onClick={() => setShowForm((v) => !v)} className="h-12 gap-2 rounded-xl px-6 font-black uppercase tracking-widest text-xs">
            <Plus className="h-4 w-4" /> {showForm ? "Cancel" : "Publish survey"}
          </Button>
        )}
      </div>

      {canPublish && showForm && (
        <Card className="rounded-3xl border-none shadow-xl">
          <CardHeader>
            <CardTitle className="text-lg font-black text-primary">New survey</CardTitle>
            <CardDescription>Only the audience you choose can see and answer it, in every EduIgnite app.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. End of term feedback" />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Audience</Label>
                <Select
                  value={audience}
                  onValueChange={(value: SurveyAudience) => {
                    setAudience(value);
                    setTargetSchool(ALL_SCHOOLS);
                  }}
                >
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AUDIENCES.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {audienceMeta?.perSchool && (
                <div className="space-y-2">
                  <Label>School</Label>
                  <Select value={targetSchool} onValueChange={setTargetSchool}>
                    <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_SCHOOLS}>All schools</SelectItem>
                      {schoolOptions.map((school) => (
                        <SelectItem key={school.id} value={String(school.id)}>{school.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border p-4">
              <input
                type="checkbox"
                checked={allowMultiple}
                onChange={(e) => setAllowMultiple(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <span>
                <span className="block text-sm font-bold text-primary">Allow more than one answer per person</span>
                <span className="block text-xs text-muted-foreground">
                  Useful for recurring check-ins. Otherwise each person answers once and is never asked again.
                </span>
              </span>
            </label>

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
                        aria-label={`Remove question ${index + 1}`}
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
            <Button onClick={() => publishMutation.mutate()} disabled={!canSubmit || publishMutation.isPending} className="gap-2">
              {publishMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Publish
            </Button>
          </CardFooter>
        </Card>
      )}

      {canPublish && (
        <section className="space-y-3">
          <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Your surveys</h2>
          {managedLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary/30" /></div>
          ) : managed.length === 0 ? (
            <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              You have not published a survey yet.
            </p>
          ) : (
            managed.map((survey) => (
              <Card key={survey.id} className="rounded-2xl border-none p-5 shadow-md">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-black text-primary">{survey.title}</p>
                      <Badge variant={survey.is_active ? "default" : "secondary"} className="text-[10px] uppercase">
                        {survey.is_active ? "Open" : "Closed"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {survey.audience_display}
                      {survey.target_school_name ? ` at ${survey.target_school_name}` : ""}
                      {survey.allow_multiple_responses ? ", repeat answers allowed" : ""}
                    </p>
                    <p className="mt-1 text-xs font-bold text-primary/70">
                      {survey.response_count} response{survey.response_count === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button variant="outline" size="sm" className="gap-2 rounded-xl" onClick={() => setReportFor(survey)}>
                      <BarChart3 className="h-4 w-4" /> Responses
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-xl"
                      onClick={() => toggleMutation.mutate(survey)}
                      disabled={toggleMutation.isPending}
                    >
                      {survey.is_active ? "Close" : "Reopen"}
                    </Button>
                  </div>
                </div>
              </Card>
            ))
          )}
        </section>
      )}

      {canManagePublishers && (
        <Card className="rounded-3xl border-none shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-black text-primary">
              <ShieldCheck className="h-4 w-4" /> Who can publish surveys
            </CardTitle>
            <CardDescription>
              The CEO and CTO always can. Authorise anyone else by their matricule; they manage only their own surveys.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                if (publisherMatricule.trim()) addPublisherMutation.mutate();
              }}
            >
              <Input
                value={publisherMatricule}
                onChange={(e) => setPublisherMatricule(e.target.value)}
                placeholder="Matricule, e.g. EDUCOO2601"
                className="h-11"
              />
              <Button type="submit" className="h-11 gap-2 rounded-xl" disabled={!publisherMatricule.trim() || addPublisherMutation.isPending}>
                <UserPlus className="h-4 w-4" /> Authorise
              </Button>
            </form>
            {publishers.length > 0 && (
              <ul className="divide-y rounded-2xl border">
                {publishers.map((publisher) => (
                  <li key={publisher.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-primary">{publisher.user_name}</p>
                      <p className="text-xs text-muted-foreground">{publisher.user_role} · {publisher.user_matricule}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => removePublisherMutation.mutate(publisher.id)}
                      disabled={removePublisherMutation.isPending}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <section className="space-y-3">
        {canPublish && (
          <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Waiting for your answer</h2>
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
        ) : waiting.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-muted py-16 text-center">
            <ClipboardList className="mx-auto h-12 w-12 text-primary/20" />
            <p className="mt-4 text-sm font-bold text-muted-foreground">You're all caught up. No surveys are waiting for you.</p>
          </div>
        ) : (
          waiting.map((survey) => (
            <Link key={survey.id} href={`/dashboard/surveys/${survey.id}`} className="block">
              <Card className="flex items-center gap-3 rounded-2xl border-none p-5 shadow-md transition hover:shadow-lg">
                <div className="flex-1">
                  <p className="text-base font-black text-primary">{survey.title}</p>
                  {survey.description ? <p className="mt-1 text-sm text-muted-foreground">{survey.description}</p> : null}
                  <p className="mt-2 text-xs text-muted-foreground/70">
                    {survey.question_count} question{survey.question_count === 1 ? "" : "s"}
                    {survey.has_responded ? ", answered before (you can answer again)" : ""}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />
              </Card>
            </Link>
          ))
        )}
      </section>

      <Dialog open={Boolean(reportFor)} onOpenChange={(open) => (!open ? setReportFor(null) : undefined)}>
        <DialogContent className="max-h-[88dvh] overflow-y-auto rounded-3xl sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-left text-xl font-black text-primary">{reportFor?.title}</DialogTitle>
            <DialogDescription className="text-left">
              {report
                ? `${report.response_count} response${report.response_count === 1 ? "" : "s"} from ${report.respondent_count} ${report.respondent_count === 1 ? "person" : "people"}.`
                : "Loading responses."}
            </DialogDescription>
          </DialogHeader>
          {reportLoading || !report ? (
            <div className="flex justify-center py-10"><Loader2 className="h-7 w-7 animate-spin text-primary/40" /></div>
          ) : (
            <div className="space-y-6">
              {report.summary
                .filter((item) => item.options)
                .map((item) => {
                  const total = (item.options || []).reduce((sum, row) => sum + row.count, 0) || 1;
                  return (
                    <div key={item.question} className="space-y-2">
                      <p className="text-sm font-bold text-primary">{item.question_text}</p>
                      {(item.options || []).map((row) => (
                        <div key={row.option} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span>{row.option}</span>
                            <span className="font-bold tabular-nums">{row.count}</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${(row.count / total) * 100}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}

              <div className="space-y-3">
                <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Individual responses</p>
                {report.responses.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No one has answered yet.</p>
                ) : (
                  report.responses.map((response) => (
                    <div key={response.id} className="rounded-2xl border p-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-sm font-bold text-primary">{response.respondent_name}</p>
                        <p className="text-[11px] text-muted-foreground">{new Date(response.submitted_at).toLocaleString()}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {response.respondent_role}
                        {response.respondent_school ? `, ${response.respondent_school}` : ""}
                      </p>
                      <dl className="mt-3 space-y-2">
                        {response.answers.map((answer) => (
                          <div key={answer.question}>
                            <dt className="text-xs font-semibold text-muted-foreground">{answer.question_text}</dt>
                            <dd className="whitespace-pre-wrap text-sm">{answer.answer_text || "(no answer)"}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
