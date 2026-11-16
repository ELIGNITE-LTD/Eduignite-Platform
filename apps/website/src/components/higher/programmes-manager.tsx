"use client";

import Link from "next/link";
import { useState } from "react";
import { Pencil, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useHigherProgrammes, useHigherUnits } from "@/lib/hooks/useHigherEd";
import {
  higherEdStructureService as api,
  type AwardLevel,
  type HigherProgramme,
  type HigherProgrammeYear,
  type HigherUnit,
} from "@/lib/api/services/higher-ed.service";
import { HigherNextStep, HigherPageHeader, LoadFailed, Loading, selectClass, useHigherRunner, useHigherText } from "./higher-shared";

const AWARD_LEVELS: Array<{ value: AwardLevel; en: string; fr: string }> = [
  { value: "licence", en: "Licence / Bachelor", fr: "Licence" },
  { value: "master", en: "Master", fr: "Master" },
  { value: "doctorat", en: "Doctorate / PhD", fr: "Doctorat" },
  { value: "hnd", en: "HND", fr: "HND" },
  { value: "bts", en: "BTS", fr: "BTS" },
  { value: "diploma", en: "Diploma", fr: "Diplôme" },
  { value: "certificate", en: "Certificate", fr: "Certificat" },
  { value: "other", en: "Other", fr: "Autre" },
];

