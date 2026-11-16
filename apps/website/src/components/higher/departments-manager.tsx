"use client";

import { useState } from "react";
import { Pencil, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useHigherUnits } from "@/lib/hooks/useHigherEd";
import { higherEdStructureService as api, type HigherUnit, type UnitType } from "@/lib/api/services/higher-ed.service";
import { HigherNextStep, HigherPageHeader, LoadFailed, Loading, selectClass, useHigherRunner, useHigherText } from "./higher-shared";

function UnitRow({ unit, noun }: { unit: HigherUnit; noun: string }) {
  const tr = useHigherText();
  const { run, busy } = useHigherRunner();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(unit.name);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === unit.name) return setEditing(false);
    if (await run(() => api.updateUnit(unit.id, { name: trimmed }), tr("Name changed.", "Nom modifié."))) setEditing(false);
  }
  async function remove() {
    const ok = window.confirm(
      tr(`Delete "${unit.name}"? This cannot be undone.`, `Supprimer « ${unit.name} » ? Cette action est définitive.`),
    );
    if (ok) await run(() => api.deleteUnit(unit.id), tr(`${noun} deleted.`, `${noun} supprimé(e).`));
  }

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
      {editing ? (
        <>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="min-w-0 flex-1" aria-label={tr("New name", "Nouveau nom")} />
          <Button size="icon" variant="ghost" onClick={save} disabled={busy} aria-label={tr("Save", "Enregistrer")}>
            <Check className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => { setName(unit.name); setEditing(false); }} aria-label={tr("Cancel", "Annuler")}>
            <X className="h-4 w-4" />
          </Button>
        </>
      ) : (
        <>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{unit.name}</p>
            {unit.parent_name ? <p className="text-xs text-muted-foreground">{unit.parent_name}</p> : null}
          </div>
          <Button size="icon" variant="ghost" onClick={() => setEditing(true)} aria-label={tr("Rename", "Renommer")}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={remove} disabled={busy} aria-label={tr("Delete", "Supprimer")}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </>
      )}
    </li>
  );
}

function AddUnit({ unitType, label, faculties }: { unitType: UnitType; label: string; faculties?: HigherUnit[] }) {
  const tr = useHigherText();
  const { run, busy } = useHigherRunner();
  const [name, setName] = useState("");
  const [parent, setParent] = useState("");

  async function add(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const ok = await run(
      () => api.createUnit({ unit_type: unitType, name: trimmed, parent: parent ? Number(parent) : null }),
      tr("Added.", "Ajouté."),
    );
    if (ok) setName("");
  }

  return (
    <form onSubmit={add} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`new-${unitType}`}>{label}</Label>
        <Input id={`new-${unitType}`} value={name} onChange={(e) => setName(e.target.value)} placeholder={unitType === "faculty" ? tr("Faculty of Science", "Faculté des Sciences") : tr("Computer Science", "Informatique")} />
      </div>
      {faculties && faculties.length > 0 ? (
        <div className="space-y-1.5">
          <Label htmlFor="dept-faculty">{tr("Which faculty or school is it in? (optional)", "Dans quelle faculté ou école ? (facultatif)")}</Label>
          <select id="dept-faculty" className={selectClass} value={parent} onChange={(e) => setParent(e.target.value)}>
            <option value="">{tr("None", "Aucune")}</option>
            {faculties.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>
      ) : null}
      <Button type="submit" className="w-full sm:w-auto" disabled={busy || !name.trim()}>
        {tr("Add", "Ajouter")}
      </Button>
    </form>
  );
}

export function DepartmentsManager() {
  const tr = useHigherText();
  const { data: units, isLoading, isError } = useHigherUnits();
  const [facultiesOn, setFacultiesOn] = useState<boolean | null>(null);

  const faculties = (units ?? []).filter((u) => u.unit_type === "faculty" || u.unit_type === "school");
  const departments = (units ?? []).filter((u) => u.unit_type === "department");
  // OFF by default; switched on automatically when faculties already exist.
  const showFaculties = facultiesOn ?? faculties.length > 0;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <HigherPageHeader
        title={tr("Departments", "Départements")}
        help={tr("The departments of your institution, such as Computer Science or Law.", "Les départements de votre établissement, par exemple Informatique ou Droit.")}
      />

      {isLoading ? <Loading /> : isError ? <LoadFailed /> : (
        <>
          <Card>
            <CardContent className="flex items-center justify-between gap-4 pt-6">
              <div>
                <Label htmlFor="has-faculties" className="text-sm font-semibold">
                  {tr("Our institution has faculties/schools", "Notre établissement a des facultés/écoles")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {faculties.length > 0
                    ? tr("Delete your faculties first if you want to turn this off.", "Supprimez d'abord vos facultés pour désactiver cette option.")
                    : tr("Turn on only if departments are grouped into faculties or schools.", "Activez seulement si vos départements sont regroupés en facultés ou écoles.")}
                </p>
              </div>
              <Switch id="has-faculties" checked={showFaculties} disabled={faculties.length > 0} onCheckedChange={setFacultiesOn} />
            </CardContent>
          </Card>

          {showFaculties ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{tr("Faculties / schools", "Facultés / écoles")}</CardTitle>
                <CardDescription>{tr("Add these first, then place each department inside one.", "Ajoutez-les d'abord, puis placez chaque département dans l'une d'elles.")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {faculties.length > 0 ? (
                  <ul className="space-y-2">
                    {faculties.map((f) => <UnitRow key={f.id} unit={f} noun={tr("Faculty", "Faculté")} />)}
                  </ul>
                ) : null}
                <AddUnit unitType="faculty" label={tr("Name of the faculty or school", "Nom de la faculté ou école")} />
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{tr("Your departments", "Vos départements")}</CardTitle>
              <CardDescription>
                {departments.length === 0
                  ? tr("Nothing added yet.", "Rien d'ajouté pour le moment.")
                  : tr(`${departments.length} added.`, `${departments.length} ajouté(s).`)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {departments.length > 0 ? (
                <ul className="space-y-2">
                  {departments.map((d) => <UnitRow key={d.id} unit={d} noun={tr("Department", "Département")} />)}
                </ul>
              ) : null}
              <AddUnit unitType="department" label={tr("Name of the department", "Nom du département")} faculties={showFaculties ? faculties : undefined} />
            </CardContent>
          </Card>

          <HigherNextStep show={departments.length > 0} href="/dashboard/higher/programmes" label={tr("Next: add programmes", "Suivant : ajouter les programmes")} />
        </>
      )}
    </div>
  );
}
