"use client";

import Link from "next/link";
import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useHigherCourseUnits, useHigherUnits } from "@/lib/hooks/useHigherEd";
import {
  higherEdTeachingService as api,
  type HigherCourseUnit,
  type HigherUnit,
} from "@/lib/api/services/higher-ed.service";
import { CurriculumBuilder } from "./curriculum-builder";
import { HigherNextStep, HigherPageHeader, LoadFailed, Loading, selectClass, useHigherRunner, useHigherText } from "./higher-shared";

function CourseUnitForm({
  departments,
  initial,
  onDone,
  onCancel,
}: {
  departments: HigherUnit[];
  initial?: HigherCourseUnit;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const tr = useHigherText();
  const { run, busy } = useHigherRunner();
  const [code, setCode] = useState(initial?.code ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [credits, setCredits] = useState(String(initial?.credits ?? 5));
  const [department, setDepartment] = useState(String(initial?.department ?? departments[0]?.id ?? ""));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const payload = {
      code: code.trim(),
      title: title.trim(),
      credits: Math.max(1, Number(credits) || 1),
      department: Number(department),
    };
    if (!payload.code || !payload.title || !payload.department) return;
    const ok = await run(
      () => (initial ? api.updateCourseUnit(initial.id, payload) : api.createCourseUnit(payload)),
      initial ? tr("Course unit updated.", "Unité d'enseignement modifiée.") : tr("Course unit added.", "Unité d'enseignement ajoutée."),
    );
    if (ok) {
      if (!initial) {
        setCode("");
        setTitle("");
      }
      onDone();
    }
  }

  const id = initial ? `cu${initial.id}` : "cu-new";
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-code`}>{tr("Code", "Code")}</Label>
          <Input id={`${id}-code`} value={code} onChange={(e) => setCode(e.target.value)} placeholder="INF101" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${id}-title`}>{tr("Course unit name", "Nom de l'unité d'enseignement")}</Label>
          <Input id={`${id}-title`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tr("Introduction to Programming", "Introduction à la programmation")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-credits`}>{tr("Credits", "Crédits")}</Label>
          <Input id={`${id}-credits`} type="number" min={1} inputMode="numeric" value={credits} onChange={(e) => setCredits(e.target.value)} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${id}-dept`}>{tr("Department", "Département")}</Label>
          <select id={`${id}-dept`} className={selectClass} value={department} onChange={(e) => setDepartment(e.target.value)}>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" className="w-full sm:w-auto" disabled={busy || !code.trim() || !title.trim() || !department}>
          {initial ? tr("Save changes", "Enregistrer") : tr("Add course unit", "Ajouter l'unité")}
        </Button>
        {onCancel ? <Button type="button" variant="ghost" onClick={onCancel}>{tr("Cancel", "Annuler")}</Button> : null}
      </div>
    </form>
  );
}

function CourseUnitRow({ unit, departments }: { unit: HigherCourseUnit; departments: HigherUnit[] }) {
  const tr = useHigherText();
  const { run, busy } = useHigherRunner();
  const [editing, setEditing] = useState(false);

  async function remove() {
    const ok = window.confirm(
      tr(`Delete "${unit.title}"? This cannot be undone.`, `Supprimer « ${unit.title} » ? Cette action est définitive.`),
    );
    if (ok) await run(() => api.deleteCourseUnit(unit.id), tr("Course unit deleted.", "Unité d'enseignement supprimée."));
  }

  return (
    <li className="rounded-lg border p-3">
      {editing ? (
        <CourseUnitForm departments={departments} initial={unit} onDone={() => setEditing(false)} onCancel={() => setEditing(false)} />
      ) : (
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{unit.code} · {unit.title}</p>
            <p className="text-xs text-muted-foreground">
              {tr(`${unit.credits} credits`, `${unit.credits} crédits`)} · {unit.department_name}
            </p>
          </div>
          <Button size="icon" variant="ghost" onClick={() => setEditing(true)} aria-label={tr("Edit", "Modifier")}><Pencil className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" onClick={remove} disabled={busy} aria-label={tr("Delete", "Supprimer")}><Trash2 className="h-4 w-4" /></Button>
        </div>
      )}
    </li>
  );
}

export function CourseUnitsManager() {
  const tr = useHigherText();
  const units = useHigherUnits("department");
  const courses = useHigherCourseUnits();
  const departments = units.data ?? [];
  const list = courses.data ?? [];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <HigherPageHeader
        title={tr("Course units", "Unités d'enseignement")}
        help={tr(
          "A course unit is one subject taught, worth a number of credits. Add them here, then place them in each programme below.",
          "Une unité d'enseignement est une matière enseignée, qui vaut un nombre de crédits. Ajoutez-les ici, puis placez-les dans chaque programme ci-dessous.",
        )}
      />
      {units.isLoading || courses.isLoading ? <Loading /> : units.isError || courses.isError ? <LoadFailed /> : departments.length === 0 ? (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <p className="text-sm">{tr("Add at least one department first. Every course unit belongs to a department.", "Ajoutez d'abord au moins un département. Chaque unité d'enseignement appartient à un département.")}</p>
            <Button asChild className="w-full sm:w-auto"><Link href="/dashboard/higher/departments">{tr("Add departments", "Ajouter des départements")}</Link></Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{tr("Add a course unit", "Ajouter une unité d'enseignement")}</CardTitle>
              <CardDescription>{tr("Fill in the details and press the button.", "Remplissez les informations puis appuyez sur le bouton.")}</CardDescription>
            </CardHeader>
            <CardContent>
              <CourseUnitForm departments={departments} onDone={() => undefined} />
            </CardContent>
          </Card>
          {list.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{tr("Your course units", "Vos unités d'enseignement")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {list.map((c) => <CourseUnitRow key={c.id} unit={c} departments={departments} />)}
                </ul>
              </CardContent>
            </Card>
          ) : null}
          {list.length > 0 ? <CurriculumBuilder courseUnits={list} /> : null}
          <HigherNextStep show={list.length > 0} href="/dashboard/higher/lecturers" label={tr("Next: lecturers", "Suivant : enseignants")} />
        </>
      )}
    </div>
  );
}
