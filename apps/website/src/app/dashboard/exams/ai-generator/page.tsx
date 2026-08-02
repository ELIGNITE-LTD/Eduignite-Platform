"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, FileText, Loader2, RefreshCw, Save, Send, Sparkles, Trash2 } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { apiClient } from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import { aiService } from "@/lib/api/services/ai.service";
import { getApiErrorMessage } from "@/lib/api/errors";
import type { AIExamDraftDetail, AIExamQuestion, CreateExamDraftPayload, PaginatedResponse } from "@/lib/api/types";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

type SubjectOption = { id: string; name: string; code?: string };
type ClassOption = { id: string; name: string; sub_school_name?: string; sub_school?: { name: string } | null };

type FormState = {
  title: string;
  subject_id: string;
  school_class_id: string;
  topics: string[];
  difficulty: CreateExamDraftPayload["difficulty"];
  publish_target: "EXAM" | "ASSIGNMENT";
  exam_mode: CreateExamDraftPayload["exam_mode"];
  question_type: CreateExamDraftPayload["question_type"];
  num_mcq: number;
  num_structural: number;
  start_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  assignment_due_date: string;
  assignment_due_time: string;
  duration_minutes: number;
  instructions: string;
};

const allowedRoles = new Set(["TEACHER", "SCHOOL_ADMIN", "SUB_ADMIN"]);

