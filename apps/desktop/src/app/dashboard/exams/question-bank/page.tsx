"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Database, Loader2, Plus, Search } from "lucide-react";

import { aiService } from "@/lib/api/services/ai.service";
import { getApiErrorMessage } from "@/lib/api/errors";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import type { AIExamDraft, QuestionBankItem } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const accessRoles = new Set(["TEACHER", "SCHOOL_ADMIN", "SUB_ADMIN"]);

export default function QuestionBankPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [kind, setKind] = useState("");
  const [draftId, setDraftId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const canAccess = Boolean(user?.role && accessRoles.has(user.role));

  const bankQuery = useQuery({
    queryKey: ["question-bank", search, difficulty, kind],
    enabled: canAccess,
    queryFn: () => aiService.getQuestionBank({
      search: search || undefined,
      difficulty: difficulty || undefined,
      kind: kind || undefined,
    }),
  });

  const draftsQuery = useQuery({
    queryKey: ["question-bank-drafts"],
    enabled: canAccess,
    queryFn: () => aiService.listExamDrafts({ status: "DRAFT" }),
  });

  const importMutation = useMutation({
    mutationFn: () => aiService.importQuestionBankItems(draftId, selected),
    onSuccess: (result) => {
      toast({ title: "Questions imported", description: `${result.imported} question(s) added to the draft.` });
      setSelected([]);
    },
    onError: (error) => toast({ variant: "destructive", title: "Import failed", description: getApiErrorMessage(error, "Could not import the selected questions.") }),
  });

  const questions = useMemo(() => bankQuery.data?.results ?? [], [bankQuery.data]);
  const drafts = useMemo(() => draftsQuery.data?.results ?? [], [draftsQuery.data]);

  const toggle = (item: QuestionBankItem) => {
    setSelected((prev) => prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id]);
  };

  if (!canAccess) {
    return (
      <Card className="border-none shadow-lg">
        <CardHeader><CardTitle>Access denied</CardTitle><CardDescription>Question Bank is available to teachers, school admins, and sub admins only.</CardDescription></CardHeader>
        <CardContent><Button asChild><Link href="/dashboard">Back to Dashboard</Link></Button></CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 pb-16">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon" className="rounded-full"><Link href="/dashboard/exams"><ArrowLeft className="h-5 w-5" /></Link></Button>
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-black text-primary"><Database className="h-7 w-7 text-secondary" />Question Bank</h1>
            <p className="text-muted-foreground">Reusable reviewed questions saved from AI exam drafts.</p>
          </div>
        </div>
        <Button asChild><Link href="/dashboard/exams/ai-generator"><Plus className="mr-2 h-4 w-4" />New AI Draft</Link></Button>
      </div>

      <Card className="border-none shadow-lg">
        <CardContent className="grid gap-4 p-5 md:grid-cols-4">
          <div className="space-y-2 md:col-span-2">
            <Label>Search</Label>
            <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search question text" /></div>
          </div>
          <div className="space-y-2">
            <Label>Difficulty</Label>
            <Select value={difficulty || "all"} onValueChange={(value) => setDifficulty(value === "all" ? "" : value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="easy">Easy</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="hard">Hard</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Kind</Label>
            <Select value={kind || "all"} onValueChange={(value) => setKind(value === "all" ? "" : value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="MCQ">MCQ</SelectItem><SelectItem value="STRUCTURAL">Structural</SelectItem></SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="border-none shadow-lg">
        <CardHeader>
          <CardTitle>Import to Draft</CardTitle>
          <CardDescription>Select one or more questions, choose a draft, and import them into the review workflow.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 md:flex-row">
          <Select value={draftId || "none"} onValueChange={(value) => setDraftId(value === "none" ? "" : value)}>
            <SelectTrigger className="md:w-80"><SelectValue placeholder="Choose draft" /></SelectTrigger>
            <SelectContent><SelectItem value="none">Choose draft</SelectItem>{drafts.map((draft: AIExamDraft) => <SelectItem key={draft.id} value={draft.id}>{draft.title}</SelectItem>)}</SelectContent>
          </Select>
          <Button disabled={!draftId || !selected.length || importMutation.isPending} onClick={() => importMutation.mutate()}>
            {importMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Import {selected.length || ""} Question{selected.length === 1 ? "" : "s"}
          </Button>
        </CardContent>
      </Card>

      {bankQuery.isLoading ? <Card><CardContent className="flex items-center gap-2 p-6 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading question bank...</CardContent></Card> : null}
      {bankQuery.isError ? <Card><CardContent className="p-6 text-destructive">Could not load the question bank.</CardContent></Card> : null}
      {!bankQuery.isLoading && !questions.length ? <Card><CardContent className="p-6 text-muted-foreground">No reviewed questions have been saved yet.</CardContent></Card> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {questions.map((item) => {
          const active = selected.includes(item.id);
          return (
            <Card key={item.id} className={active ? "border-primary shadow-lg" : "border-none shadow-md"}>
              <CardHeader>
                <div className="flex flex-wrap gap-2"><Badge>{item.kind}</Badge><Badge variant="secondary">{item.difficulty}</Badge><Badge variant="outline">Used {item.use_count}</Badge></div>
                <CardTitle className="line-clamp-3 text-base">{item.text}</CardTitle>
                <CardDescription>{item.subject_name} | {item.class_level}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {item.options?.length ? <div className="space-y-1 text-sm text-muted-foreground">{item.options.map((option, index) => <p key={index}>{String.fromCharCode(65 + index)}. {option}</p>)}</div> : <p className="text-sm text-muted-foreground line-clamp-3">{item.expected_answer || item.marking_guide}</p>}
                <Button className="w-full" variant={active ? "default" : "outline"} onClick={() => toggle(item)}>{active ? "Selected" : "Select for Import"}</Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
