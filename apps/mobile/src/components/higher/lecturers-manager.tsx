"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useHigherAcademicPeriods,
  useHigherAcademicYears,
  useHigherDepartmentHeads,
  useHigherLecturers,
  useHigherOfferings,
  useHigherUnits,
} from "@/lib/hooks/useHigherEd";
import {
  higherEdTeachingService as api,
  type HigherDepartmentHead,
  type HigherLecturer,
  type HigherOffering,
  type HigherUnit,
} from "@/lib/api/services/higher-ed.service";
import { HigherPageHeader, LoadFailed, Loading, selectClass, useHigherRunner, useHigherText } from "./higher-shared";

function AddLecturerForm({ onCreated }: { onCreated: (lecturer: HigherLecturer) => void }) {
  const tr = useHigherText();
  const { run, busy } = useHigherRunner();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    let created = null as HigherLecturer | null;
    const ok = await run(async () => {
      created = await api.createLecturer({ name: name.trim(), email: email.trim() || undefined, phone: phone.trim() || undefined });
    }, tr("Lecturer added.", "Enseignant ajouté."));
    if (ok && created) {
      onCreated(created);
      setName("");
      setEmail("");
      setPhone("");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="lec-name">{tr("Full name", "Nom complet")}</Label>
          <Input id="lec-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lec-email">{tr("Email", "E-mail")}</Label>
          <Input id="lec-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lec-phone">{tr("Phone", "Téléphone")}</Label>
          <Input id="lec-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
      </div>
      <Button type="submit" className="w-full sm:w-auto" disabled={busy || !name.trim()}>
        {tr("Add lecturer", "Ajouter l'enseignant")}
      </Button>
    </form>
  );
}