const initialForm: FormState = {
  title: "",
  subject_id: "",
  school_class_id: "",
  topics: [],
  difficulty: "medium",
  publish_target: "EXAM",
  exam_mode: "ONLINE",
  question_type: "MCQ",
  num_mcq: 10,
  num_structural: 0,
  start_date: "",
  start_time: "",
  end_date: "",
  end_time: "",
  assignment_due_date: "",
  assignment_due_time: "",
  duration_minutes: 60,
  instructions: "",
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function questionDefaults(order: number): Partial<AIExamQuestion> {
  return {
    order,
    kind: "MCQ",
    text: "",
    options: ["", "", "", ""],
    correct_option: 0,
    marks: 1,
    explanation: "",
    expected_answer: "",
    marking_guide: "",
  };
}

export default function AIExamGeneratorPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();
  const schoolId = user?.school?.id || user?.school_id || "";
  const [form, setForm] = useState<FormState>(initialForm);
  const [topicInput, setTopicInput] = useState("");
  const [draftId, setDraftId] = useState<string>("");
  const [editing, setEditing] = useState<Record<string, Partial<AIExamQuestion>>>({});
  const [manualQuestion, setManualQuestion] = useState<Partial<AIExamQuestion>>(questionDefaults(1));

  const canAccess = Boolean(user?.role && allowedRoles.has(user.role));

  const subjectsQuery = useQuery({
    queryKey: ["ai-subjects", schoolId],
    enabled: canAccess,
    queryFn: async () => {
      const { data } = await apiClient.get<PaginatedResponse<SubjectOption>>(API.GRADES.SUBJECTS, {
        params: schoolId ? { school: schoolId } : undefined,
      });
      return data.results ?? [];
    },
  });

  const classesQuery = useQuery({
    queryKey: ["ai-school-classes", schoolId],
    enabled: Boolean(canAccess && schoolId),
    queryFn: async () => {
      const { data } = await apiClient.get<ClassOption[]>(API.SCHOOLS.CLASSES(schoolId));
      return Array.isArray(data) ? data : (data as unknown as { results?: ClassOption[] }).results ?? [];
    },
  });

  const draftQuery = useQuery({
    queryKey: ["ai-exam-draft", draftId],
    enabled: Boolean(draftId),
    queryFn: () => aiService.getExamDraft(draftId),
    refetchInterval: (query) => {
      const draft = query.state.data as AIExamDraftDetail | undefined;
      if (!draft || draft.status === "FAILED") return false;
      return draft.questions?.length ? false : 2000;
    },
  });

  const createDraft = useMutation({
    mutationFn: (payload: CreateExamDraftPayload) => aiService.createExamDraft(payload),
    onSuccess: (draft) => {
      setDraftId(draft.id);
      if (draft.status === "FAILED") {
        toast({
          variant: "destructive",
          title: "Generation failed",
          description: draft.generation_error || "The AI could not generate questions for this draft.",
        });
        return;
      }
      if (draft.questions?.length) {
        toast({ title: "Questions ready", description: "EduIgnite AI generated the draft questions for teacher review." });
        return;
      }
      toast({ title: "AI generation started", description: "EduIgnite AI is crafting the questions for teacher review." });
    },
    onError: (error) => {
      toast({ variant: "destructive", title: "Generation failed", description: getApiErrorMessage(error, "The exam draft could not be created.") });
    },
  });

  const editQuestion = useMutation({
    mutationFn: ({ questionId, payload }: { questionId: string; payload: Partial<AIExamQuestion> }) =>
      aiService.editExamQuestion(draftId, questionId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["ai-exam-draft", draftId] });
      toast({ title: "Question saved", description: "The edited question is stored in the draft." });
    },
    onError: (error) => toast({ variant: "destructive", title: "Save failed", description: getApiErrorMessage(error, "The question could not be saved.") }),
  });

  const deleteQuestion = useMutation({
    mutationFn: (questionId: string) => aiService.deleteExamQuestion(draftId, questionId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["ai-exam-draft", draftId] }),
  });

  const addQuestion = useMutation({
    mutationFn: (payload: Partial<AIExamQuestion>) => aiService.addExamQuestion(draftId, payload),
    onSuccess: () => {
      setManualQuestion(questionDefaults((draftQuery.data?.questions?.length ?? 0) + 2));
      void queryClient.invalidateQueries({ queryKey: ["ai-exam-draft", draftId] });
      toast({ title: "Manual question added" });
    },
    onError: (error) => toast({ variant: "destructive", title: "Question not added", description: getApiErrorMessage(error, "Check the question fields and try again.") }),
  });

  const reviewDraft = useMutation({
    mutationFn: () => aiService.reviewExamDraft(draftId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["ai-exam-draft", draftId] });
      toast({ title: "Draft reviewed", description: "The question bank has been updated with reviewed questions." });
    },
  });

  const publishDraft = useMutation({
    mutationFn: () => aiService.publishExamDraft(draftId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["ai-exam-draft", draftId] });
      toast({
        title: currentDraft?.publish_target === "ASSIGNMENT" ? "Assignment published" : "Exam published",
        description: currentDraft?.publish_target === "ASSIGNMENT"
          ? "The reviewed AI draft is now visible to students as an assignment."
          : "The reviewed AI draft is now a scheduled exam.",
      });
    },
    onError: (error) => toast({ variant: "destructive", title: "Publish failed", description: getApiErrorMessage(error, "The exam could not be published.") }),
  });

  const regenerateDraft = useMutation({
    mutationFn: () => aiService.regenerateExamDraft(draftId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["ai-exam-draft", draftId] });
      toast({ title: "Regeneration started" });
    },
  });

  const groupedClasses = useMemo(() => {
    return (classesQuery.data ?? []).reduce<Record<string, ClassOption[]>>((groups, item) => {
      const group = item.sub_school_name || item.sub_school?.name || "Main";
      groups[group] = [...(groups[group] || []), item];
      return groups;
    }, {});
  }, [classesQuery.data]);

  if (!canAccess) {
    return (
      <Card className="border-none shadow-lg">
        <CardHeader>
          <CardTitle>Access denied</CardTitle>
          <CardDescription>AI exam and assignment generation is reserved for teachers, school admins, and sub admins.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild><Link href="/dashboard/exams">Back to Exams</Link></Button>
        </CardContent>
      </Card>
    );
  }

  const currentDraft = draftQuery.data;
  const canExport = Boolean(currentDraft?.questions?.length);
  const manualKind = manualQuestion.kind ?? "MCQ";
  const manualOptions = manualQuestion.options ?? ["", "", "", ""];
  const manualCanSave = Boolean(
    manualQuestion.text?.trim()
      && (manualKind !== "MCQ" || manualOptions.length === 4 && manualOptions.every((option) => option.trim()))
  );

  const submit = () => {
    if (!form.title.trim() || !form.subject_id || !form.school_class_id) {
      toast({ variant: "destructive", title: "Missing setup fields", description: "Select a title, subject, and class before generating." });
      return;
    }
    let durationMinutes = form.duration_minutes;
    let startTime: string | null = null;
    let assignmentDueDate: string | null = null;
    if (form.publish_target === "EXAM") {
      if (!form.start_date || !form.start_time || !form.end_date || !form.end_time) {
        toast({ variant: "destructive", title: "Missing exam schedule", description: "Set the exact start and end date/time before generating." });
        return;
      }
      const startDate = new Date(`${form.start_date}T${form.start_time}`);
      const endDate = new Date(`${form.end_date}T${form.end_time}`);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
        toast({ variant: "destructive", title: "Invalid exam schedule", description: "The exam end date and time must be after the start date and time." });
        return;
      }
      startTime = startDate.toISOString();
      durationMinutes = Math.max(5, Math.round((endDate.getTime() - startDate.getTime()) / 60000));
    } else {
      if (!form.assignment_due_date || !form.assignment_due_time) {
        toast({ variant: "destructive", title: "Missing assignment deadline", description: "Set the latest submission date and time before generating." });
        return;
      }
      const dueDate = new Date(`${form.assignment_due_date}T${form.assignment_due_time}`);
      if (Number.isNaN(dueDate.getTime()) || dueDate <= new Date()) {
        toast({ variant: "destructive", title: "Invalid assignment deadline", description: "The assignment deadline must be in the future." });
        return;
      }
      assignmentDueDate = dueDate.toISOString();
    }
    createDraft.mutate({
      title: form.title,
      subject_id: form.subject_id,
      school_class_id: form.school_class_id,
      topics: form.topics.join(", "),
      difficulty: form.difficulty,
      publish_target: form.publish_target,
      exam_mode: form.exam_mode,
      question_type: form.question_type,
      instructions: form.instructions.trim(),
      num_mcq: form.question_type === "STRUCTURAL" ? 0 : form.num_mcq,
      num_structural: form.question_type === "MCQ" ? 0 : form.num_structural,
      start_time: startTime,
      assignment_due_date: assignmentDueDate,
      duration_minutes: durationMinutes,
    });
  };

  const saveQuestion = (question: AIExamQuestion) => {
    const patch = editing[question.id] ?? question;
    editQuestion.mutate({ questionId: question.id, payload: patch });
  };

  const handleExport = async (format: "pdf" | "docx") => {
    if (!currentDraft?.id) return;
    try {
      const blob = format === "pdf"
        ? await aiService.exportExamPDF(currentDraft.id)
        : await aiService.exportExamDocx(currentDraft.id);
      downloadBlob(blob, `${currentDraft.title}.${format}`);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Download failed",
        description: getApiErrorMessage(error, "The generated questions could not be downloaded right now."),
      });
    }
  };

  return (
    <div className="space-y-6 pb-16">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="rounded-full" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-black text-primary">
              <Sparkles className="h-7 w-7 text-secondary" />
              AI Exam Generator
            </h1>
            <p className="text-muted-foreground">Generate, review, edit, export, then publish only after teacher approval.</p>
          </div>
        </div>
        <Button asChild variant="outline"><Link href="/dashboard/exams/question-bank">Question Bank</Link></Button>
      </div>

      {!currentDraft ? (
        <Card className="border-none shadow-lg">
          <CardHeader>
            <CardTitle>Setup</CardTitle>
            <CardDescription>Choose the class, subject, and question structure for the AI draft.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>Exam Title</Label>
              <Input value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="Sequence 3 Mathematics Practice" />
            </div>
            <div className="space-y-2">
              <Label>Subject</Label>
              <Select value={form.subject_id} onValueChange={(value) => setForm((prev) => ({ ...prev, subject_id: value }))}>
                <SelectTrigger><SelectValue placeholder={subjectsQuery.isLoading ? "Loading subjects..." : "Choose subject"} /></SelectTrigger>
                <SelectContent>{(subjectsQuery.data ?? []).map((subject) => <SelectItem key={subject.id} value={subject.id}>{subject.name}</SelectItem>)}</SelectContent>
              </Select>
              {subjectsQuery.isError ? <p className="text-sm text-destructive">Subjects could not be loaded.</p> : null}
            </div>
            <div className="space-y-2">
              <Label>Class</Label>
              <Select value={form.school_class_id} onValueChange={(value) => setForm((prev) => ({ ...prev, school_class_id: value }))}>
                <SelectTrigger><SelectValue placeholder={classesQuery.isLoading ? "Loading classes..." : "Choose class"} /></SelectTrigger>
                <SelectContent>
                  {Object.entries(groupedClasses).map(([group, items]) => (
                    <SelectGroup key={group}>
                      <SelectLabel>{group}</SelectLabel>
                      {items.map((schoolClass) => <SelectItem key={schoolClass.id} value={schoolClass.id}>{schoolClass.name}</SelectItem>)}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              {classesQuery.isError ? <p className="text-sm text-destructive">Classes could not be loaded.</p> : null}
            </div>
            <div className="space-y-2">
              <Label>Publish As</Label>
              <Select
                value={form.publish_target}
                onValueChange={(value: "EXAM" | "ASSIGNMENT") =>
                  setForm((prev) => ({
                    ...prev,
                    publish_target: value,
                    question_type: value === "EXAM" && prev.exam_mode === "ONLINE" ? "MCQ" : prev.question_type,
                  }))
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="EXAM">Exam</SelectItem><SelectItem value="ASSIGNMENT">Assignment</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Difficulty</Label>
              <Select value={form.difficulty} onValueChange={(value: FormState["difficulty"]) => setForm((prev) => ({ ...prev, difficulty: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["easy", "medium", "hard", "mixed"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{form.publish_target === "ASSIGNMENT" ? "Question Delivery" : "Exam Mode"}</Label>
              <Select value={form.exam_mode} onValueChange={(value: FormState["exam_mode"]) => setForm((prev) => ({ ...prev, exam_mode: value, question_type: form.publish_target === "EXAM" && value === "ONLINE" ? "MCQ" : prev.question_type }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="ONLINE">Online</SelectItem><SelectItem value="ONSITE">On-site Printable</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Question Type</Label>
              <Select value={form.question_type} onValueChange={(value: FormState["question_type"]) => setForm((prev) => ({ ...prev, question_type: value }))} disabled={form.publish_target === "EXAM" && form.exam_mode === "ONLINE"}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="MCQ">MCQ Only</SelectItem><SelectItem value="STRUCTURAL">Structural Only</SelectItem><SelectItem value="MIXED">Mixed</SelectItem></SelectContent>
              </Select>
            </div>
            {form.question_type !== "STRUCTURAL" ? (
              <div className="space-y-2"><Label>MCQ Questions</Label><Input type="number" min={5} max={50} value={form.num_mcq} onChange={(event) => setForm((prev) => ({ ...prev, num_mcq: Number(event.target.value) }))} /></div>
            ) : null}
            {form.question_type !== "MCQ" ? (
              <div className="space-y-2"><Label>Structural Questions</Label><Input type="number" min={1} max={20} value={form.num_structural} onChange={(event) => setForm((prev) => ({ ...prev, num_structural: Number(event.target.value) }))} /></div>
            ) : null}
            {form.publish_target === "EXAM" ? (
              <>
                <div className="space-y-2"><Label>Start Date</Label><Input type="date" value={form.start_date} onChange={(event) => setForm((prev) => ({ ...prev, start_date: event.target.value }))} /></div>
                <div className="space-y-2"><Label>Start Time</Label><Input type="time" value={form.start_time} onChange={(event) => setForm((prev) => ({ ...prev, start_time: event.target.value }))} /></div>
                <div className="space-y-2"><Label>End Date</Label><Input type="date" value={form.end_date} onChange={(event) => setForm((prev) => ({ ...prev, end_date: event.target.value }))} /></div>
                <div className="space-y-2"><Label>End Time</Label><Input type="time" value={form.end_time} onChange={(event) => setForm((prev) => ({ ...prev, end_time: event.target.value }))} /></div>
              </>
            ) : (
              <>
                <div className="space-y-2"><Label>Latest Submission Date</Label><Input type="date" value={form.assignment_due_date} onChange={(event) => setForm((prev) => ({ ...prev, assignment_due_date: event.target.value }))} /></div>
                <div className="space-y-2"><Label>Latest Submission Time</Label><Input type="time" value={form.assignment_due_time} onChange={(event) => setForm((prev) => ({ ...prev, assignment_due_time: event.target.value }))} /></div>
              </>
            )}
            <div className="space-y-2 md:col-span-2">
              <Label>Topics</Label>
              <div className="flex gap-2">
                <Input value={topicInput} onChange={(event) => setTopicInput(event.target.value)} onKeyDown={(event) => {
                  if (event.key === "Enter" && topicInput.trim()) {
                    event.preventDefault();
                    setForm((prev) => ({ ...prev, topics: [...prev.topics, topicInput.trim()] }));
                    setTopicInput("");
                  }
                }} placeholder="Type topic and press Enter" />
                <Button type="button" variant="outline" onClick={() => {
                  if (!topicInput.trim()) return;
                  setForm((prev) => ({ ...prev, topics: [...prev.topics, topicInput.trim()] }));
                  setTopicInput("");
                }}>Add</Button>
              </div>
              <div className="flex flex-wrap gap-2">{form.topics.map((topic) => <Badge key={topic} variant="secondary">{topic}</Badge>)}</div>
            </div>
            <div className="space-y-2 md:col-span-2"><Label>Instructions</Label><Textarea value={form.instructions} onChange={(event) => setForm((prev) => ({ ...prev, instructions: event.target.value }))} /></div>
            <div className="md:col-span-2">
              <Button className="h-12 gap-2 rounded-xl px-6" onClick={submit} disabled={createDraft.isPending}>
                {createDraft.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Generate {form.publish_target === "ASSIGNMENT" ? "Assignment" : "Exam"} with AI
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          <Card className="border-none shadow-lg">
            <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>{currentDraft.title}</CardTitle>
                <CardDescription>
                  {currentDraft.subject?.name} | {currentDraft.school_class?.name} | {currentDraft.publish_target === "ASSIGNMENT" ? `Due ${currentDraft.assignment_due_date ? new Date(currentDraft.assignment_due_date).toLocaleString() : "not set"}` : `${currentDraft.duration_minutes} minutes`}
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge>{currentDraft.status}</Badge>
                {draftQuery.isFetching && !currentDraft.questions?.length ? <Badge variant="secondary">Generating...</Badge> : null}
              </div>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => regenerateDraft.mutate()} disabled={regenerateDraft.isPending}><RefreshCw className="mr-2 h-4 w-4" />Regenerate All</Button>
              <Button onClick={() => reviewDraft.mutate()} disabled={reviewDraft.isPending || !currentDraft.questions?.length || currentDraft.status === "REVIEWED" || currentDraft.status === "PUBLISHED"}><Save className="mr-2 h-4 w-4" />Mark as Reviewed</Button>
              <Button onClick={() => publishDraft.mutate()} disabled={publishDraft.isPending || currentDraft.status !== "REVIEWED"}><Send className="mr-2 h-4 w-4" />Publish {currentDraft.publish_target === "ASSIGNMENT" ? "Assignment" : "Exam"}</Button>
              <Button variant="outline" disabled={!canExport} onClick={() => handleExport("pdf")}><Download className="mr-2 h-4 w-4" />PDF</Button>
              <Button variant="outline" disabled={!canExport} onClick={() => handleExport("docx")}><FileText className="mr-2 h-4 w-4" />Word</Button>
            </CardContent>
          </Card>

          {currentDraft.status === "FAILED" ? <Card className="border-destructive/30"><CardContent className="p-5 text-destructive">{currentDraft.generation_error || "AI generation failed."}</CardContent></Card> : null}

          {!currentDraft.questions?.length && currentDraft.status !== "FAILED" ? (
            <Card><CardContent className="flex items-center gap-3 p-6 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> EduIgnite AI is crafting your exam questions...</CardContent></Card>
          ) : null}

          {currentDraft.questions?.map((question) => {
            const value = { ...question, ...(editing[question.id] ?? {}) };
            return (
              <Card key={question.id} className="border-none shadow-md">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Question {question.order}</CardTitle>
                  <div className="flex gap-2">{question.is_edited ? <Badge variant="secondary">Edited</Badge> : null}<Badge>{question.kind}</Badge></div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea value={value.text ?? ""} onChange={(event) => setEditing((prev) => ({ ...prev, [question.id]: { ...prev[question.id], text: event.target.value } }))} />
                  {value.kind === "MCQ" ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      {(value.options ?? ["", "", "", ""]).map((option, optionIndex) => (
                        <Input key={optionIndex} value={option} onChange={(event) => {
                          const nextOptions = [...(value.options ?? ["", "", "", ""])];
                          nextOptions[optionIndex] = event.target.value;
                          setEditing((prev) => ({ ...prev, [question.id]: { ...prev[question.id], options: nextOptions } }));
                        }} placeholder={`Option ${String.fromCharCode(65 + optionIndex)}`} />
                      ))}
                    </div>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                      <Textarea value={value.expected_answer ?? ""} onChange={(event) => setEditing((prev) => ({ ...prev, [question.id]: { ...prev[question.id], expected_answer: event.target.value } }))} placeholder="Expected answer" />
                      <Textarea value={value.marking_guide ?? ""} onChange={(event) => setEditing((prev) => ({ ...prev, [question.id]: { ...prev[question.id], marking_guide: event.target.value } }))} placeholder="Marking guide" />
                    </div>
                  )}
                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="space-y-2"><Label>Kind</Label><Select value={value.kind} onValueChange={(kind: AIExamQuestion["kind"]) => setEditing((prev) => ({ ...prev, [question.id]: { ...prev[question.id], kind } }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["MCQ", "THEORY", "PROBLEM", "ESSAY", "PRACTICAL"].map((kind) => <SelectItem key={kind} value={kind}>{kind}</SelectItem>)}</SelectContent></Select></div>
                    <div className="space-y-2"><Label>Correct</Label><Select value={String(value.correct_option ?? 0)} onValueChange={(correct) => setEditing((prev) => ({ ...prev, [question.id]: { ...prev[question.id], correct_option: Number(correct) } }))} disabled={value.kind !== "MCQ"}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[0, 1, 2, 3].map((option) => <SelectItem key={option} value={String(option)}>{String.fromCharCode(65 + option)}</SelectItem>)}</SelectContent></Select></div>
                    <div className="space-y-2"><Label>Marks</Label><Input type="number" min={1} value={value.marks ?? 1} onChange={(event) => setEditing((prev) => ({ ...prev, [question.id]: { ...prev[question.id], marks: Number(event.target.value || "1") } }))} /></div>
                    <div className="flex items-end gap-2"><Button onClick={() => saveQuestion(question)} disabled={editQuestion.isPending}><Save className="mr-2 h-4 w-4" />Save</Button><Button variant="destructive" size="icon" onClick={() => deleteQuestion.mutate(question.id)}><Trash2 className="h-4 w-4" /></Button></div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          <Card className="border-dashed">
            <CardHeader><CardTitle>Add Manual Question</CardTitle><CardDescription>Add teacher-written content to the current AI draft.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <Textarea value={manualQuestion.text ?? ""} onChange={(event) => setManualQuestion((prev) => ({ ...prev, text: event.target.value }))} placeholder="Question text" />
              {manualKind === "MCQ" ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {manualOptions.map((option, optionIndex) => (
                    <Input
                      key={optionIndex}
                      value={option}
                      onChange={(event) => {
                        const nextOptions = [...manualOptions];
                        nextOptions[optionIndex] = event.target.value;
                        setManualQuestion((prev) => ({ ...prev, options: nextOptions }));
                      }}
                      placeholder={`Option ${String.fromCharCode(65 + optionIndex)}`}
                    />
                  ))}
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  <Textarea value={manualQuestion.expected_answer ?? ""} onChange={(event) => setManualQuestion((prev) => ({ ...prev, expected_answer: event.target.value }))} placeholder="Expected answer" />
                  <Textarea value={manualQuestion.marking_guide ?? ""} onChange={(event) => setManualQuestion((prev) => ({ ...prev, marking_guide: event.target.value }))} placeholder="Marking guide" />
                </div>
              )}
              <div className="grid gap-3 md:grid-cols-4">
                <Select value={manualQuestion.kind ?? "MCQ"} onValueChange={(kind: AIExamQuestion["kind"]) => setManualQuestion((prev) => ({ ...prev, kind }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["MCQ", "THEORY", "PROBLEM", "ESSAY", "PRACTICAL"].map((kind) => <SelectItem key={kind} value={kind}>{kind}</SelectItem>)}</SelectContent></Select>
                <Select value={String(manualQuestion.correct_option ?? 0)} onValueChange={(correct) => setManualQuestion((prev) => ({ ...prev, correct_option: Number(correct) }))} disabled={manualKind !== "MCQ"}><SelectTrigger><SelectValue placeholder="Correct" /></SelectTrigger><SelectContent>{[0, 1, 2, 3].map((option) => <SelectItem key={option} value={String(option)}>{String.fromCharCode(65 + option)}</SelectItem>)}</SelectContent></Select>
                <Input type="number" min={1} value={manualQuestion.marks ?? 1} onChange={(event) => setManualQuestion((prev) => ({ ...prev, marks: Number(event.target.value || "1") }))} />
                <Button className="gap-2" onClick={() => addQuestion.mutate(manualQuestion)} disabled={!manualCanSave || addQuestion.isPending}>{addQuestion.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save Manual Question</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
