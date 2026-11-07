"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, CloudOff, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getApiErrorMessage } from "@/lib/api/errors";
import { useAuth } from "@/lib/auth-context";
import { useDailyRoster } from "@/lib/hooks/useAttendance";
import { useSaveTermComments, useTermComments } from "@/lib/hooks/useNursery";
import { useSchoolSettings } from "@/lib/hooks/useSchools";

export interface CommentClassOption {
  id: string;
  name: string;
}

const TERM_FROM_SETTING: Record<string, number> = { First: 1, Second: 2, Third: 3 };

function todayISO() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Class teachers write the term comment printed on each pupil's report card. */
export function TermCommentsEntry({ classes }: { classes: CommentClassOption[] }) {
  const { user } = useAuth();
  const [classId, setClassId] = useState("");
  const [term, setTerm] = useState<number | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [outcome, setOutcome] = useState<null | "saved" | "queued">(null);
  const [errorMessage, setErrorMessage] = useState("");

  const { data: settings } = useSchoolSettings(typeof user?.school?.id === "string" ? user.school.id : "");
  const academicYear = settings?.academic_year ?? "";
  const activeTerm = term ?? TERM_FROM_SETTING[settings?.term ?? ""] ?? 1;

  const roster = useDailyRoster(classId, todayISO());
  const saved = useTermComments({ class_id: classId, academic_year: academicYear, term: activeTerm });
  const save = useSaveTermComments();

  useEffect(() => {
    if (!classes.length) setClassId("");
    else setClassId((cur) => (cur && classes.some((c) => c.id === cur) ? cur : classes[0].id));
  }, [classes]);

  useEffect(() => {
    setEdits({});
    setOutcome(null);
    setErrorMessage("");
  }, [classId, activeTerm]);

  const server = useMemo(() => {
    const map: Record<string, string> = {};
    (saved.data ?? []).forEach((r) => { map[r.student] = r.teacher_comment; });
    return map;
  }, [saved.data]);

  const learners = roster.data?.learners ?? [];
  const editCount = Object.keys(edits).length;

  const change = (student: string, value: string) => {
    setEdits((e) => {
      const copy = { ...e };
      if ((server[student] ?? "") === value) delete copy[student];
      else copy[student] = value;
      return copy;
    });
    setOutcome(null);
    setErrorMessage("");
  };

  const submit = async () => {
    if (!editCount || !academicYear) return;
    setErrorMessage("");
    try {
      const result = await save.mutateAsync({
        academic_year: academicYear,
        term: activeTerm,
        comments: Object.entries(edits).map(([student, teacher_comment]) => ({ student, teacher_comment })),
      });
      setOutcome(result.queued ? "queued" : "saved");
      if (!result.queued) setEdits({});
    } catch (error) {
      setOutcome(null);
      setErrorMessage(getApiErrorMessage(error));
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 rounded-3xl border bg-white p-4 shadow-sm sm:grid-cols-3 sm:p-6">
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase">Class</Label>
          <Select value={classId} onValueChange={setClassId} disabled={!classes.length}>
            <SelectTrigger className="h-12"><SelectValue placeholder={classes.length ? "Select class" : "No classes available"} /></SelectTrigger>
            <SelectContent>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase">Term</Label>
          <Select value={String(activeTerm)} onValueChange={(v) => setTerm(Number(v))}>
            <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[1, 2, 3].map((n) => <SelectItem key={n} value={String(n)}>Term {n}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase">Academic year</Label>
          <p className="flex h-12 items-center rounded-md border bg-accent/30 px-3 text-sm">{academicYear || "Not set"}</p>
        </div>
      </div>

      {(roster.isError || saved.isError) && (
        <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4" />
          <p>Could not load {roster.isError ? "the class list" : "the saved comments"}. {getApiErrorMessage(roster.error ?? saved.error)}</p>
        </div>
      )}

      {roster.isLoading ? (
        <div className="flex min-h-[20vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary/30" /></div>
      ) : !learners.length ? (
        <p className="rounded-3xl border bg-white p-6 text-sm text-muted-foreground">No pupils in this class yet.</p>
      ) : (
        <div className="space-y-3">
          {learners.map((learner) => (
            <div key={learner.student} className="space-y-2 rounded-2xl border bg-white p-4 shadow-sm">
              <Label htmlFor={`c-${learner.student}`} className="text-sm font-bold">{learner.name}</Label>
              <Textarea
                id={`c-${learner.student}`}
                rows={2}
                maxLength={1000}
                placeholder="Comment for the report card"
                value={edits[learner.student] ?? server[learner.student] ?? ""}
                onChange={(e) => change(learner.student, e.target.value)}
              />
            </div>
          ))}
        </div>
      )}

      <div className="sticky bottom-4 flex flex-wrap items-center gap-3 rounded-2xl border bg-white p-4 shadow-lg">
        <Button onClick={submit} disabled={!editCount || !academicYear || save.isPending} className="h-11 rounded-xl">
          {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save {editCount ? `${editCount} comment${editCount > 1 ? "s" : ""}` : "comments"}
        </Button>
        {outcome === "saved" && <span className="flex items-center gap-1 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" />Saved</span>}
        {outcome === "queued" && <span className="flex items-center gap-1 text-sm text-amber-700"><CloudOff className="h-4 w-4" />Saved on this device, will send when online</span>}
        {errorMessage && <span className="text-sm text-destructive">{errorMessage}</span>}
      </div>
    </div>
  );
}