function ProgrammeForm({
  departments,
  initial,
  onDone,
  onCancel,
}: {
  departments: HigherUnit[];
  initial?: HigherProgramme;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const tr = useHigherText();
  const { run, busy } = useHigherRunner();
  const [name, setName] = useState(initial?.name ?? "");
  const [award, setAward] = useState<AwardLevel>(initial?.award_level ?? "licence");
  const [years, setYears] = useState(String(initial?.duration_years ?? 3));
  const [credits, setCredits] = useState(String(initial?.required_credits ?? 180));
  const [department, setDepartment] = useState(String(initial?.department ?? departments[0]?.id ?? ""));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const payload = {
      name: name.trim(),
      award_level: award,
      duration_years: Math.max(1, Number(years) || 1),
      required_credits: Math.max(0, Number(credits) || 0),
      department: Number(department),
    };
    if (!payload.name || !payload.department) return;
    const ok = await run(
      () => (initial ? api.updateProgramme(initial.id, payload) : api.createProgramme(payload)),
      initial ? tr("Programme updated.", "Programme modifié.") : tr("Programme added.", "Programme ajouté."),
    );
    if (ok) {
      if (!initial) setName("");
      onDone();
    }
  }

  const id = initial ? `p${initial.id}` : "new";
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-name`}>{tr("Programme name", "Nom du programme")}</Label>
        <Input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} placeholder={tr("BSc Computer Science", "Licence en Informatique")} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-award`}>{tr("Award level", "Niveau du diplôme")}</Label>
          <select id={`${id}-award`} className={selectClass} value={award} onChange={(e) => setAward(e.target.value as AwardLevel)}>
            {AWARD_LEVELS.map((a) => <option key={a.value} value={a.value}>{tr(a.en, a.fr)}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-dept`}>{tr("Department", "Département")}</Label>
          <select id={`${id}-dept`} className={selectClass} value={department} onChange={(e) => setDepartment(e.target.value)}>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-years`}>{tr("Length in years", "Durée en années")}</Label>
          <Input id={`${id}-years`} type="number" min={1} max={10} inputMode="numeric" value={years} onChange={(e) => setYears(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-credits`}>{tr("Credits needed to graduate", "Crédits requis pour être diplômé")}</Label>
          <Input id={`${id}-credits`} type="number" min={0} inputMode="numeric" value={credits} onChange={(e) => setCredits(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" className="w-full sm:w-auto" disabled={busy || !name.trim() || !department}>
          {initial ? tr("Save changes", "Enregistrer") : tr("Add programme", "Ajouter le programme")}
        </Button>
        {onCancel ? <Button type="button" variant="ghost" onClick={onCancel}>{tr("Cancel", "Annuler")}</Button> : null}
      </div>
    </form>
  );
}

function YearChip({ year }: { year: HigherProgrammeYear }) {
  const tr = useHigherText();
  const { run, busy } = useHigherRunner();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(year.label);

  async function save() {
    const trimmed = label.trim();
    if (!trimmed || trimmed === year.label) return setEditing(false);
    if (await run(() => api.renameProgrammeYear(year.id, trimmed), tr("Year renamed.", "Année renommée."))) setEditing(false);
  }

  if (editing) {
    return (
      <span className="flex items-center gap-1">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} className="h-8 w-36" aria-label={tr("Year name", "Nom de l'année")} />
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={save} disabled={busy} aria-label={tr("Save", "Enregistrer")}><Check className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setLabel(year.label); setEditing(false); }} aria-label={tr("Cancel", "Annuler")}><X className="h-4 w-4" /></Button>
      </span>
    );
  }
  return (
    <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs hover:bg-muted" title={tr("Rename", "Renommer")}>
      {year.label}
      <Pencil className="h-3 w-3 text-muted-foreground" />
    </button>
  );
}

function ProgrammeCard({ programme, departments }: { programme: HigherProgramme; departments: HigherUnit[] }) {
  const tr = useHigherText();
  const { run, busy } = useHigherRunner();
  const [editing, setEditing] = useState(false);
  const award = AWARD_LEVELS.find((a) => a.value === programme.award_level);
  const years = [...(programme.years ?? [])].sort((a, b) => a.number - b.number);

  async function remove() {
    const ok = window.confirm(
      tr(`Delete "${programme.name}"? This cannot be undone.`, `Supprimer « ${programme.name} » ? Cette action est définitive.`),
    );
    if (ok) await run(() => api.deleteProgramme(programme.id), tr("Programme deleted.", "Programme supprimé."));
  }

  return (
    <li className="space-y-3 rounded-lg border p-3">
      {editing ? (
        <ProgrammeForm departments={departments} initial={programme} onDone={() => setEditing(false)} onCancel={() => setEditing(false)} />
      ) : (
        <>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{programme.name}</p>
              <p className="text-xs text-muted-foreground">
                {award ? tr(award.en, award.fr) : programme.award_level} · {programme.department_name} ·{" "}
                {tr(`${programme.duration_years} years`, `${programme.duration_years} ans`)} ·{" "}
                {tr(`${programme.required_credits} credits`, `${programme.required_credits} crédits`)}
              </p>
            </div>
            <Button size="icon" variant="ghost" onClick={() => setEditing(true)} aria-label={tr("Edit", "Modifier")}><Pencil className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" onClick={remove} disabled={busy} aria-label={tr("Delete", "Supprimer")}><Trash2 className="h-4 w-4" /></Button>
          </div>
          {years.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {years.map((y) => <YearChip key={y.id} year={y} />)}
            </div>
          ) : null}
        </>
      )}
    </li>
  );
}

export function ProgrammesManager() {
  const tr = useHigherText();
  const units = useHigherUnits("department");
  const programmes = useHigherProgrammes();
  const departments = units.data ?? [];
  const list = programmes.data ?? [];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <HigherPageHeader
        title={tr("Programmes", "Programmes")}
        help={tr("The degrees and diplomas you award. Years are created for you and you can rename them.", "Les diplômes que vous délivrez. Les années sont créées pour vous et vous pouvez les renommer.")}
      />
      {units.isLoading || programmes.isLoading ? <Loading /> : units.isError || programmes.isError ? <LoadFailed /> : departments.length === 0 ? (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <p className="text-sm">{tr("Add at least one department first. Every programme belongs to a department.", "Ajoutez d'abord au moins un département. Chaque programme appartient à un département.")}</p>
            <Button asChild className="w-full sm:w-auto"><Link href="/dashboard/higher/departments">{tr("Add departments", "Ajouter des départements")}</Link></Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{tr("Add a programme", "Ajouter un programme")}</CardTitle>
              <CardDescription>{tr("Fill in the details and press the button.", "Remplissez les informations puis appuyez sur le bouton.")}</CardDescription>
            </CardHeader>
            <CardContent>
              <ProgrammeForm departments={departments} onDone={() => undefined} />
            </CardContent>
          </Card>
          {list.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{tr("Your programmes", "Vos programmes")}</CardTitle>
                <CardDescription>{tr("Tap a year to rename it.", "Touchez une année pour la renommer.")}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {list.map((p) => <ProgrammeCard key={p.id} programme={p} departments={departments} />)}
                </ul>
              </CardContent>
            </Card>
          ) : null}
          <HigherNextStep show={list.length > 0} href="/dashboard/higher/calendar" label={tr("Next: academic calendar", "Suivant : calendrier académique")} />
        </>
      )}
    </div>
  );
}
