"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCheck, CheckCircle2, Clock, CloudOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n-context";
import { useDailyRoster, useSubmitDailyRegister } from "@/lib/hooks/useAttendance";
import type { DailyAttendanceStatus } from "@/lib/api/types";
import type { DailyRegisterClassOption } from "@/components/attendance/daily-register";

/**
 * One-screen daily register for a basic-school class teacher: one row per pupil,
 * big Present / Absent / Sick / Late buttons, every tap saved at once.
 * "Sick" is stored as an excused absence with the note "Sick", so the reports
 * and report cards that already count excused days need no change.
 */
type Choice = "present" | "absent" | "sick" | "late";

const SICK_NOTE = "Sick";

const CHOICES: Array<{ value: Choice; en: string; fr: string; active: string }> = [
  { value: "present", en: "Present", fr: "Présent", active: "bg-emerald-600 text-white border-emerald-600" },
  { value: "absent", en: "Absent", fr: "Absent", active: "bg-red-600 text-white border-red-600" },
  { value: "sick", en: "Sick", fr: "Malade", active: "bg-sky-600 text-white border-sky-600" },
  { value: "late", en: "Late", fr: "En retard", active: "bg-amber-500 text-white border-amber-500" },
];

function todayISO() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toChoice(status: DailyAttendanceStatus | null | undefined): Choice | null {
  if (!status) return null;
  return status === "excused" ? "sick" : status;
}

function toPayload(choice: Choice): { status: DailyAttendanceStatus; excuse_note?: string } {
  if (choice === "sick") return { status: "excused", excuse_note: SICK_NOTE };
  return { status: choice };
}

function describeError(error: any, fr: boolean): string {
  const status = error?.response?.status;
  if (status === 403) {
    return fr ? "Vous n'êtes pas responsable de cette classe." : "You are not responsible for this class.";
  }
  if (!error?.response) {
    return fr ? "Pas de connexion au serveur. Réessayez." : "Could not reach the server. Try again.";
  }
  return fr ? "Le changement n'a pas été enregistré. Réessayez." : "The change was not saved. Try again.";
}

