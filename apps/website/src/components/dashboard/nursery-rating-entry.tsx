"use client";

import { schoolAdminLabel } from "@/lib/role-labels";
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, CloudOff, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { getApiErrorMessage } from "@/lib/api/errors";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { useDailyRoster } from "@/lib/hooks/useAttendance";
import { useAssessmentAreas, useAssessmentRatings, useSaveAssessmentRatings } from "@/lib/hooks/useNursery";
import { useSchoolSettings } from "@/lib/hooks/useSchools";
import type { AssessmentLabelItem } from "@/lib/api/types";

export interface NurseryClassOption {
  id: string;
  name: string;
}

const FALLBACK_SCALE: AssessmentLabelItem[] = [
  { label: "Beginning", label_fr: "Débutant" },
  { label: "Developing", label_fr: "En progrès" },
  { label: "Secure", label_fr: "Acquis" },
  { label: "Excelling", label_fr: "Excellent" },
];

// Lowest level is red-ish, highest green; works for any scale length.
const LEVEL_TONES = [
  "bg-red-600 border-red-600", "bg-orange-500 border-orange-500", "bg-amber-500 border-amber-500",
  "bg-lime-600 border-lime-600", "bg-emerald-600 border-emerald-600", "bg-teal-700 border-teal-700",
];
const toneFor = (level: number, size: number) =>
  LEVEL_TONES[size <= 1 ? 0 : Math.round(((level - 1) / (size - 1)) * (LEVEL_TONES.length - 1))];

const TERM_FROM_SETTING: Record<string, number> = { First: 1, Second: 2, Third: 3 };

