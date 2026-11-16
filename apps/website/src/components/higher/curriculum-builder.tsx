"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useHigherAcademicPeriods,
  useHigherAcademicYears,
  useHigherCurriculum,
  useHigherCurriculumSummary,
  useHigherOfferings,
  useHigherProgrammes,
} from "@/lib/hooks/useHigherEd";
import {
  higherEdTeachingService as api,
  type CurriculumCategory,
  type HigherCourseUnit,
  type HigherCurriculumEntry,
  type HigherProgramme,
} from "@/lib/api/services/higher-ed.service";
import { LoadFailed, Loading, selectClass, useHigherRunner, useHigherText } from "./higher-shared";

const SEMESTERS = [1, 2];

function SemesterColumn({
  programme,
  yearId,
  yearLabel,
  number,
  entries,
  courseUnits,
  total,
  target,
  currentPeriodId,
  offeredUnitIds,
}: {
  programme: HigherProgramme;
  yearId: number;
  yearLabel: string;
  number: number;
  entries: HigherCurriculumEntry[];
  courseUnits: HigherCourseUnit[];
  total: number;
  target: number | null;
  currentPeriodId: number | null;
  offeredUnitIds: Set<number>;
}) {
  const tr = useHigherText();
  const { run, busy } = useHigherRunner();
  const available = courseUnits.filter((c) => !entries.some((e) => e.course_unit === c.id));
  const [pick, setPick] = useState("");
  const [category, setCategory] = useState<CurriculumCategory>("core");
  const chosen = available.some((c) => String(c.id) === pick) ? pick : String(available[0]?.id ?? "");

  async function add() {
    if (!chosen) return;
    await run(
      () =>
        api.addCurriculumEntry({
          programme: programme.id,
          programme_year: yearId,
          period_type: "semester",
          period_number: number,
          course_unit: Number(chosen),
          category,
        }),
      tr("Course unit added to the semester.", "Unité ajoutée au semestre."),
    );
  }

  async function offerAll() {
    if (!currentPeriodId) return;
    const missing = entries.filter((e) => !offeredUnitIds.has(e.course_unit));
    await run(
      async () => {
        for (const e of missing) {
          await api.createOffering({ course_unit: e.course_unit, academic_period: currentPeriodId });
        }
      },
      tr("These courses are now open for the current period.", "Ces cours sont maintenant ouverts pour la période en cours."),
    );
  }

  const off = entries.some((e) => e.credit_warning) || (target != null && entries.length > 0 && total !== target);
  const missingOfferings = entries.filter((e) => !offeredUnitIds.has(e.course_unit)).length;

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <p className="text-sm font-semibold">
        {yearLabel} · {tr(`Semester ${number}`, `Semestre ${number}`)}
      </p>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">{tr("No course units yet.", "Aucune unité pour le moment.")}</p>
      ) : (
        <ul className="space-y-1">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="font-medium">{e.course_code}</span> {e.course_title}
                <span className="block text-xs text-muted-foreground">
                  {tr(`${e.credits} credits`, `${e.credits} crédits`)} ·{" "}
                  {e.category === "core" ? tr("Core", "Obligatoire") : tr("Elective", "Optionnelle")}
                </span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  run(
                    () => api.updateCurriculumEntry(e.id, { category: e.category === "core" ? "elective" : "core" }),
                    tr("Updated.", "Modifié."),
                  )
                }
              >
                {e.category === "core" ? tr("Make elective", "Rendre optionnelle") : tr("Make core", "Rendre obligatoire")}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                disabled={busy}
                aria-label={tr("Remove", "Retirer")}
                onClick={() => run(() => api.removeCurriculumEntry(e.id), tr("Removed from the semester.", "Retirée du semestre."))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm font-medium">{tr(`Total: ${total} credits`, `Total : ${total} crédits`)}</p>
      {off ? (
        <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800">
          {tr(
            `This semester has ${total} credits. Most programmes use ${target ?? 30}. You can keep it as it is.`,
            `Ce semestre compte ${total} crédits. La plupart des programmes en ont ${target ?? 30}. Vous pouvez le laisser tel quel.`,
          )}
        </p>
      ) : null}
      {available.length > 0 ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <select className={selectClass} value={chosen} onChange={(e) => setPick(e.target.value)} aria-label={tr("Course unit", "Unité d'enseignement")}>
            {available.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.title} ({c.credits})</option>)}
          </select>
          <select className={`${selectClass} sm:w-36`} value={category} onChange={(e) => setCategory(e.target.value as CurriculumCategory)} aria-label={tr("Type", "Type")}>
            <option value="core">{tr("Core", "Obligatoire")}</option>
            <option value="elective">{tr("Elective", "Optionnelle")}</option>
          </select>
          <Button type="button" onClick={add} disabled={busy || !chosen}>{tr("Add", "Ajouter")}</Button>
        </div>
      ) : null}
      {currentPeriodId && missingOfferings > 0 ? (
        <Button type="button" variant="outline" size="sm" onClick={offerAll} disabled={busy} className="w-full sm:w-auto">
          {tr("Open these courses for the current period", "Ouvrir ces cours pour la période en cours")}
        </Button>
      ) : null}
    </div>
  );
}

