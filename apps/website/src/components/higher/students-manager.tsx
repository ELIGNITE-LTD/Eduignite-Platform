"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useHigherAcademicYears, useHigherProgrammes, useHigherStudents } from "@/lib/hooks/useHigherEd";
import {
  higherEdStudentsService as api,
  type EnrolmentStatus,
  type HigherEnrolment,
  type HigherProgramme,
} from "@/lib/api/services/higher-ed.service";
import { HigherTable, StatusBadge } from "./higher-table";
import { useHigherRole, HigherPageHeader, LoadFailed, Loading, selectClass, useHigherRunner, useHigherText } from "./higher-shared";

const STATUSES: Array<{ value: EnrolmentStatus; en: string; fr: string }> = [
  { value: "active", en: "Active", fr: "Actif" },
  { value: "deferred", en: "Deferred", fr: "Reporté" },
  { value: "suspended", en: "Suspended", fr: "Suspendu" },
  { value: "withdrawn", en: "Withdrawn", fr: "Démissionnaire" },
  { value: "graduated", en: "Graduated", fr: "Diplômé" },
];

function AdmitForm({ programmes, onAdmitted }: { programmes: HigherProgramme[]; onAdmitted: (s: HigherEnrolment) => void }) {
  const tr = useHigherText();
  const { run, busy } = useHigherRunner();
  const years = useHigherAcademicYears();
  const current = (years.data ?? []).find((y) => y.is_current);
  const [name, setName] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "other">("female");
  const [dob, setDob] = useState("");
  const [pob, setPob] = useState("");
  const [phone, setPhone] = useState("");
  const [kinName, setKinName] = useState("");
  const [kinPhone, setKinPhone] = useState("");
  const [programme, setProgramme] = useState("");
  const [level, setLevel] = useState("");

  const chosen = programmes.find((p) => p.id === programme) ?? null;
  const levels = chosen?.years ?? [];
  const ready = name.trim() !== "" && programme !== "" && level !== "" && Boolean(current);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;
    let created = null as HigherEnrolment | null;
    const ok = await run(async () => {
      created = await api.admit({
        name: name.trim(), gender, date_of_birth: dob || undefined, place_of_birth: pob.trim() || undefined,
        phone: phone.trim() || undefined, guardian_name: kinName.trim() || undefined, guardian_phone: kinPhone.trim() || undefined,
        programme, programme_year: level,
      });
    }, tr("Student admitted.", "Étudiant admis."));
    if (ok && created) {
      onAdmitted(created);
      setName(""); setDob(""); setPob(""); setPhone(""); setKinName(""); setKinPhone("");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {!current ? (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          {tr("Set the academic year first (Settings, then Academic calendar). Students are admitted into an academic year.",
            "Définissez d'abord l'année académique (Paramètres, puis Calendrier académique). Les étudiants sont admis dans une année académique.")}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">{tr("Academic year", "Année académique")}: <strong>{current.label}</strong></p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="st-name">{tr("Full name", "Nom complet")} *</Label>
          <Input id="st-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="st-gender">{tr("Gender", "Sexe")}</Label>
          <select id="st-gender" className={selectClass} value={gender} onChange={(e) => setGender(e.target.value as typeof gender)}>
            <option value="female">{tr("Female", "Féminin")}</option>
            <option value="male">{tr("Male", "Masculin")}</option>
            <option value="other">{tr("Other", "Autre")}</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="st-phone">{tr("Phone / WhatsApp", "Téléphone / WhatsApp")}</Label>
          <Input id="st-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+237 6XX XXX XXX" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="st-dob">{tr("Date of birth", "Date de naissance")}</Label>
          <Input id="st-dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="st-pob">{tr("Place of birth", "Lieu de naissance")}</Label>
          <Input id="st-pob" value={pob} onChange={(e) => setPob(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="st-programme">{tr("Programme", "Filière / programme")} *</Label>
          <select id="st-programme" className={selectClass} value={programme} onChange={(e) => { setProgramme(e.target.value); setLevel(""); }}>
            <option value="">{tr("Choose a programme", "Choisir un programme")}</option>
            {programmes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="st-level">{tr("Level", "Niveau")} *</Label>
          <select id="st-level" className={selectClass} value={level} onChange={(e) => setLevel(e.target.value)} disabled={!chosen}>
            <option value="">{chosen ? tr("Choose a level", "Choisir un niveau") : tr("Choose a programme first", "Choisir d'abord un programme")}</option>
            {levels.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="st-kin">{tr("Emergency contact (name)", "Personne à prévenir (nom)")}</Label>
          <Input id="st-kin" value={kinName} onChange={(e) => setKinName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="st-kinphone">{tr("Emergency contact (phone)", "Personne à prévenir (téléphone)")}</Label>
          <Input id="st-kinphone" type="tel" inputMode="tel" value={kinPhone} onChange={(e) => setKinPhone(e.target.value)} />
        </div>
      </div>
      <Button type="submit" className="w-full sm:w-auto" disabled={busy || !ready}>{tr("Admit student", "Admettre l'étudiant")}</Button>
    </form>
  );
}

function StudentActions({ row }: { row: HigherEnrolment }) {
  const tr = useHigherText();
  const { run, busy } = useHigherRunner();
  // Moving up and graduating are done from Promotion and graduation, where the group is reviewed first. Here only the
  // status of one student changes, and a change that can lock a student out asks before it is made.
  const options = STATUSES.filter((s) => s.value !== "graduated" || row.status === "graduated");
  function change(next: EnrolmentStatus) {
    const label = tr(STATUSES.find((s) => s.value === next)?.en ?? next, STATUSES.find((s) => s.value === next)?.fr ?? next);
    if (next !== "active" && !window.confirm(tr(`Change the status of ${row.name} to ${label}?`, `Changer le statut de ${row.name} en ${label} ?`))) return;
    void run(() => api.update(row.id, { status: next }), tr("Status updated.", "Statut mis à jour."));
  }
  return (
    <select
      className={`${selectClass} !h-8 !w-auto !py-0 text-xs`}
      value={row.status}
      disabled={busy || row.status === "graduated"}
      aria-label={tr("Status", "Statut")}
      onChange={(e) => change(e.target.value as EnrolmentStatus)}
    >
      {options.map((s) => <option key={s.value} value={s.value}>{tr(s.en, s.fr)}</option>)}
    </select>
  );
}

export function StudentsManager() {
  const tr = useHigherText();
  const programmes = useHigherProgrammes();
  const [programme, setProgramme] = useState("");
  const [level, setLevel] = useState("");
  const [status, setStatus] = useState("");
  const years = useHigherAcademicYears();
  const [academicYear, setAcademicYear] = useState("");
  // The current academic year by default, so a student who has been moved to a new year is not listed twice.
  const currentYear = (years.data ?? []).find((y) => y.is_current)?.id ?? "";
  const yearFilter = academicYear === "all" ? "" : academicYear || currentYear;
  const students = useHigherStudents({ programme, programme_year: level, status, academic_year: yearFilter, q: "" });
  const [admitted, setAdmitted] = useState<HigherEnrolment | null>(null);
  const [showAdmit, setShowAdmit] = useState(false);
  const { isAdmin } = useHigherRole();
  const progList = programmes.data ?? [];
  const chosen = progList.find((p) => p.id === programme) ?? null;
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <HigherPageHeader
        title={tr("Students", "Étudiants")}
        help={tr("Admit students into a programme and a level and follow them year by year. To move students up or graduate them, use Promotion and graduation.",
          "Admettez des étudiants dans un programme et un niveau et suivez-les année par année. Pour les faire passer ou les diplômer, utilisez Passage et diplomation.")}
      />

      {isAdmin ? (
        <p className="text-sm">
          <Link href="/dashboard/higher/progression" className="font-semibold text-primary underline-offset-2 hover:underline">
            {tr("Promote or graduate students at the end of the year", "Faire passer ou diplômer les étudiants en fin d'année")} →
          </Link>
        </p>
      ) : null}

      {admitted ? (
        <Card className="rounded-3xl border-none bg-green-50 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">{tr("Student admitted", "Étudiant admis")}: {admitted.name}</CardTitle>
            <CardDescription>
              {tr("Give this matricule to the student. They open EduIgnite, choose Activate my account, enter the matricule and choose their own password.",
                "Donnez ce matricule à l'étudiant. Il ouvre EduIgnite, choisit Activer mon compte, saisit le matricule et choisit son mot de passe.")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-2xl font-bold tracking-tight">{admitted.matricule}</p>
            <p className="mt-1 text-xs text-muted-foreground">{admitted.programme_name} · {admitted.year_label} · {admitted.academic_year_label}</p>
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setAdmitted(null)}>{tr("Close", "Fermer")}</Button>
          </CardContent>
        </Card>
      ) : null}

      {isAdmin ? <div className="flex justify-end">
        <Button type="button" onClick={() => setShowAdmit((v) => !v)}>{showAdmit ? tr("Close form", "Fermer le formulaire") : tr("Admit a student", "Admettre un étudiant")}</Button>
      </div> : null}
      {isAdmin && showAdmit ? (
      <Card className="rounded-3xl border-none shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">{tr("Admit a student", "Admettre un étudiant")}</CardTitle>
          <CardDescription>{tr("The student gets a matricule to activate their account.", "L'étudiant reçoit un matricule pour activer son compte.")}</CardDescription>
        </CardHeader>
        <CardContent>
          {programmes.isLoading ? <Loading /> : progList.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tr("Add your programmes first.", "Ajoutez d'abord vos programmes.")}</p>
          ) : (
            <AdmitForm programmes={progList} onAdmitted={(s) => { setAdmitted(s); setShowAdmit(false); }} />
          )}
        </CardContent>
      </Card>
      ) : null}

      <Card className="rounded-3xl border-none shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">{tr("Your students", "Vos étudiants")}</CardTitle>
          <CardDescription>
            {students.data ? tr(`${students.data.length} shown.`, `${students.data.length} affiché(s).`) : tr("Loading...", "Chargement...")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {students.isLoading ? <Loading /> : students.isError ? <LoadFailed /> : (
            <HigherTable<HigherEnrolment>
              rows={students.data ?? []}
              rowKey={(r) => r.id}
              label={tr("students", "étudiants")}
              searchPlaceholder={tr("Search name or matricule", "Rechercher nom ou matricule")}
              empty={tr("No students match.", "Aucun étudiant ne correspond.")}
              exportConfig={{
                title: tr("Student Register", "Registre des étudiants"), fileName: "students_register",
                issuingOffice: tr("Registry and Examination Office", "Service de la scolarité et des examens"),
                chips: [
                  { label: tr("Programme", "Filière"), value: chosen?.name ?? tr("All", "Toutes") },
                  { label: tr("Status", "Statut"), value: status ? tr(STATUSES.find((s) => s.value === status)?.en ?? status, STATUSES.find((s) => s.value === status)?.fr ?? status) : tr("All", "Tous") },
                ],
              }}
              filters={(
                <>
                  <select className={`${selectClass} max-w-[10rem]`} value={academicYear || currentYear} onChange={(e) => setAcademicYear(e.target.value)} aria-label={tr("Academic year", "Année académique")}>
                    <option value="all">{tr("All years", "Toutes les années")}</option>
                    {(years.data ?? []).map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}
                  </select>
                  <select className={`${selectClass} max-w-[13rem]`} value={programme} onChange={(e) => { setProgramme(e.target.value); setLevel(""); }} aria-label={tr("Programme", "Programme")}>
                    <option value="">{tr("All programmes", "Tous les programmes")}</option>
                    {progList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <select className={`${selectClass} max-w-[10rem]`} value={level} onChange={(e) => setLevel(e.target.value)} disabled={!chosen} aria-label={tr("Level", "Niveau")}>
                    <option value="">{tr("All levels", "Tous les niveaux")}</option>
                    {(chosen?.years ?? []).map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}
                  </select>
                  <select className={`${selectClass} max-w-[10rem]`} value={status} onChange={(e) => setStatus(e.target.value)} aria-label={tr("Status", "Statut")}>
                    <option value="">{tr("Any status", "Tout statut")}</option>
                    {STATUSES.map((s) => <option key={s.value} value={s.value}>{tr(s.en, s.fr)}</option>)}
                  </select>
                </>
              )}
              columns={[
                { key: "matricule", header: tr("Matricule", "Matricule"), value: (r) => r.matricule, mono: true },
                { key: "name", header: tr("Name", "Nom"), value: (r) => r.name, render: (r) => <span className="font-medium">{r.name}</span> },
                { key: "programme", header: tr("Programme", "Filière"), value: (r) => r.programme_name },
                { key: "level", header: tr("Level", "Niveau"), value: (r) => r.year_label },
                { key: "year", header: tr("Academic year", "Année"), value: (r) => r.academic_year_label },
                { key: "phone", header: tr("Phone", "Téléphone"), value: (r) => r.phone ?? "" },
                { key: "account", header: tr("Account", "Compte"), value: (r) => (r.activated ? tr("Active", "Activé") : tr("Not activated", "Non activé")),
                  render: (r) => <StatusBadge tone={r.activated ? "green" : "amber"}>{r.activated ? tr("Activated", "Activé") : tr("Not activated", "Non activé")}</StatusBadge> },
                { key: "actions", header: tr("Status", "Statut"), value: (r) => r.status, sortable: false, render: (r) => (isAdmin ? <StudentActions row={r} /> : <StatusBadge tone={r.status === "active" ? "green" : "slate"}>{tr(STATUSES.find((x) => x.value === r.status)?.en ?? r.status, STATUSES.find((x) => x.value === r.status)?.fr ?? r.status)}</StatusBadge>) },
              ]}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