function todayISO() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Teachers and admins rate each pupil of a class on every nursery developmental area. */
export function NurseryRatingEntry({ classes }: { classes: NurseryClassOption[] }) {
  const { language } = useI18n();
  const fr = language === "fr";
  const [classId, setClassId] = useState("");
  const [term, setTerm] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [edits, setEdits] = useState<Record<string, number | null>>({});
  const [outcome, setOutcome] = useState<null | "saved" | "queued">(null);
  const [errorMessage, setErrorMessage] = useState("");

  const { user } = useAuth();
  const { data: areas = [], isLoading: areasLoading } = useAssessmentAreas();
  const roster = useDailyRoster(classId, todayISO());
  const save = useSaveAssessmentRatings();

  const { data: settings } = useSchoolSettings(typeof user?.school?.id === "string" ? user.school.id : "");
  const academicYear = settings?.academic_year ?? "";
  const activeTerm = term ?? TERM_FROM_SETTING[settings?.term ?? ""] ?? 1;
  const scale = settings?.assessment_config?.nursery_scale?.length ? settings.assessment_config.nursery_scale : FALLBACK_SCALE;
  const labelOf = (item: AssessmentLabelItem) => (fr && item.label_fr ? item.label_fr : item.label);

  const ratings = useAssessmentRatings({ class_id: classId, academic_year: academicYear, term: activeTerm });

  useEffect(() => {
    if (!classes.length) setClassId("");
    else setClassId((cur) => (cur && classes.some((c) => c.id === cur) ? cur : classes[0].id));
  }, [classes]);

  // A different class or term is a different sheet.
  useEffect(() => {
    setEdits({});
    setOutcome(null);
    setErrorMessage("");
  }, [classId, activeTerm]);

  const server = useMemo(() => {
    const map: Record<string, number | null> = {};
    (ratings.data ?? []).forEach((r) => { map[`${r.student}:${r.area}`] = r.level; });
    return map;
  }, [ratings.data]);

  const levelOf = (student: string, area: string) => {
    const key = `${student}:${area}`;
    return key in edits ? edits[key] : server[key] ?? null;
  };

  const learners = (roster.data?.learners ?? []).filter((l) =>
    !search.trim() || l.name.toLowerCase().includes(search.trim().toLowerCase()) || (l.admission_number ?? "").toLowerCase().includes(search.trim().toLowerCase()));
  const activeAreas = areas.filter((a) => a.active);
  const editCount = Object.keys(edits).length;

  const rate = (student: string, area: string, level: number) => {
    const key = `${student}:${area}`;
    const current = levelOf(student, area);
    const next = current === level ? null : level; // tap again to clear (not assessed)
    setEdits((e) => {
      const copy = { ...e };
      if ((server[key] ?? null) === next) delete copy[key];
      else copy[key] = next;
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
        ratings: Object.entries(edits).map(([key, level]) => {
          const [student, area] = key.split(":");
          return { student, area, level };
        }),
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
            <SelectContent>{[1, 2, 3].map((t) => <SelectItem key={t} value={String(t)}>{fr ? `Trimestre ${t}` : `Term ${t}`}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase">Find a pupil</Label>
          <Input className="h-12" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or matricule" />
        </div>
        <p className="text-xs text-muted-foreground sm:col-span-3">
          Academic year {academicYear || "not set"}. Tap a level to rate; tap it again to clear it (not assessed).
        </p>
      </div>

      <div className="flex flex-wrap gap-2" aria-label="Rating scale">
        {scale.map((item, i) => (
          <span key={i} className="flex items-center gap-2 rounded-full border bg-white px-3 py-1 text-xs">
            <span className={cn("flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-white", toneFor(i + 1, scale.length).split(" ")[0])}>{i + 1}</span>
            {labelOf(item)}
          </span>
        ))}
      </div>

      {roster.data?.fromCache && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <CloudOff className="h-4 w-4 shrink-0" />You are offline. This is the last class list saved on this device.
        </div>
      )}
      {(roster.isError || ratings.isError) && (
        <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Could not load {roster.isError ? "the class list" : "the saved ratings"}. {getApiErrorMessage(roster.error ?? ratings.error)}</p>
        </div>
      )}

      {areasLoading || roster.isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary/30" /></div>
      ) : !activeAreas.length ? (
        <p className="rounded-2xl border bg-white p-6 text-sm text-muted-foreground">
          No developmental areas are set up yet. The {schoolAdminLabel("basic", "en")} can add them in Hierarchy &amp; Sections.
        </p>
      ) : !learners.length ? (
        <p className="rounded-2xl border bg-white p-6 text-sm text-muted-foreground">No pupils to show for this class.</p>
      ) : (
        <div className="space-y-3">
          {learners.map((learner) => (
            <div key={learner.student} className="rounded-3xl border bg-white p-4 shadow-sm">
              <p className="font-bold text-primary">
                {learner.name}
                {learner.admission_number ? <span className="ml-2 text-xs font-normal text-muted-foreground">{learner.admission_number}</span> : null}
              </p>
              <div className="mt-3 space-y-3">
                {activeAreas.map((area) => {
                  const current = levelOf(learner.student, area.id);
                  return (
                    <div key={area.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-sm">{fr && area.name_fr ? area.name_fr : area.name}</span>
                      <div className="flex flex-wrap gap-1.5" role="group" aria-label={area.name}>
                        {scale.map((item, i) => {
                          const level = i + 1;
                          const on = current === level;
                          return (
                            <button
                              key={level}
                              type="button"
                              aria-pressed={on}
                              title={labelOf(item)}
                              onClick={() => rate(learner.student, area.id, level)}
                              className={cn(
                                "min-h-10 min-w-10 rounded-xl border px-3 text-sm font-bold transition-colors",
                                on ? `${toneFor(level, scale.length)} text-white` : "bg-white text-muted-foreground hover:bg-accent",
                              )}
                            >
                              {level}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {errorMessage && (
        <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{errorMessage}
        </div>
      )}
      {outcome === "saved" && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4" />Ratings saved.
        </div>
      )}
      {outcome === "queued" && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <CloudOff className="h-4 w-4" />You are offline. The ratings are kept on this device and will be sent when you reconnect.
        </div>
      )}

      <div className="sticky bottom-4 flex justify-end">
        <Button size="lg" className="rounded-2xl shadow-lg" disabled={!editCount || save.isPending || !academicYear} onClick={submit}>
          {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save ratings{editCount ? ` (${editCount})` : ""}
        </Button>
      </div>
    </div>
  );
}
