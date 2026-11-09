"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useHigherAcademicPeriods, useHigherAcademicYears } from "@/lib/hooks/useHigherEd";
import {
  higherEdStructureService as api,
  type HigherAcademicPeriod,
  type HigherAcademicYear,
} from "@/lib/api/services/higher-ed.service";
import { HigherNextStep, HigherPageHeader, LoadFailed, Loading, selectClass, useHigherRunner, useHigherText } from "./higher-shared";

function AddYear() {
  const tr = useHigherText();
  const { run, busy } = useHigherRunner();
  const [label, setLabel] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [current, setCurrent] = useState(true);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!label.trim() || !start || !end) return;
    if (end <= start) {
      await run(() => Promise.reject({ response: { data: tr("The end date must be after the start date.", "La date de fin doit être après la date de début.") } }), "");
      return;
    }
    const ok = await run(
      () => api.createAcademicYear({ label: label.trim(), start_date: start, end_date: end, is_current: current }),
      tr("Academic year added.", "Année académique ajoutée."),
    );
    if (ok) { setLabel(""); setStart(""); setEnd(""); }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="ay-label">{tr("Name of the academic year", "Nom de l'année académique")}</Label>
        <Input id="ay-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="2025/2026" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ay-start">{tr("It starts on", "Début")}</Label>
          <Input id="ay-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ay-end">{tr("It ends on", "Fin")}</Label>
          <Input id="ay-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={current} onChange={(e) => setCurrent(e.target.checked)} className="h-4 w-4" />
        {tr("This is the year we are in now", "C'est l'année en cours")}
      </label>
      <Button type="submit" className="w-full sm:w-auto" disabled={busy || !label.trim() || !start || !end}>
        {tr("Add academic year", "Ajouter l'année académique")}
      </Button>
    </form>
  );
}

function AddPeriod({ year, count }: { year: HigherAcademicYear; count: number }) {
  const tr = useHigherText();
  const { run, busy } = useHigherRunner();
  const [name, setName] = useState(tr(`Semester ${count + 1}`, `Semestre ${count + 1}`));
  const [type, setType] = useState("semester");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || !start || !end) return;
    const ok = await run(
      () => api.createAcademicPeriod({ academic_year: year.id, period_type: type, name: name.trim(), order: count + 1, start_date: start, end_date: end }),
      tr("Semester added.", "Semestre ajouté."),
    );
    if (ok) { setStart(""); setEnd(""); setName(tr(`Semester ${count + 2}`, `Semestre ${count + 2}`)); }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg bg-muted/40 p-3">
      <p className="text-xs font-semibold">{tr("Add a semester", "Ajouter un semestre")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`p-name-${year.id}`}>{tr("Name", "Nom")}</Label>
          <Input id={`p-name-${year.id}`} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`p-type-${year.id}`}>{tr("Kind", "Type")}</Label>
          <select id={`p-type-${year.id}`} className={selectClass} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="semester">{tr("Semester", "Semestre")}</option>
            <option value="trimester">{tr("Trimester", "Trimestre")}</option>
            <option value="term">{tr("Term", "Période")}</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`p-start-${year.id}`}>{tr("Starts on", "Début")}</Label>
          <Input id={`p-start-${year.id}`} type="date" min={year.start_date} max={year.end_date} value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`p-end-${year.id}`}>{tr("Ends on", "Fin")}</Label>
          <Input id={`p-end-${year.id}`} type="date" min={year.start_date} max={year.end_date} value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>
      <Button type="submit" variant="secondary" disabled={busy || !name.trim() || !start || !end}>{tr("Add", "Ajouter")}</Button>
    </form>
  );
}

function YearCard({ year, periods }: { year: HigherAcademicYear; periods: HigherAcademicPeriod[] }) {
  const tr = useHigherText();
  const { run, busy } = useHigherRunner();

  async function removeYear() {
    const ok = window.confirm(
      tr(`Delete ${year.label} and its semesters? This cannot be undone.`, `Supprimer ${year.label} et ses semestres ? Cette action est définitive.`),
    );
    if (ok) await run(() => api.deleteAcademicYear(year.id), tr("Academic year deleted.", "Année académique supprimée."));
  }

  return (
    <li className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {year.label} {year.is_current ? <Badge className="ml-1">{tr("Current", "En cours")}</Badge> : null}
          </p>
          <p className="text-xs text-muted-foreground">{year.start_date} → {year.end_date}</p>
        </div>
        {!year.is_current ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => api.updateAcademicYear(year.id, { is_current: true }), tr("This is now the current year.", "C'est maintenant l'année en cours."))}>
            {tr("Make current", "Définir comme en cours")}
          </Button>
        ) : null}
        <Button size="icon" variant="ghost" disabled={busy} onClick={removeYear} aria-label={tr("Delete", "Supprimer")}><Trash2 className="h-4 w-4" /></Button>
      </div>
      {periods.length > 0 ? (
        <ul className="space-y-1">
          {periods.map((p) => (
            <li key={p.id} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{p.name} <span className="text-xs text-muted-foreground">({p.start_date} → {p.end_date})</span></span>
              <Button size="icon" variant="ghost" className="h-7 w-7" disabled={busy} aria-label={tr("Delete", "Supprimer")}
                onClick={() => window.confirm(tr(`Delete ${p.name}?`, `Supprimer ${p.name} ?`)) && run(() => api.deleteAcademicPeriod(p.id), tr("Semester deleted.", "Semestre supprimé."))}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">{tr("No semesters yet.", "Aucun semestre pour le moment.")}</p>
      )}
      <AddPeriod year={year} count={periods.length} />
    </li>
  );
}

export function CalendarManager() {
  const tr = useHigherText();
  const years = useHigherAcademicYears();
  const periods = useHigherAcademicPeriods();
  const list = years.data ?? [];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <HigherPageHeader
        title={tr("Academic calendar", "Calendrier académique")}
        help={tr("Add the academic year, say which one is current, then add its semesters.", "Ajoutez l'année académique, indiquez laquelle est en cours, puis ajoutez ses semestres.")}
      />
      {years.isLoading || periods.isLoading ? <Loading /> : years.isError || periods.isError ? <LoadFailed /> : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{tr("Add an academic year", "Ajouter une année académique")}</CardTitle>
              <CardDescription>{tr("For example 2025/2026.", "Par exemple 2025/2026.")}</CardDescription>
            </CardHeader>
            <CardContent><AddYear /></CardContent>
          </Card>
          {list.length > 0 ? (
            <Card>
              <CardHeader><CardTitle className="text-base">{tr("Your academic years", "Vos années académiques")}</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {list.map((y) => (
                    <YearCard key={y.id} year={y} periods={(periods.data ?? []).filter((p) => p.academic_year === y.id)} />
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
          <HigherNextStep show={list.length > 0} href="/dashboard/higher/grading" label={tr("Next: choose grading", "Suivant : choisir la notation")} />
        </>
      )}
    </div>
  );
}
