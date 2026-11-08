"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, HeartPulse, Loader2, Phone, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api/errors";
import { useEducationCategory } from "@/lib/hooks/useEducationCategory";
import { useMyTeachingClasses } from "@/lib/hooks/useAttendance";
import { useHierarchyClasses } from "@/lib/hooks/useSchools";
import {
  useAddHealthEntry,
  useDeleteHealthEntry,
  useHealthEntries,
  useHealthRows,
  useSaveHealth,
} from "@/lib/hooks/useSchoolLife";
import type { HealthEntryKind, HealthRow, HealthSheetInput } from "@/lib/api/services/school-life.service";

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const KINDS: { value: HealthEntryKind; en: string; fr: string }[] = [
  { value: "illness", en: "Illness", fr: "Maladie" },
  { value: "injury", en: "Injury", fr: "Blessure" },
  { value: "checkup", en: "Check-up", fr: "Visite médicale" },
  { value: "medication", en: "Medication", fr: "Médicament" },
  { value: "other", en: "Other", fr: "Autre" },
];

const today = () => new Date().toISOString().slice(0, 10);

/** Pupil health records: school admins, the class teacher and the pupil's parents only. */
export default function HealthRecordsPage() {
  const { user } = useAuth();
  const { language } = useI18n();
  const fr = language === "fr";
  const t = (en: string, frText: string) => (fr ? frText : en);
  const isBasic = useEducationCategory() === "basic";
  const role = user?.role;
  const isTeacher = role === "TEACHER";
  const isAdmin = role === "SCHOOL_ADMIN" || role === "SUB_ADMIN";
  const isParent = role === "PARENT";
  const allowed = isBasic && (isTeacher || isAdmin || isParent);
  const canEdit = isTeacher || isAdmin;
  const schoolId = typeof user?.school?.id === "string" ? user.school.id : "";

  const mine = useMyTeachingClasses(allowed && isTeacher);
  const all = useHierarchyClasses({ school_id: schoolId }, allowed && isAdmin && Boolean(schoolId));
  const classes = useMemo(
    () => (isTeacher ? mine.data ?? [] : isAdmin ? all.data ?? [] : []).map((c: any) => ({ id: String(c.id), name: String(c.name) })),
    [isTeacher, isAdmin, mine.data, all.data],
  );
  const [classId, setClassId] = useState("");
  useEffect(() => {
    if (!isParent) setClassId((cur) => (cur && classes.some((c) => c.id === cur) ? cur : classes[0]?.id ?? ""));
  }, [classes, isParent]);

  const rowsQuery = useHealthRows(classId, allowed && (isParent || Boolean(classId)));
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState("");
  const rows = useMemo(
    () => (rowsQuery.data ?? []).filter((r) => r.student_name.toLowerCase().includes(search.trim().toLowerCase())),
    [rowsQuery.data, search],
  );
  const open = (rowsQuery.data ?? []).find((r) => r.student === openId) ?? null;

  if (!user) {
    return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary/30" /></div>;
  }
  if (!allowed) {
    return (
      <p className="mx-auto max-w-3xl p-6 text-sm text-muted-foreground">
        {t("Health records are available to the school administration, class teachers and parents of Basic Education schools.",
          "Les dossiers de santé sont réservés à l'administration, aux enseignants de classe et aux parents des écoles de base.")}
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-24">
      <div>
        <h1 className="flex items-center gap-3 text-3xl font-bold text-primary font-headline">
          <div className="rounded-xl bg-primary p-2 text-secondary shadow-lg"><HeartPulse className="h-6 w-6" /></div>
          {t("Health records", "Dossiers de santé")}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {canEdit
            ? t("Allergies, conditions and emergency contacts. Confidential: only you, the administration and the pupil's parents can see them.",
                "Allergies, maladies et contacts d'urgence. Confidentiel : seuls vous, l'administration et les parents de l'élève y ont accès.")
            : t("Your child's health sheet, as kept by the school.", "Le dossier de santé de votre enfant, tenu par l'école.")}
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        {!isParent && (
          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger className="h-12 sm:w-64"><SelectValue placeholder={t("Choose a class", "Choisir une classe")} /></SelectTrigger>
            <SelectContent>
              {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-12 pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("Search a pupil", "Chercher un élève")} />
        </div>
      </div>

      {rowsQuery.isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-7 w-7 animate-spin text-primary/40" /></div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">{t("No pupils to show.", "Aucun élève à afficher.")}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.student}>
              <button
                type="button"
                onClick={() => setOpenId(r.student)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border bg-card p-4 text-left shadow-sm transition hover:border-primary"
              >
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold">{r.student_name}</p>
                  <p className="truncate text-sm text-muted-foreground">{r.class_name}{r.blood_group ? ` · ${r.blood_group}` : ""}</p>
                </div>
                {r.allergies ? (
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">
                    <AlertTriangle className="h-3.5 w-3.5" /> {t("Allergy", "Allergie")}
                  </span>
                ) : !r.has_record ? (
                  <span className="shrink-0 text-xs text-muted-foreground">{t("No record yet", "Pas de dossier")}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={Boolean(open)} onOpenChange={(v) => !v && setOpenId("")}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          {open && <HealthSheet key={open.student} row={open} canEdit={canEdit} t={t} fr={fr} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function HealthSheet({ row, canEdit, t, fr }: { row: HealthRow; canEdit: boolean; t: (en: string, fr: string) => string; fr: boolean }) {
  const { toast } = useToast();
  const save = useSaveHealth();
  const [form, setForm] = useState<HealthSheetInput>({
    blood_group: row.blood_group, allergies: row.allergies, conditions: row.conditions,
    emergency_contact_name: row.emergency_contact_name, emergency_contact_phone: row.emergency_contact_phone,
    doctor_name: row.doctor_name, doctor_phone: row.doctor_phone, notes: row.notes,
  });
  const set = (k: keyof HealthSheetInput, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    try {
      await save.mutateAsync({ student: row.student, data: form });
      toast({ title: t("Saved", "Enregistré") });
    } catch (e) {
      toast({ variant: "destructive", title: t("Could not save", "Échec de l'enregistrement"), description: getApiErrorMessage(e) });
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-xl">{row.student_name} <span className="text-sm font-normal text-muted-foreground">{row.class_name}</span></DialogTitle>
      </DialogHeader>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>{t("Blood group", "Groupe sanguin")}</Label>
          <Select value={form.blood_group || "none"} onValueChange={(v) => set("blood_group", v === "none" ? "" : v)} disabled={!canEdit}>
            <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("Unknown", "Inconnu")}</SelectItem>
              {BLOOD_GROUPS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div />
        <div className="sm:col-span-2">
          <Label>{t("Allergies", "Allergies")}</Label>
          <Textarea rows={2} value={form.allergies} readOnly={!canEdit} onChange={(e) => set("allergies", e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Label>{t("Medical conditions", "Maladies / conditions")}</Label>
          <Textarea rows={2} value={form.conditions} readOnly={!canEdit} onChange={(e) => set("conditions", e.target.value)} />
        </div>
        <div>
          <Label>{t("Emergency contact", "Contact d'urgence")}</Label>
          <Input className="h-11" value={form.emergency_contact_name} readOnly={!canEdit} onChange={(e) => set("emergency_contact_name", e.target.value)} />
        </div>
        <div>
          <Label>{t("Emergency phone", "Téléphone d'urgence")}</Label>
          <div className="flex gap-2">
            <Input className="h-11" value={form.emergency_contact_phone} readOnly={!canEdit} onChange={(e) => set("emergency_contact_phone", e.target.value)} />
            {form.emergency_contact_phone && (
              <Button asChild variant="outline" size="icon" className="h-11 w-11 shrink-0"><a href={`tel:${form.emergency_contact_phone}`} aria-label="call"><Phone className="h-4 w-4" /></a></Button>
            )}
          </div>
        </div>
        <div>
          <Label>{t("Doctor", "Médecin")}</Label>
          <Input className="h-11" value={form.doctor_name} readOnly={!canEdit} onChange={(e) => set("doctor_name", e.target.value)} />
        </div>
        <div>
          <Label>{t("Doctor's phone", "Téléphone du médecin")}</Label>
          <Input className="h-11" value={form.doctor_phone} readOnly={!canEdit} onChange={(e) => set("doctor_phone", e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Label>{t("Notes", "Notes")}</Label>
          <Textarea rows={2} value={form.notes} readOnly={!canEdit} onChange={(e) => set("notes", e.target.value)} />
        </div>
      </div>
      {canEdit && (
        <Button className="h-12 w-full text-base" onClick={submit} disabled={save.isPending}>
          {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t("Save health sheet", "Enregistrer le dossier")}
        </Button>
      )}

      <HealthLog student={row.student} canEdit={canEdit} t={t} fr={fr} />
    </>
  );
}

function HealthLog({ student, canEdit, t, fr }: { student: string; canEdit: boolean; t: (en: string, fr: string) => string; fr: boolean }) {
  const { toast } = useToast();
  const entries = useHealthEntries(student);
  const add = useAddHealthEntry();
  const remove = useDeleteHealthEntry(student);
  const [date, setDate] = useState(today());
  const [kind, setKind] = useState<HealthEntryKind>("illness");
  const [note, setNote] = useState("");
  const kindLabel = (k: string) => { const f = KINDS.find((x) => x.value === k); return f ? (fr ? f.fr : f.en) : k; };

  const submit = async () => {
    if (!note.trim()) return;
    try {
      await add.mutateAsync({ student, entry_date: date, kind, note: note.trim() });
      setNote("");
    } catch (e) {
      toast({ variant: "destructive", title: t("Could not add", "Échec de l'ajout"), description: getApiErrorMessage(e) });
    }
  };

  return (
    <div className="space-y-3 border-t pt-4">
      <h3 className="font-semibold">{t("Health log", "Historique de santé")}</h3>
      {canEdit && (
        <div className="space-y-2 rounded-xl bg-muted/40 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Input type="date" className="h-11" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
            <Select value={kind} onValueChange={(v) => setKind(v as HealthEntryKind)}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>{KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{fr ? k.fr : k.en}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("What happened? What was done?", "Que s'est-il passé ? Qu'a-t-on fait ?")} />
          <Button className="h-11 w-full" variant="secondary" onClick={submit} disabled={add.isPending || !note.trim()}>
            <Plus className="mr-2 h-4 w-4" /> {t("Add to log", "Ajouter")}
          </Button>
        </div>
      )}
      {entries.isLoading ? (
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary/40" />
      ) : (entries.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("Nothing recorded.", "Rien d'enregistré.")}</p>
      ) : (
        <ul className="space-y-2">
          {(entries.data ?? []).map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{e.entry_date} · {kindLabel(e.kind)}</p>
                <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{e.note}</p>
                {e.recorded_by_name && <p className="mt-1 text-xs text-muted-foreground">{e.recorded_by_name}</p>}
              </div>
              {canEdit && (
                <Button variant="ghost" size="icon" aria-label="delete" onClick={() => remove.mutate(e.id)}><Trash2 className="h-4 w-4 text-red-600" /></Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
