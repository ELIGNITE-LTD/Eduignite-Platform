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
import { HigherTable } from "./higher-table";
import { HigherNextStep, HigherPageHeader, useHigherRole, LoadFailed, Loading, selectClass, useHigherRunner, useHigherText, AddToggle } from "./higher-shared";

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
      department: department,
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

export function CourseUnitsManager() {
  const tr = useHigherText();
  const units = useHigherUnits("department");
  const courses = useHigherCourseUnits();
  const departments = units.data ?? [];
  const [editing, setEditing] = useState<HigherCourseUnit | null>(null);
  const [dept, setDept] = useState("");
  const { run, busy } = useHigherRunner();
  const { isOwner } = useHigherRole();
  const list = (courses.data ?? []).filter((c) => !dept || c.department === dept);
  const allCourses = courses.data ?? [];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <HigherPageHeader
        title={tr("Course units", "Unités d'enseignement")}
        help={tr(
          "A course unit is one subject taught, worth a number of credits. Add them here, then place them in each programme below.",
          "Une unité d'enseignement est une matière enseignée, qui vaut un nombre de crédits. Ajoutez-les ici, puis placez-les dans chaque programme ci-dessous.",
        )}
      />
      {units.isLoading || courses.isLoading ? <Loading /> : units.isError || courses.isError ? <LoadFailed /> : departments.length === 0 ? (
        <Card className="rounded-3xl border-none shadow-sm">
          <CardContent className="space-y-3 pt-6">
            <p className="text-sm">{tr("Add at least one department first. Every course unit belongs to a department.", "Ajoutez d'abord au moins un département. Chaque unité d'enseignement appartient à un département.")}</p>
            <Button asChild className="w-full sm:w-auto"><Link href="/dashboard/higher/departments">{tr("Add departments", "Ajouter des départements")}</Link></Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {isOwner ? <AddToggle label={tr("Add a course unit", "Ajouter une unité d'enseignement")}><CourseUnitForm departments={departments} onDone={() => undefined} /></AddToggle> : null}
          {editing ? (
            <Card className="rounded-3xl border-none shadow-sm">
              <CardHeader><CardTitle className="text-base">{tr("Edit course unit", "Modifier l'unité d'enseignement")}</CardTitle></CardHeader>
              <CardContent><CourseUnitForm key={editing.id} departments={departments} initial={editing} onDone={() => setEditing(null)} onCancel={() => setEditing(null)} /></CardContent>
            </Card>
          ) : null}
          {list.length > 0 ? (
            <Card className="rounded-3xl border-none shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">{tr("Your course units", "Vos unités d'enseignement")}</CardTitle>
                <CardDescription>{tr(`${list.length} course units, ${list.reduce((n, c) => n + c.credits, 0)} credits in total.`, `${list.length} unités d'enseignement, ${list.reduce((n, c) => n + c.credits, 0)} crédits au total.`)}</CardDescription>
              </CardHeader>
              <CardContent>
                <HigherTable<HigherCourseUnit>
                  rows={list}
                  rowKey={(c) => c.id}
                  label={tr("course units", "unités")}
                  searchPlaceholder={tr("Search code or title", "Rechercher code ou intitulé")}
                  empty={tr("No course unit matches.", "Aucune unité ne correspond.")}
                  exportConfig={{ title: tr("Course Units Catalogue", "Catalogue des unités d'enseignement"), fileName: "course_units", issuingOffice: tr("Academic Affairs", "Affaires académiques") }}
                  filters={(
                    <select className={`${selectClass} max-w-[14rem]`} value={dept} onChange={(e) => setDept(e.target.value)} aria-label={tr("Department", "Département")}>
                      <option value="">{tr("All departments", "Tous les départements")}</option>
                      {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  )}
                  columns={[
                    { key: "code", header: "Code", value: (c) => c.code, mono: true },
                    { key: "title", header: tr("Title", "Intitulé"), value: (c) => c.title, render: (c) => <span className="font-medium">{c.title}</span> },
                    { key: "credits", header: tr("Credits", "Crédits"), value: (c) => c.credits, align: "center" },
                    { key: "dept", header: tr("Department", "Département"), value: (c) => c.department_name },
                    { key: "act", header: "", value: () => "", noExport: true, sortable: false, align: "right",
                      render: (c) => !isOwner ? null : (
                        <span className="whitespace-nowrap">
                          <Button size="icon" variant="ghost" onClick={() => setEditing(c)} aria-label={tr("Edit", "Modifier")}><Pencil className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" disabled={busy} aria-label={tr("Delete", "Supprimer")} onClick={async () => {
                            if (window.confirm(tr(`Delete "${c.title}"? This cannot be undone.`, `Supprimer « ${c.title} » ? Cette action est définitive.`))) await run(() => api.deleteCourseUnit(c.id), tr("Course unit deleted.", "Unité d'enseignement supprimée."));
                          }}><Trash2 className="h-4 w-4" /></Button>
                        </span>
                      ) },
                  ]}
                />
              </CardContent>
            </Card>
          ) : null}
          {isOwner && allCourses.length > 0 ? <CurriculumBuilder courseUnits={allCourses} /> : null}
          <HigherNextStep show={isOwner && allCourses.length > 0} href="/dashboard/higher/lecturers" label={tr("Next: lecturers", "Suivant : enseignants")} />
        </>
      )}
    </div>
  );
}