function LecturerRow({
  lecturer,
  departments,
  heads,
}: {
  lecturer: HigherLecturer;
  departments: HigherUnit[];
  heads: HigherDepartmentHead[];
}) {
  const tr = useHigherText();
  const { run, busy } = useHigherRunner();
  const [dept, setDept] = useState("");
  const mine = heads.filter((h) => h.user === lecturer.id);
  const chosen = dept || String(departments.find((d) => !mine.some((h) => h.unit === d.id))?.id ?? "");

  return (
    <li className="space-y-2 rounded-lg border p-3">
      <div>
        <p className="text-sm font-semibold">{lecturer.name}</p>
        <p className="text-xs text-muted-foreground">
          {tr("Login number", "Numéro de connexion")}: {lecturer.matricule}
          {lecturer.email ? ` · ${lecturer.email}` : ""}
          {lecturer.phone ? ` · ${lecturer.phone}` : ""}
        </p>
      </div>
      {mine.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {mine.map((h) => (
            <span key={h.id} className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs">
              {tr("Head of", "Chef de")} {h.unit_name}
              <button
                type="button"
                className="ml-1 text-muted-foreground hover:text-foreground"
                disabled={busy}
                aria-label={tr("Remove", "Retirer")}
                onClick={() => run(() => api.removeDepartmentHead(h.id), tr("Department head removed.", "Chef de département retiré."))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      {departments.length > mine.length ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <select className={selectClass} value={chosen} onChange={(e) => setDept(e.target.value)} aria-label={tr("Department", "Département")}>
            {departments.filter((d) => !mine.some((h) => h.unit === d.id)).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <Button
            type="button"
            variant="outline"
            disabled={busy || !chosen}
            onClick={() => run(() => api.setDepartmentHead(Number(chosen), lecturer.id), tr("Department head set.", "Chef de département défini."))}
          >
            {tr("Make department head", "Nommer chef de département")}
          </Button>
        </div>
      ) : null}
    </li>
  );
}

function OfferingRow({ offering, lecturers }: { offering: HigherOffering; lecturers: HigherLecturer[] }) {
  const tr = useHigherText();
  const { run, busy } = useHigherRunner();

  function toggle(id: number) {
    const next = offering.lecturers.includes(id) ? offering.lecturers.filter((l) => l !== id) : [...offering.lecturers, id];
    return run(() => api.setOfferingLecturers(offering.id, next), tr("Lecturers updated.", "Enseignants mis à jour."));
  }

  return (
    <li className="space-y-2 rounded-lg border p-3">
      <p className="text-sm font-semibold">{offering.course_code} · {offering.course_title}</p>
      <div className="flex flex-wrap gap-2">
        {lecturers.map((l) => {
          const on = offering.lecturers.includes(l.id);
          return (
            <button
              key={l.id}
              type="button"
              disabled={busy}
              onClick={() => toggle(l.id)}
              aria-pressed={on}
              className={`rounded-full border px-3 py-1 text-xs ${on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              {l.name}
            </button>
          );
        })}
      </div>
    </li>
  );
}

function Assignments({ lecturers }: { lecturers: HigherLecturer[] }) {
  const tr = useHigherText();
  const years = useHigherAcademicYears();
  const periods = useHigherAcademicPeriods();
  const currentYear = (years.data ?? []).find((y) => y.is_current);
  const currentPeriods = (periods.data ?? []).filter((p) => currentYear && p.academic_year === currentYear.id).sort((a, b) => a.order - b.order);
  const [periodId, setPeriodId] = useState<number | null>(null);
  const activeId = currentPeriods.some((p) => p.id === periodId) ? periodId : currentPeriods[0]?.id ?? null;
  const offerings = useHigherOfferings(activeId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{tr("Who teaches what", "Qui enseigne quoi")}</CardTitle>
        <CardDescription>
          {tr("Tap a lecturer to assign or unassign them for a course this semester.", "Touchez un enseignant pour l'affecter à un cours ce semestre, ou le retirer.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {years.isLoading || periods.isLoading ? <Loading /> : currentPeriods.length === 0 ? (
          <div className="space-y-2">
            <p className="text-sm">{tr("Set the current academic year and its semesters first.", "Définissez d'abord l'année académique en cours et ses semestres.")}</p>
            <Button asChild variant="outline"><Link href="/dashboard/higher/calendar">{tr("Open the calendar", "Ouvrir le calendrier")}</Link></Button>
          </div>
        ) : (
          <>
            <select className={selectClass} value={activeId ?? ""} onChange={(e) => setPeriodId(Number(e.target.value))} aria-label={tr("Semester", "Semestre")}>
              {currentPeriods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {offerings.isLoading ? <Loading /> : offerings.isError ? <LoadFailed /> : (offerings.data ?? []).length === 0 ? (
              <div className="space-y-2">
                <p className="text-sm">{tr("No courses are open for this semester yet. Open them from the curriculum.", "Aucun cours n'est ouvert pour ce semestre. Ouvrez-les depuis la maquette.")}</p>
                <Button asChild variant="outline"><Link href="/dashboard/higher/course-units">{tr("Go to the curriculum", "Aller à la maquette")}</Link></Button>
              </div>
            ) : (
              <ul className="space-y-2">
                {(offerings.data ?? []).map((o) => <OfferingRow key={o.id} offering={o} lecturers={lecturers} />)}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function LecturersManager() {
  const tr = useHigherText();
  const lecturers = useHigherLecturers();
  const units = useHigherUnits("department");
  const heads = useHigherDepartmentHeads();
  const [created, setCreated] = useState<HigherLecturer | null>(null);
  const list = lecturers.data ?? [];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <HigherPageHeader
        title={tr("Lecturers", "Enseignants")}
        help={tr(
          "The people who teach and enter results. Each one gets a login number to activate their account.",
          "Les personnes qui enseignent et saisissent les notes. Chacune reçoit un numéro de connexion pour activer son compte.",
        )}
      />
      {lecturers.isLoading ? <Loading /> : lecturers.isError ? <LoadFailed /> : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{tr("Add a lecturer", "Ajouter un enseignant")}</CardTitle>
              <CardDescription>{tr("Name is enough. Email and phone help us reach them.", "Le nom suffit. L'e-mail et le téléphone nous aident à les joindre.")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <AddLecturerForm onCreated={setCreated} />
              {created ? (
                <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-900">
                  <p className="font-semibold">{tr(`${created.name} can now log in.`, `${created.name} peut maintenant se connecter.`)}</p>
                  <p>
                    {tr("Share this login number so they can activate their account:", "Partagez ce numéro de connexion pour qu'ils activent leur compte :")}{" "}
                    <span className="font-mono font-semibold">{created.matricule}</span>
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>
          {list.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{tr("Your lecturers", "Vos enseignants")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {list.map((l) => <LecturerRow key={l.id} lecturer={l} departments={units.data ?? []} heads={heads.data ?? []} />)}
                </ul>
              </CardContent>
            </Card>
          ) : null}
          {list.length > 0 ? <Assignments lecturers={list} /> : null}
        </>
      )}
    </div>
  );
}
