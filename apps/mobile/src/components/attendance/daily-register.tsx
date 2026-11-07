"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCheck, CheckCircle2, CloudOff, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useDailyRoster, useSubmitDailyRegister } from "@/lib/hooks/useAttendance";
import type { DailyAttendanceStatus } from "@/lib/api/types";

export interface DailyRegisterClassOption {
  id: string;
  name: string;
}

const STATUSES: Array<{ value: DailyAttendanceStatus; label: string; active: string }> = [
  { value: "present", label: "Present", active: "bg-emerald-600 text-white border-emerald-600" },
  { value: "absent", label: "Absent", active: "bg-red-600 text-white border-red-600" },
  { value: "late", label: "Late", active: "bg-amber-500 text-white border-amber-500" },
  { value: "excused", label: "Excused", active: "bg-sky-600 text-white border-sky-600" },
];

function todayISO() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Turns a failed save into a sentence the teacher can act on. */
function describeSaveError(error: any): string {
  const status = error?.response?.status;
  const data = error?.response?.data;
  const pick = (value: unknown): string => {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.map(pick).filter(Boolean).join(" ");
    if (typeof value === "object") return Object.values(value as object).map(pick).filter(Boolean).join(" ");
    return "";
  };
  const detail = pick(data?.detail) || pick(data);
  if (status === 403) {
    return detail || "You are not responsible for this class, so you cannot take its register.";
  }
  if (status === 400) {
    return detail || "The register was not accepted. Check the class, the date and the pupils, then try again.";
  }
  if (!error?.response) return "Could not reach the server. Check your connection and try again.";
  return detail || "The register could not be saved. Please try again.";
}