/** Pick a programme, then fill each year and semester with course units. */
export function CurriculumBuilder({ courseUnits }: { courseUnits: HigherCourseUnit[] }) {
  const tr = useHigherText();
  const programmes = useHigherProgrammes();
  const list = programmes.data ?? [];
  const [programmeId, setProgrammeId] = useState<number | null>(null);
  const selectedId = programmeId ?? list[0]?.id ?? null;
  const programme = list.find((p) => p.id === selectedId) ?? null;

  const curriculum = useHigherCurriculum(selectedId);
  const summary = useHigherCurriculumSummary(selectedId);
  const years = useHigherAcademicYears();
  const periods = useHigherAcademicPeriods();
  const currentYear = (years.data ?? []).find((y) => y.is_current);
  const currentPeriods = (periods.data ?? []).filter((p) => currentYear && p.academic_year === currentYear.id).sort((a, b) => a.order - b.order);
  const [periodId, setPeriodId] = useState<number | null>(null);
  useEffect(() => {
    if (periodId == null && currentPeriods.length > 0) setPeriodId(currentPeriods[0].id);
  }, [periodId, currentPeriods]);
  const offerings = useHigherOfferings(periodId ?? undefined);
  const offered = new Set((periodId ? offerings.data ?? [] : []).map((o) => o.course_unit));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{tr("Curriculum", "Maquette pédagogique")}</CardTitle>
        <CardDescription>
          {tr(
            "Choose a programme, then add course units to each year and semester.",
            "Choisissez un programme, puis ajoutez des unités à chaque année et semestre.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {programmes.isLoading ? <Loading /> : programmes.isError ? <LoadFailed /> : list.length === 0 ? (
          <p className="text-sm">{tr("Add a programme first, then come back to build its curriculum.", "Ajoutez d'abord un programme, puis revenez construire sa maquette.")}</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="cur-programme">{tr("Programme", "Programme")}</label>
                <select id="cur-programme" className={selectClass} value={selectedId ?? ""} onChange={(e) => setProgrammeId(Number(e.target.value))}>
                  {list.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              {currentPeriods.length > 0 ? (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="cur-period">{tr("Current period", "Période en cours")}</label>
                  <select id="cur-period" className={selectClass} value={periodId ?? ""} onChange={(e) => setPeriodId(Number(e.target.value))}>
                    {currentPeriods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              ) : null}
            </div>
            {programme && (curriculum.isLoading || summary.isLoading) ? <Loading /> : curriculum.isError ? <LoadFailed /> : programme ? (
              <div className="space-y-3">
                {[...(programme.years ?? [])].sort((a, b) => a.number - b.number).flatMap((year) =>
                  SEMESTERS.map((number) => {
                    const entries = (curriculum.data ?? []).filter((e) => e.programme_year === year.id && e.period_type === "semester" && e.period_number === number);
                    const row = (summary.data?.periods ?? []).find((r) => r.year_number === year.number && r.period_type === "semester" && r.period_number === number);
                    return (
                      <SemesterColumn
                        key={`${year.id}-${number}`}
                        programme={programme}
                        yearId={year.id}
                        yearLabel={year.label}
                        number={number}
                        entries={entries}
                        courseUnits={courseUnits}
                        total={entries.reduce((sum, e) => sum + e.credits, 0)}
                        target={row?.target_credits ?? (programme.award_level === "licence" || programme.award_level === "master" ? 30 : null)}
                        currentPeriodId={periodId}
                        offeredUnitIds={offered}
                      />
                    );
                  }),
                )}
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