export function BasicDailyRegister({ classes }: { classes: DailyRegisterClassOption[] }) {
  const { language } = useI18n();
  const fr = language === "fr";
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [marks, setMarks] = useState<Record<string, Choice | null>>({});
  const [showLate, setShowLate] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [queued, setQueued] = useState(false);
  const inFlight = useRef(0);

  const roster = useDailyRoster(classId, date);
  const submit = useSubmitDailyRegister();
  const learners = roster.data?.learners;

  useEffect(() => {
    if (!classes.length) {
      setClassId("");
      return;
    }
    setClassId((current) => (current && classes.some((c) => c.id === current) ? current : classes[0].id));
  }, [classes]);

  useEffect(() => {
    setMarks({});
    setShowLate(false);
    setErrorMessage("");
    setQueued(false);
  }, [classId, date]);

  // Take the server copy, except while a tap is still being saved or waiting offline.
  useEffect(() => {
    if (!learners || inFlight.current > 0 || queued) return;
    const next: Record<string, Choice | null> = {};
    learners.forEach((learner) => {
      next[learner.student] = toChoice(learner.status);
    });
    setMarks(next);
  }, [learners, queued]);

  const stats = useMemo(() => {
    const tally = { present: 0, absent: 0, sick: 0, late: 0, unmarked: 0 };
    (learners || []).forEach((learner) => {
      const choice = marks[learner.student];
      if (choice) tally[choice] += 1;
      else tally.unmarked += 1;
    });
    const total = learners?.length || 0;
    // Present and late both count as attending, as everywhere else in EduIgnite.
    const percent = total ? Math.round(((tally.present + tally.late) / total) * 100) : 0;
    return { ...tally, total, percent };
  }, [learners, marks]);

  const save = async (
    records: Array<{ student: string; status: DailyAttendanceStatus; excuse_note?: string }>,
    markAllPresent = false,
  ) => {
    if (!classId) return;
    inFlight.current += 1;
    setErrorMessage("");
    try {
      const result = await submit.mutateAsync({
        school_class: classId,
        date,
        records,
        ...(markAllPresent ? { mark_all_present: true } : {}),
      });
      setQueued(Boolean(result.queued));
    } catch (error: any) {
      setErrorMessage(describeError(error, fr));
      // Put back what the server really has.
      setQueued(false);
      roster.refetch();
    } finally {
      inFlight.current -= 1;
    }
  };

  const choose = (student: string, choice: Choice) => {
    setMarks((current) => ({ ...current, [student]: choice }));
    void save([{ student, ...toPayload(choice) }]);
  };

  const markAllPresent = () => {
    setMarks((current) => {
      const next = { ...current };
      (learners || []).forEach((learner) => {
        if (!next[learner.student]) next[learner.student] = "present";
      });
      return next;
    });
    void save([], true);
  };

  const label = (choice: (typeof CHOICES)[number]) => (fr ? choice.fr : choice.en);
  const presentLearners = (learners || []).filter((l) => marks[l.student] === "present");

  return (
    <div className="space-y-4">
      <div className="bg-white p-4 rounded-3xl border shadow-sm grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase">{fr ? "Classe" : "Class"}</Label>
          <Select value={classId} onValueChange={setClassId} disabled={!classes.length}>
            <SelectTrigger className="h-12">
              <SelectValue placeholder={classes.length ? (fr ? "Choisir la classe" : "Select class") : (fr ? "Aucune classe" : "No classes available")} />
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

      {roster.data?.fromCache && (
        <div className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
          <CloudOff className="h-4 w-4 shrink-0" />
          {fr ? "Hors ligne : liste enregistrée sur cet appareil." : "You are offline. This is the last list saved on this device."}
        </div>
      )}

      {roster.isError && (
        <div className="flex items-start gap-2 rounded-2xl bg-red-50 border border-red-200 p-4 text-sm text-red-800">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          {fr ? "Impossible de charger la liste de la classe." : "Could not load the class list."}
        </div>
      )}

      {roster.isLoading && classId && (
        <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> {fr ? "Chargement..." : "Loading pupils..."}
        </div>
      )}

      {learners && learners.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-10">
          {fr ? "Aucun élève dans cette classe." : "There are no pupils in this class yet."}
        </p>
      )}

      {learners && learners.length > 0 && (
        <>
          <div className="bg-white rounded-3xl border shadow-sm p-4 space-y-3" aria-live="polite">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase text-muted-foreground">
                  {fr ? "Présence du jour" : "Present today"}
                </p>
                <p className="text-4xl font-black text-emerald-700">{stats.percent}%</p>
              </div>
              <div className="text-right text-xs font-bold space-y-0.5">
                <p className="text-emerald-700">{stats.present + stats.late} / {stats.total} {fr ? "présents" : "here"}</p>
                <p className="text-red-700">{stats.absent} {fr ? "absents" : "absent"} · {stats.sick} {fr ? "malades" : "sick"}</p>
                <p className="text-amber-700">{stats.late} {fr ? "en retard" : "late"}</p>
                {stats.unmarked > 0 && (
                  <p className="text-muted-foreground">{stats.unmarked} {fr ? "non marqués" : "not marked yet"}</p>
                )}
              </div>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-emerald-600 transition-all" style={{ width: `${stats.percent}%` }} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button type="button" className="h-14 gap-2 text-base font-bold" onClick={markAllPresent}>
                <CheckCheck className="h-5 w-5" /> {fr ? "Tous présents" : "Mark all present"}
              </Button>
              <Button
                type="button"
                variant={showLate ? "default" : "outline"}
                className="h-14 gap-2 text-base font-bold"
                onClick={() => setShowLate((v) => !v)}
                aria-expanded={showLate}
              >
                <Clock className="h-5 w-5" /> {fr ? "Retards du jour" : "Late today"}
              </Button>
            </div>
            {showLate && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 space-y-2">
                <p className="text-sm font-bold text-amber-900">
                  {fr ? "Touchez les élèves arrivés en retard" : "Tap the pupils who arrived late"}
                </p>
                {presentLearners.length === 0 ? (
                  <p className="text-xs text-amber-800">
                    {fr ? "Marquez d'abord les élèves présents." : "Mark pupils present first."}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {presentLearners.map((learner) => (
                      <button
                        key={learner.student}
                        type="button"
                        onClick={() => choose(learner.student, "late")}
                        className="min-h-11 rounded-full border border-amber-400 bg-white px-4 text-sm font-bold text-amber-900 hover:bg-amber-100"
                      >
                        {learner.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {errorMessage && (
              <div role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /> {errorMessage}
              </div>
            )}
            {queued ? (
              <p role="status" className="flex items-center gap-2 text-xs text-amber-800">
                <CloudOff className="h-4 w-4" />
                {fr ? "Enregistré sur cet appareil, envoi dès le retour du réseau." : "Saved on this device. Sent when you are back online."}
              </p>
            ) : (
              <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
                {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                {submit.isPending ? (fr ? "Enregistrement..." : "Saving...") : (fr ? "Chaque touche est enregistrée automatiquement." : "Every tap is saved automatically.")}
              </p>
            )}
          </div>

          <ul className="space-y-3">
            {learners.map((learner) => {
              const current = marks[learner.student] ?? null;
              return (
                <li key={learner.student} className="bg-white rounded-2xl border shadow-sm p-3 space-y-2">
                  <p className="font-bold text-sm">{learner.name}</p>
                  <div className="grid grid-cols-4 gap-2" role="group" aria-label={learner.name}>
                    {CHOICES.map((choice) => (
                      <button
                        key={choice.value}
                        type="button"
                        aria-pressed={current === choice.value}
                        onClick={() => choose(learner.student, choice.value)}
                        className={cn(
                          "min-h-12 rounded-xl border text-xs sm:text-sm font-bold transition-colors",
                          current === choice.value ? choice.active : "bg-white text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {label(choice)}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