export function DailyRegister({ classes }: { classes: DailyRegisterClassOption[] }) {
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [marks, setMarks] = useState<Record<string, DailyAttendanceStatus>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [outcome, setOutcome] = useState<null | "saved" | "queued">(null);
  const [errorMessage, setErrorMessage] = useState("");

  const roster = useDailyRoster(classId, date);
  const submit = useSubmitDailyRegister();

  // Keep a valid class selected as the list of classes loads or changes.
  useEffect(() => {
    if (!classes.length) {
      setClassId("");
      return;
    }
    setClassId((current) => (current && classes.some((c) => c.id === current) ? current : classes[0].id));
  }, [classes]);

  // A different class or day is a different register.
  useEffect(() => {
    setMarks({});
    setNotes({});
    setDirty(false);
    setOutcome(null);
    setErrorMessage("");
  }, [classId, date]);

  // Seed the marks from the server, never over edits the teacher has made.
  const learners = roster.data?.learners;
  useEffect(() => {
    if (!learners || dirty) return;
    const nextMarks: Record<string, DailyAttendanceStatus> = {};
    const nextNotes: Record<string, string> = {};
    learners.forEach((learner) => {
      nextMarks[learner.student] = learner.status ?? "present";
      if (learner.excuse_note) nextNotes[learner.student] = learner.excuse_note;
    });
    setMarks(nextMarks);
    setNotes(nextNotes);
  }, [learners, dirty]);

  const counts = useMemo(() => {
    const tally: Record<DailyAttendanceStatus, number> = { present: 0, absent: 0, late: 0, excused: 0 };
    (learners || []).forEach((learner) => {
      tally[marks[learner.student] ?? "present"] += 1;
    });
    return tally;
  }, [learners, marks]);

  const alreadyTaken = Boolean(roster.data?.session);

  const setMark = (student: string, status: DailyAttendanceStatus) => {
    setMarks((current) => ({ ...current, [student]: status }));
    setDirty(true);
    setOutcome(null);
    setErrorMessage("");
  };

  const markAllPresent = () => {
    const all: Record<string, DailyAttendanceStatus> = {};
    (learners || []).forEach((learner) => {
      all[learner.student] = "present";
    });
    setMarks(all);
    setDirty(true);
    setOutcome(null);
    setErrorMessage("");
  };

  const save = async () => {
    if (!classId || !learners?.length) return;
    setErrorMessage("");
    try {
      const result = await submit.mutateAsync({
        school_class: classId,
        date,
        records: learners.map((learner) => {
          const status = marks[learner.student] ?? "present";
          const note = (notes[learner.student] || "").trim();
          return {
            student: learner.student,
            status,
            ...(status === "excused" && note ? { excuse_note: note } : {}),
          };
        }),
      });
      setOutcome(result.queued ? "queued" : "saved");
      // Saved for real: let the refetched server copy replace the local one.
      // Queued: keep what the teacher entered, the server has not seen it yet.
      if (!result.queued) setDirty(false);
    } catch (error: any) {
      setOutcome(null);
      setErrorMessage(describeSaveError(error));
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 sm:p-6 rounded-3xl border shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase">Class</Label>
            <Select value={classId} onValueChange={setClassId} disabled={!classes.length}>
              <SelectTrigger className="h-12">
                <SelectValue placeholder={classes.length ? "Select class" : "No classes available"} />
              </SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase">Date</Label>
            <Input
              type="date"
              className="h-12"
              value={date}
              max={todayISO()}
              onChange={(e) => e.target.value && setDate(e.target.value)}
            />
          </div>
        </div>

        {alreadyTaken && (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            The register for this day was already taken. Saving again will update it.
          </div>
        )}
        {roster.data?.fromCache && (
          <div className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
            <CloudOff className="h-4 w-4 shrink-0" />
            You are offline. This is the last class list saved on this device.
          </div>
        )}
      </div>

      {roster.isError && (
        <div className="flex items-start gap-2 rounded-2xl bg-red-50 border border-red-200 p-4 text-sm text-red-800">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-bold">Could not load the class list.</p>
            <p>{describeSaveError(roster.error)}</p>
          </div>
        </div>
      )}

      {roster.isLoading && classId && (
        <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading pupils...
        </div>
      )}

      {learners && learners.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-10">There are no pupils in this class yet.</p>
      )}

      {learners && learners.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2 text-xs font-bold">
              <Badge variant="outline">{learners.length} pupils</Badge>
              <Badge variant="outline" className="text-emerald-700">{counts.present} present</Badge>
              <Badge variant="outline" className="text-red-700">{counts.absent} absent</Badge>
              <Badge variant="outline" className="text-amber-700">{counts.late} late</Badge>
              <Badge variant="outline" className="text-sky-700">{counts.excused} excused</Badge>
            </div>
            <Button type="button" variant="outline" className="h-11 gap-2" onClick={markAllPresent}>
              <CheckCheck className="h-4 w-4" /> Mark all present
            </Button>
          </div>

          <ul className="space-y-3">
            {learners.map((learner) => {
              const status = marks[learner.student] ?? "present";
              return (
                <li key={learner.student} className="bg-white rounded-2xl border shadow-sm p-3 sm:p-4 space-y-3">
                  <div>
                    <p className="font-bold text-sm">{learner.name}</p>
                    {learner.admission_number && (
                      <p className="text-xs text-muted-foreground">{learner.admission_number}</p>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-2" role="group" aria-label={`Attendance for ${learner.name}`}>
                    {STATUSES.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={status === option.value}
                        onClick={() => setMark(learner.student, option.value)}
                        className={cn(
                          "min-h-11 rounded-xl border text-xs sm:text-sm font-bold transition-colors",
                          status === option.value ? option.active : "bg-white text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  {status === "excused" && (
                    <Input
                      className="h-11"
                      placeholder="Reason (optional)"
                      value={notes[learner.student] || ""}
                      onChange={(e) => {
                        setNotes((current) => ({ ...current, [learner.student]: e.target.value }));
                        setDirty(true);
                        setOutcome(null);
                      }}
                    />
                  )}
                </li>
              );
            })}
          </ul>

          <div className="sticky bottom-0 -mx-1 bg-background/95 backdrop-blur px-1 py-3 space-y-3">
            {errorMessage && (
              <div role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /> {errorMessage}
              </div>
            )}
            {outcome === "saved" && (
              <div role="status" className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800">
                <CheckCircle2 className="h-4 w-4 shrink-0" /> Register saved. You can change a mark and save again.
              </div>
            )}
            {outcome === "queued" && (
              <div role="status" className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
                <CloudOff className="h-4 w-4 shrink-0" /> Saved on this device. It will be sent when you are back online.
              </div>
            )}
            <Button
              type="button"
              className="w-full h-12 gap-2 font-bold"
              onClick={save}
              disabled={submit.isPending || !classId}
            >
              {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {alreadyTaken || outcome ? "Save changes" : "Save register"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
