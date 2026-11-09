"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight, Check, ChevronDown, ChevronRight, Circle, Copy, Loader2, Pencil, Plus, Trash2, Users, Wand2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadError } from "@/components/ui/load-error";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n-context";
import { useRoleLabel } from "@/lib/role-labels";
import { useSchoolSettings } from "@/lib/hooks/useSchools";
import { schoolsService } from "@/lib/api/services/schools.service";
import { gradesService } from "@/lib/api/services/grades.service";
import { hierarchyHubService, type SecondaryStep } from "@/lib/api/services/hierarchy-hub.service";
import { getApiErrorMessage } from "@/lib/api/errors";
import type { HierarchyClass, HierarchyClassSubject, HierarchySubSchool, User } from "@/lib/api/types";

const NONE = "__none__";
type Cycle = "first" | "second";
const CYCLES: Cycle[] = ["first", "second"];

const list = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
const sectionLang = (name: string): "en" | "fr" | null =>
  /engl|anglo/i.test(name) ? "en" : /fran[cç]|franco|french/i.test(name) ? "fr" : null;

type Ask = { title: string; body: string; confirm: string; run: () => Promise<void> } | null;

interface Props {
  schoolId: string;
  sections: HierarchySubSchool[];
  classes: HierarchyClass[];
  links: HierarchyClassSubject[];
  /** TEACHER, SUB_ADMIN and SCHOOL_ADMIN staff: who may teach a subject or be a class master. */
  teachers: User[];
  onChanged: () => Promise<void> | void;
  onExplore: (classId: string) => void;
  /** Open the full manager (the "All settings" view), optionally on one of its tabs. */
  onOpenAdvanced: (tab?: "sub-schools" | "admins" | "classes" | "subjects") => void;
}

/**
 * "Overview" of Hierarchy & Sections for a secondary / higher school: the setup checklist, the
 * counts, and ONE tree (Section -> Cycle -> Class -> Subjects with a teacher each) where the head
 * (or a vice principal inside their section) sets classes, subjects, coefficients, subject teachers
 * and class masters. It only calls the existing hierarchy endpoints plus the small secondary
 * helpers; every control of the full manager stays reachable through "All settings".
 */
export function SecondaryHierarchyOverview({ schoolId, sections, classes, links, teachers, onChanged, onExplore, onOpenAdvanced }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const { language } = useI18n();
  const en = language === "en";
  const roles = useRoleLabel();
  const queryClient = useQueryClient();
  const { data: settings } = useSchoolSettings(schoolId);
  const usesCoefficients = (settings as { assessment_config?: { use_coefficients?: boolean } } | undefined)?.assessment_config?.use_coefficients !== false;

  const summaryQ = useQuery({
    queryKey: ["hierarchy-secondary-summary", schoolId],
    enabled: Boolean(schoolId),
    queryFn: () => hierarchyHubService.secondarySummary(schoolId),
  });
  const summary = summaryQ.data;

  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<Ask>(null);
  const [classDlg, setClassDlg] = useState<{ item: HierarchyClass | null; name: string; section: string; cycle: Cycle } | null>(null);
  const [subjectDlg, setSubjectDlg] = useState<{ klass: HierarchyClass; text: string; coef: string; type: "mandatory" | "optional"; from: string; withTeachers: boolean; also: string[] } | null>(null);
  const [teacherDlg, setTeacherDlg] = useState<{ subjectId: string; name: string; teacher: string; classIds: string[]; picked: string[] } | null>(null);
  const [coefDlg, setCoefDlg] = useState<{ subjectId: string; name: string; value: string; used: number } | null>(null);
  const [quickDlg, setQuickDlg] = useState<{ section: string; language: "en" | "fr"; cycles: Cycle[] } | null>(null);

  const refresh = async () => {
    await onChanged();
    await queryClient.invalidateQueries({ queryKey: ["hierarchy-secondary-summary"] });
  };

  const run = async (work: () => Promise<unknown>, okTitle: string, okDesc?: string) => {
    setBusy(true);
    try {
      await work();
      await refresh();
      toast({ title: okTitle, description: okDesc });
      return true;
    } catch (error) {
      toast({ variant: "destructive", title: en ? "That did not work" : "Action impossible", description: getApiErrorMessage(error, "") });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const linksByClass = useMemo(() => {
    const map = new Map<string, HierarchyClassSubject[]>();
    for (const l of links) map.set(l.school_class, [...(map.get(l.school_class) ?? []), l]);
    return map;
  }, [links]);
  const classesBySection = useMemo(() => {
    const map = new Map<string, HierarchyClass[]>();
    for (const c of classes) map.set(c.sub_school || NONE, [...(map.get(c.sub_school || NONE) ?? []), c]);
    return map;
  }, [classes]);
  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);

  const cycleLabel = (c: Cycle | "other") =>
    c === "first" ? (en ? "First Cycle" : "Premier cycle") : c === "second" ? (en ? "Second Cycle" : "Second cycle") : (en ? "Other classes" : "Autres classes");
  const cycleHint = (c: Cycle) =>
    c === "first" ? (en ? "Forms 1-5 / 6e-3e" : "Forms 1-5 / 6e-3e") : (en ? "Lower & Upper Sixth / 2nde-Tle" : "Lower & Upper Sixth / 2nde-Tle");

  const focusClass = (id: string) => {
    setOpen((p) => ({ ...p, [id]: true }));
    window.setTimeout(() => document.getElementById(`secondary-class-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  };

  // ---- actions (all through the existing hierarchy endpoints)
  const setMaster = (c: HierarchyClass, teacher: string) =>
    run(() => schoolsService.updateHierarchyClass(c.id, { class_master: teacher === NONE ? null : teacher, school_id: schoolId }),
      en ? "Class master saved" : "Maître de classe enregistré", c.name);

  const setLinkTeacher = (l: HierarchyClassSubject, teacher: string) =>
    run(() => schoolsService.updateHierarchySubject(l.id, {
      school_class: l.school_class, subject: l.subject, teacher: teacher === NONE ? null : teacher,
      type: l.type, coefficient: String(l.coefficient ?? 1), school_id: schoolId,
    }), en ? "Subject teacher saved" : "Enseignant de la matière enregistré", `${l.subject_name} - ${l.class_name ?? ""}`);

  const removeLink = (l: HierarchyClassSubject) =>
    setAsk({
      title: en ? `Remove ${l.subject_name} from ${l.class_name}?` : `Retirer ${l.subject_name} de ${l.class_name} ?`,
      body: en ? "Only this class stops offering the subject. The subject stays available for the other classes." : "Seule cette classe n'offre plus la matière. Elle reste disponible pour les autres classes.",
      confirm: en ? "Remove" : "Retirer",
      run: async () => { await run(() => schoolsService.deleteHierarchySubject(l.id), en ? "Subject removed" : "Matière retirée", l.subject_name); },
    });

  const deleteClass = (c: HierarchyClass) => {
    if (Number(c.total_students) > 0) {
      return toast({ variant: "destructive", title: en ? "This class has students" : "Cette classe a des élèves",
        description: en ? `Move its ${c.total_students} student(s) to another class first.` : `Déplacez d'abord ses ${c.total_students} élève(s) dans une autre classe.` });
    }
    setAsk({
      title: en ? `Delete ${c.name}?` : `Supprimer ${c.name} ?`,
      body: en ? "Its subject list is removed with it." : "Sa liste de matières est supprimée avec elle.",
      confirm: en ? "Delete" : "Supprimer",
      run: async () => { await run(() => schoolsService.deleteHierarchyClass(c.id), en ? "Class deleted" : "Classe supprimée", c.name); },
    });
  };

  const saveClass = async () => {
    if (!classDlg) return;
    const name = classDlg.name.trim();
    if (!name) return toast({ variant: "destructive", title: en ? "Class name required" : "Nom de classe requis" });
    const section = classDlg.section === NONE ? "" : classDlg.section;
    if (!section && sections.length > 0) return toast({ variant: "destructive", title: en ? "Pick a section" : "Choisissez une section" });
    const item = classDlg.item;
    const payload = { name, cycle: classDlg.cycle, sub_school: section || null, school_id: schoolId };
    const ok = await run(
      () => (item ? schoolsService.updateHierarchyClass(item.id, payload) : schoolsService.createHierarchyClass(payload)),
      en ? "Class saved" : "Classe enregistrée", name,
    );
    if (ok) setClassDlg(null);
  };

  const saveSubjects = async () => {
    if (!subjectDlg) return;
    const targets = Array.from(new Set([subjectDlg.klass.id, ...subjectDlg.also]));
    if (subjectDlg.from) {
      const from = subjectDlg.from;
      const withTeachers = subjectDlg.withTeachers;
      const ok = await run(() => hierarchyHubService.secondaryApplySubjects({ mode: "copy", from_class: from, classes: targets, with_teachers: withTeachers, school_id: schoolId }),
        en ? "Subjects copied" : "Matières copiées", subjectDlg.klass.name);
      if (ok) setSubjectDlg(null);
      return;
    }
    const names = subjectDlg.text.split(/[,\n;]+/).map((n) => n.trim()).filter(Boolean);
    if (names.length === 0) return toast({ variant: "destructive", title: en ? "Type a subject name" : "Saisissez une matière" });
    const coef = Number(subjectDlg.coef);
    if (usesCoefficients && !(coef > 0)) return toast({ variant: "destructive", title: en ? "Coefficient must be above 0" : "Le coefficient doit être supérieur à 0" });
    const type = subjectDlg.type;
    const ok = await run(() => hierarchyHubService.secondaryApplySubjects({
      mode: "custom", classes: targets, school_id: schoolId,
      subjects: names.map((name) => ({ name, type, ...(usesCoefficients ? { coefficient: coef } : {}) })),
    }), en ? "Subjects added" : "Matières ajoutées", names.join(", "));
    if (ok) setSubjectDlg(null);
  };

  const saveSameTeacher = async () => {
    if (!teacherDlg) return;
    const { subjectId, teacher, picked } = teacherDlg;
    if (picked.length === 0) return toast({ variant: "destructive", title: en ? "Pick at least one class" : "Choisissez au moins une classe" });
    const ok = await run(() => hierarchyHubService.secondarySubjectTeacher({
      subject: subjectId, teacher: teacher === NONE ? null : teacher, classes: picked, school_id: schoolId,
    }), en ? "Teacher saved in the selected classes" : "Enseignant enregistré dans les classes choisies", teacherDlg.name);
    if (ok) setTeacherDlg(null);
  };

  const saveCoefficient = async () => {
    if (!coefDlg) return;
    const value = Number(coefDlg.value);
    if (!(value > 0)) return toast({ variant: "destructive", title: en ? "Coefficient must be above 0" : "Le coefficient doit être supérieur à 0" });
    const ok = await run(() => gradesService.updateSubject(coefDlg.subjectId, { coefficient: value } as never), en ? "Coefficient saved" : "Coefficient enregistré", coefDlg.name);
    if (ok) setCoefDlg(null);
  };

  const runQuick = async () => {
    if (!quickDlg) return;
    const section = quickDlg.section === NONE ? undefined : quickDlg.section;
    if (!section && sections.length > 0) return toast({ variant: "destructive", title: en ? "Pick a section" : "Choisissez une section" });
    if (quickDlg.cycles.length === 0) return toast({ variant: "destructive", title: en ? "Pick a cycle" : "Choisissez un cycle" });
    let made = 0;
    const ok = await run(async () => {
      const res = await hierarchyHubService.secondaryQuickSetup({ sub_school: section, language: quickDlg.language, cycles: quickDlg.cycles, school_id: schoolId });
      made = res.created.length;
    }, en ? "Classes ready" : "Classes prêtes");
    if (ok) {
      toast({ title: made ? (en ? `${made} class(es) created` : `${made} classe(s) créée(s)`) : (en ? "Nothing new: these classes already exist" : "Rien de nouveau : ces classes existent déjà") });
      setQuickDlg(null);
    }
  };

  const openQuick = (sectionId?: string) => {
    const section = sections.find((s) => s.id === sectionId) ?? (sections.length === 1 ? sections[0] : undefined);
    setQuickDlg({ section: section?.id ?? NONE, language: sectionLang(section?.name ?? "") ?? "en", cycles: ["first", "second"] });
  };

  // ---- checklist
  const stepMeta: Record<SecondaryStep["key"], { label: string; help: string }> = {
    sections: { label: en ? "Sections" : "Sections", help: en ? "Sections follow your school type (Anglophone, Francophone, Technical ...). Add extra ones in All settings." : "Les sections suivent le type de l'école (Anglophone, Francophone, Technique ...). Ajoutez-en d'autres dans Tous les réglages." },
    classes: { label: en ? "Classes by cycle" : "Classes par cycle", help: en ? "Add the classes of each cycle (Form 1-5, Lower/Upper Sixth or 6e-3e, 2nde-Tle)." : "Ajoutez les classes de chaque cycle (Form 1-5, Lower/Upper Sixth ou 6e-3e, 2nde-Tle)." },
    subjects: { label: en ? "Subjects per class" : "Matières par classe", help: en ? "Give every class its subjects, with coefficients." : "Donnez à chaque classe ses matières, avec les coefficients." },
    teachers: { label: en ? "Subject teachers" : "Enseignants des matières", help: en ? "Choose the teacher of each subject in each class." : "Choisissez l'enseignant de chaque matière dans chaque classe." },
    class_masters: { label: en ? "Class masters" : "Maîtres de classe", help: en ? "Choose a class master for each class." : "Choisissez un maître de classe pour chaque classe." },
    fees: { label: en ? "Fees per class" : "Frais par classe", help: en ? "Set the school fees of each class." : "Fixez les frais scolaires de chaque classe." },
    pupils: { label: en ? "Students" : "Élèves", help: en ? "Admit your students into their classes." : "Inscrivez vos élèves dans leurs classes." },
  };
  const steps = summary?.steps ?? [];
  const nextStep = steps.find((s) => !s.done);
  const doneCount = steps.filter((s) => s.done).length;
  const goStep = (key: SecondaryStep["key"]) => {
    const rows = summary?.classes ?? [];
    if (key === "sections") return onOpenAdvanced("sub-schools");
    if (key === "classes") return classes.length === 0 ? openQuick() : setClassDlg({ item: null, name: "", section: sections.length === 1 ? sections[0].id : NONE, cycle: "first" });
    if (key === "fees") return router.push("/dashboard/fees");
    if (key === "pupils") return router.push("/dashboard/students");
    const target = key === "subjects" ? rows.find((r) => r.subjects === 0)
      : key === "teachers" ? rows.find((r) => r.without_teacher > 0)
      : rows.find((r) => !r.class_master);
    const klass = target ? classById.get(target.id) : undefined;
    if (!klass) return;
    focusClass(klass.id);
    if (key === "subjects") setSubjectDlg({ klass, text: "", coef: "1", type: "mandatory", from: "", withTeachers: false, also: [] });
  };

  const teacherSelect = (value: string | null | undefined, onChange: (v: string) => void, emptyLabel: string, className = "") => (
    <Select value={value || NONE} onValueChange={onChange} disabled={busy}>
      <SelectTrigger className={`h-9 rounded-xl text-sm ${className}`}><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{emptyLabel}</SelectItem>
        {teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}{t.role !== "TEACHER" ? ` (${roles.label(t.role)})` : ""}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  const classBlock = (c: HierarchyClass) => {
    const rows = linksByClass.get(c.id) ?? [];
    const missing = rows.filter((l) => !l.teacher).length;
    const expanded = open[c.id] ?? false;
    return (
      <div key={c.id} id={`secondary-class-${c.id}`} className="rounded-2xl border border-primary/10 bg-white p-3 shadow-sm sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" className="flex min-w-0 items-center gap-2 text-left" onClick={() => setOpen((p) => ({ ...p, [c.id]: !expanded }))} aria-expanded={expanded}>
            {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-primary" /> : <ChevronRight className="h-4 w-4 shrink-0 text-primary" />}
            <span className="truncate text-lg font-black text-primary">{c.name}</span>
            <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-muted-foreground"><Users className="h-3.5 w-3.5" />{c.total_students}</span>
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-800">{rows.length} {en ? (rows.length === 1 ? "subject" : "subjects") : (rows.length === 1 ? "matière" : "matières")}</span>
            {missing > 0 ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">{missing} {en ? "without teacher" : "sans enseignant"}</span> : null}
            {teacherSelect(c.class_master, (v) => void setMaster(c, v), en ? "No class master" : "Pas de maître de classe", "min-w-[10rem]")}
            <Button variant="outline" size="sm" className="h-9 rounded-xl text-xs font-bold" onClick={() => onExplore(c.id)}>{en ? "Explore" : "Explorer"}</Button>
            <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" aria-label={en ? "Rename or move" : "Renommer ou déplacer"}
              onClick={() => setClassDlg({ item: c, name: c.name, section: c.sub_school || NONE, cycle: (c.cycle === "second" ? "second" : "first") })}><Pencil className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl text-destructive" aria-label={en ? "Delete" : "Supprimer"} onClick={() => deleteClass(c)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>
        {expanded ? (
          <div className="mt-3 space-y-2 border-t border-primary/10 pt-3">
            {rows.length === 0 ? (
              <p className="rounded-xl bg-amber-50/70 p-3 text-sm text-amber-800">{en ? "No subject yet. Add the subjects of this class, or copy them from another class." : "Aucune matière pour l'instant. Ajoutez les matières de cette classe, ou copiez-les d'une autre classe."}</p>
            ) : rows.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-accent/20 p-2">
                <span className="min-w-[8rem] flex-1 text-sm font-bold text-primary">
                  {l.subject_name}
                  {l.type === "optional" ? <span className="ml-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">{en ? "optional" : "optionnelle"}</span> : null}
                </span>
                {usesCoefficients ? (
                  <button type="button" className="rounded-full bg-white px-3 py-1 text-xs font-bold text-sky-800 hover:bg-sky-50"
                    title={en ? "Change coefficient" : "Changer le coefficient"}
                    onClick={() => l.subject && setCoefDlg({ subjectId: l.subject, name: l.subject_name || "", value: String(Number(l.coefficient ?? 1)), used: links.filter((x) => x.subject === l.subject).length })}>
                    {en ? "Coef" : "Coef"} x{Number(l.coefficient ?? 1)}
                  </button>
                ) : null}
                {teacherSelect(l.teacher, (v) => void setLinkTeacher(l, v), en ? "No teacher yet" : "Pas d'enseignant", "min-w-[11rem]")}
                <Button variant="ghost" size="sm" className="h-8 rounded-full px-2 text-xs font-bold text-primary" disabled={!l.subject}
                  title={en ? "Same teacher for this subject in other classes" : "Même enseignant pour cette matière dans d'autres classes"}
                  onClick={() => {
                    if (!l.subject) return;
                    const same = links.filter((x) => x.subject === l.subject).map((x) => x.school_class);
                    setTeacherDlg({ subjectId: l.subject, name: l.subject_name || "", teacher: l.teacher || NONE, classIds: same, picked: same });
                  }}>
                  <Users className="mr-1 h-3.5 w-3.5" />{en ? "Other classes" : "Autres classes"}
                </Button>
                <button type="button" aria-label={en ? "Remove subject" : "Retirer la matière"} className="rounded-full p-1.5 text-muted-foreground hover:bg-white hover:text-destructive" onClick={() => removeLink(l)}><X className="h-4 w-4" /></button>
              </div>
            ))}
            <Button size="sm" variant="outline" className="h-9 gap-1 rounded-full text-xs font-bold"
              onClick={() => setSubjectDlg({ klass: c, text: "", coef: "1", type: "mandatory", from: "", withTeachers: false, also: [] })}>
              <Plus className="h-3.5 w-3.5" />{en ? "Add subjects" : "Ajouter des matières"}
            </Button>
          </div>
        ) : null}
      </div>
    );
  };

  const cycleGroups = (rows: HierarchyClass[]) => {
    const groups: Array<{ key: Cycle | "other"; rows: HierarchyClass[] }> = CYCLES.map((cy) => ({ key: cy, rows: rows.filter((c) => c.cycle === cy) }));
    const other = rows.filter((c) => c.cycle !== "first" && c.cycle !== "second");
    if (other.length) groups.push({ key: "other", rows: other });
    return groups.filter((g) => g.rows.length > 0);
  };

  const sectionBlock = (key: string, name: string, rows: HierarchyClass[], item?: HierarchySubSchool) => {
    const expanded = open[`s-${key}`] ?? true;
    const pupils = rows.reduce((sum, c) => sum + (Number(c.total_students) || 0), 0);
    return (
      <Card key={key} className="rounded-3xl border-none shadow-sm">
        <CardContent className="space-y-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" className="flex flex-wrap items-center gap-2 text-left" onClick={() => setOpen((p) => ({ ...p, [`s-${key}`]: !expanded }))} aria-expanded={expanded}>
              {expanded ? <ChevronDown className="h-5 w-5 text-primary" /> : <ChevronRight className="h-5 w-5 text-primary" />}
              <span className="text-xl font-black text-primary">{name}</span>
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">{rows.length} {en ? "classes" : "classes"} - {pupils} {en ? "students" : "élèves"}</span>
              {item?.vice_principal_name ? <span className="text-xs font-semibold text-muted-foreground">{en ? "VP" : "VP"}: {item.vice_principal_name}</span> : null}
            </button>
            <div className="flex gap-2">
              <Button size="sm" className="h-9 gap-1 rounded-xl font-bold" onClick={() => setClassDlg({ item: null, name: "", section: item?.id ?? NONE, cycle: "first" })}><Plus className="h-4 w-4" />{en ? "Add class" : "Ajouter une classe"}</Button>
              <Button size="sm" variant="outline" className="h-9 gap-1 rounded-xl font-bold" onClick={() => openQuick(item?.id)}><Wand2 className="h-4 w-4" />{en ? "Standard classes" : "Classes standard"}</Button>
            </div>
          </div>
          {expanded ? (
            rows.length === 0 ? (
              <p className="rounded-2xl bg-accent/20 p-4 text-sm text-muted-foreground">{en ? "No class in this section yet. Add one, or create the standard classes of a cycle in one click." : "Aucune classe dans cette section. Ajoutez-en une, ou créez les classes standard d'un cycle en un clic."}</p>
            ) : (
              <div className="space-y-3">{cycleGroups(rows).map((g) => (
                <div key={g.key} className="space-y-2 rounded-2xl border border-primary/10 bg-primary/[0.02] p-3">
                  <p className="text-sm font-black uppercase tracking-wide text-primary">
                    {cycleLabel(g.key)} {g.key !== "other" ? <span className="font-semibold normal-case text-muted-foreground">({cycleHint(g.key)})</span> : null}
                  </p>
                  {g.rows.map(classBlock)}
                </div>
              ))}</div>
            )
          ) : null}
        </CardContent>
      </Card>
    );
  };

  const counts = summary?.counts;
  const card = (label: string, value: string | number, sub?: string) => (
    <div className="rounded-2xl bg-white p-4 text-center shadow-sm">
      <p className="text-2xl font-black text-primary">{value}</p>
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
      {sub ? <p className="mt-0.5 text-xs font-semibold text-muted-foreground">{sub}</p> : null}
    </div>
  );

  const unsectioned = classesBySection.get(NONE) ?? [];
  const alsoCandidates = subjectDlg ? classes.filter((c) => c.id !== subjectDlg.klass.id && (c.sub_school || NONE) === (subjectDlg.klass.sub_school || NONE)) : [];

  return (
    <div className="space-y-6">
      {summaryQ.isError ? <LoadError message={en ? "The setup progress could not be loaded." : "La progression de la configuration n'a pas pu être chargée."} onRetry={() => void summaryQ.refetch()} /> : null}

      {/* Setup progress */}
      <Card className="rounded-3xl border-none shadow-sm">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-primary">{en ? "Setup progress" : "Progression de la configuration"}</h2>
              <p className="text-sm text-muted-foreground">
                {summaryQ.isLoading ? "..." : nextStep ? stepMeta[nextStep.key].help : (en ? "Your school structure is complete." : "La structure de votre école est complète.")}
              </p>
            </div>
            {nextStep ? (
              <Button className="h-11 gap-2 rounded-xl font-bold" onClick={() => goStep(nextStep.key)}>
                {en ? "Next step" : "Étape suivante"}: {stepMeta[nextStep.key].label}<ArrowRight className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-primary/10"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${steps.length ? (doneCount / steps.length) * 100 : 0}%` }} /></div>
          <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <li key={s.key}>
                <button type="button" onClick={() => goStep(s.key)} className={`flex h-full w-full items-center gap-3 rounded-2xl border p-3 text-left ${s.done ? "border-emerald-200 bg-emerald-50/60" : "border-primary/10 bg-white hover:bg-accent/30"}`}>
                  {s.done ? <Check className="h-5 w-5 shrink-0 text-emerald-600" /> : <Circle className="h-5 w-5 shrink-0 text-muted-foreground" />}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-primary">{i + 1}. {stepMeta[s.key].label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {s.total != null ? `${s.count} / ${s.total}` : s.key === "sections" && s.optional ? (en ? "optional" : "facultatif") : s.count}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {/* Counts */}
      {counts ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {card(en ? "Sections" : "Sections", counts.sections)}
          {card(en ? "Classes" : "Classes", counts.classes, `${counts.first_cycle} ${en ? "1st cycle" : "1er cycle"} / ${counts.second_cycle} ${en ? "2nd cycle" : "2nd cycle"}`)}
          {card(en ? "Subjects" : "Matières", counts.subjects, `${counts.subject_links} ${en ? "class links" : "liens classe"}`)}
          {card(en ? "Teachers" : "Enseignants", counts.teachers, `${counts.teachers_assigned} ${en ? "assigned" : "affectés"} / ${counts.teachers_unassigned} ${en ? "free" : "libres"}`)}
          {card(en ? "Class masters" : "Maîtres de classe", `${steps.find((s) => s.key === "class_masters")?.count ?? 0}/${counts.classes}`)}
          {card(en ? "Students" : "Élèves", counts.pupils)}
        </div>
      ) : null}

      {/* Teachers with no assignment yet */}
      {summary && summary.teachers.some((t) => !t.assigned) ? (
        <p className="rounded-2xl bg-amber-50/70 p-3 text-sm text-amber-800">
          {en ? "Teachers without a subject or class yet: " : "Enseignants sans matière ni classe : "}
          {summary.teachers.filter((t) => !t.assigned).map((t) => t.name).join(", ")}
        </p>
      ) : null}

      {/* Guided empty state */}
      {classes.length === 0 ? (
        <Card className="rounded-3xl border-none bg-primary/5 shadow-sm">
          <CardContent className="flex flex-col items-start gap-3 p-6">
            <h3 className="text-lg font-black text-primary">{en ? "Start with your classes" : "Commencez par vos classes"}</h3>
            <p className="text-sm text-muted-foreground">{en ? "Create the standard classes of your cycles in one click (no subjects are added), or add your own classes one by one." : "Créez en un clic les classes standard de vos cycles (aucune matière n'est ajoutée), ou ajoutez vos classes une à une."}</p>
            <div className="flex flex-wrap gap-2">
              <Button className="h-11 gap-2 rounded-xl font-bold" onClick={() => openQuick()}><Wand2 className="h-4 w-4" />{en ? "Create standard classes" : "Créer les classes standard"}</Button>
              <Button variant="outline" className="h-11 gap-2 rounded-xl font-bold" onClick={() => setClassDlg({ item: null, name: "", section: sections.length === 1 ? sections[0].id : NONE, cycle: "first" })}><Plus className="h-4 w-4" />{en ? "Add a class" : "Ajouter une classe"}</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Tree: Section -> Cycle -> Class -> Subjects */}
      <div className="space-y-4">
        {sections.map((s) => sectionBlock(s.id, s.name, classesBySection.get(s.id) ?? [], s))}
        {unsectioned.length > 0 || sections.length === 0 ? sectionBlock(NONE, sections.length === 0 ? (en ? "Whole school" : "Toute l'école") : (en ? "Classes without a section" : "Classes sans section"), unsectioned) : null}
      </div>

      {/* Add / edit class */}
      <Dialog open={Boolean(classDlg)} onOpenChange={(o) => !o && setClassDlg(null)}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-primary">{classDlg?.item ? (en ? "Rename or move class" : "Renommer ou déplacer la classe") : (en ? "Add a class" : "Ajouter une classe")}</DialogTitle>
            <DialogDescription>{en ? "Class names are unique in the school (e.g. Form 5 Science A, Terminale C)." : "Les noms de classe sont uniques dans l'école (ex. Form 5 Science A, Terminale C)."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>{en ? "Class name" : "Nom de la classe"}</Label><Input value={classDlg?.name ?? ""} onChange={(e) => setClassDlg((p) => p && { ...p, name: e.target.value })} placeholder="Form 1" /></div>
            <div className="space-y-1"><Label>{en ? "Cycle" : "Cycle"}</Label>
              <Select value={classDlg?.cycle ?? "first"} onValueChange={(v) => setClassDlg((p) => p && { ...p, cycle: v as Cycle })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CYCLES.map((cy) => <SelectItem key={cy} value={cy}>{cycleLabel(cy)} ({cycleHint(cy)})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {sections.length > 0 ? (
              <div className="space-y-1"><Label>{en ? "Section" : "Section"}</Label>
                <Select value={classDlg?.section ?? NONE} onValueChange={(v) => setClassDlg((p) => p && { ...p, section: v })}>
                  <SelectTrigger><SelectValue placeholder={en ? "Pick a section" : "Choisissez une section"} /></SelectTrigger>
                  <SelectContent>{sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setClassDlg(null)}>{en ? "Cancel" : "Annuler"}</Button>
            <Button className="flex-1 rounded-xl" disabled={busy} onClick={() => void saveClass()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : (en ? "Save" : "Enregistrer")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add subjects / copy */}
      <Dialog open={Boolean(subjectDlg)} onOpenChange={(o) => !o && setSubjectDlg(null)}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-primary">{en ? "Subjects of" : "Matières de"} {subjectDlg?.klass.name}</DialogTitle>
            <DialogDescription>{en ? "Type your own subjects (separate with commas), or copy another class's subjects. Nothing is added by default." : "Saisissez vos propres matières (séparées par des virgules), ou copiez celles d'une autre classe. Rien n'est ajouté par défaut."}</DialogDescription>
          </DialogHeader>
          {subjectDlg ? (
            <div className="space-y-3">
              <div className="space-y-1"><Label>{en ? "Subjects" : "Matières"}</Label><Input value={subjectDlg.text} disabled={Boolean(subjectDlg.from)} onChange={(e) => setSubjectDlg((p) => p && { ...p, text: e.target.value })} placeholder={en ? "Mathematics, English, Physics" : "Mathématiques, Français, Physique"} /></div>
              <div className="grid grid-cols-2 gap-3">
                {usesCoefficients ? <div className="space-y-1"><Label>{en ? "Coefficient" : "Coefficient"}</Label><Input type="number" min="0.01" step="0.01" value={subjectDlg.coef} disabled={Boolean(subjectDlg.from)} onChange={(e) => setSubjectDlg((p) => p && { ...p, coef: e.target.value })} /></div> : null}
                <div className="space-y-1"><Label>{en ? "Type" : "Type"}</Label>
                  <Select value={subjectDlg.type} onValueChange={(v) => setSubjectDlg((p) => p && { ...p, type: v as "mandatory" | "optional" })} disabled={Boolean(subjectDlg.from)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="mandatory">{en ? "Mandatory" : "Obligatoire"}</SelectItem><SelectItem value="optional">{en ? "Optional" : "Optionnelle"}</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1"><Label className="flex items-center gap-1"><Copy className="h-3.5 w-3.5" />{en ? "Or copy the subjects of another class" : "Ou copier les matières d'une autre classe"}</Label>
                <Select value={subjectDlg.from || NONE} onValueChange={(v) => setSubjectDlg((p) => p && { ...p, from: v === NONE ? "" : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value={NONE}>{en ? "Do not copy" : "Ne pas copier"}</SelectItem>
                    {classes.filter((c) => c.id !== subjectDlg.klass.id && (linksByClass.get(c.id)?.length ?? 0) > 0).map((c) => <SelectItem key={c.id} value={c.id}>{c.name} ({linksByClass.get(c.id)?.length})</SelectItem>)}
                  </SelectContent>
                </Select>
                {subjectDlg.from ? (
                  <label className="mt-1 flex items-center gap-2 text-sm"><input type="checkbox" checked={subjectDlg.withTeachers} onChange={(e) => setSubjectDlg((p) => p && { ...p, withTeachers: e.target.checked })} />{en ? "Copy the subject teachers too" : "Copier aussi les enseignants"}</label>
                ) : null}
              </div>
              {alsoCandidates.length > 0 ? (
                <div className="space-y-1"><Label>{en ? "Apply to other classes of this section too" : "Appliquer aussi aux autres classes de cette section"}</Label>
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-primary/10 p-2">
                    {alsoCandidates.map((c) => (
                      <label key={c.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={subjectDlg.also.includes(c.id)} onChange={(e) => setSubjectDlg((p) => p && { ...p, also: e.target.checked ? [...p.also, c.id] : p.also.filter((x) => x !== c.id) })} />{c.name}</label>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setSubjectDlg(null)}>{en ? "Cancel" : "Annuler"}</Button>
            <Button className="flex-1 rounded-xl" disabled={busy} onClick={() => void saveSubjects()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : (subjectDlg?.from ? (en ? "Copy" : "Copier") : (en ? "Add" : "Ajouter"))}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Same teacher across classes */}
      <Dialog open={Boolean(teacherDlg)} onOpenChange={(o) => !o && setTeacherDlg(null)}>
        <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-primary">{teacherDlg?.name}</DialogTitle>
            <DialogDescription>{en ? "Choose one teacher for this subject in all the classes you tick." : "Choisissez un enseignant pour cette matière dans toutes les classes cochées."}</DialogDescription>
          </DialogHeader>
          {teacherDlg ? (
            <div className="space-y-3">
              {teacherSelect(teacherDlg.teacher === NONE ? null : teacherDlg.teacher, (v) => setTeacherDlg((p) => p && { ...p, teacher: v }), en ? "No teacher" : "Pas d'enseignant", "w-full")}
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-primary/10 p-2">
                {teacherDlg.classIds.map((id) => (
                  <label key={id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={teacherDlg.picked.includes(id)} onChange={(e) => setTeacherDlg((p) => p && { ...p, picked: e.target.checked ? [...p.picked, id] : p.picked.filter((x) => x !== id) })} />{classById.get(id)?.name ?? id}</label>
                ))}
              </div>
            </div>
          ) : null}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setTeacherDlg(null)}>{en ? "Cancel" : "Annuler"}</Button>
            <Button className="flex-1 rounded-xl" disabled={busy} onClick={() => void saveSameTeacher()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : (en ? "Save" : "Enregistrer")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Coefficient */}
      <Dialog open={Boolean(coefDlg)} onOpenChange={(o) => !o && setCoefDlg(null)}>
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-primary">{en ? "Coefficient" : "Coefficient"}: {coefDlg?.name}</DialogTitle>
            <DialogDescription>{en ? `The coefficient belongs to the subject, so it changes in all ${coefDlg?.used ?? 1} class(es) that offer it.` : `Le coefficient appartient à la matière : il change dans les ${coefDlg?.used ?? 1} classe(s) qui l'offrent.`}</DialogDescription>
          </DialogHeader>
          <Input type="number" min="0.01" step="0.01" value={coefDlg?.value ?? ""} onChange={(e) => setCoefDlg((p) => p && { ...p, value: e.target.value })} />
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setCoefDlg(null)}>{en ? "Cancel" : "Annuler"}</Button>
            <Button className="flex-1 rounded-xl" disabled={busy} onClick={() => void saveCoefficient()}>{en ? "Save" : "Enregistrer"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Standard classes */}
      <Dialog open={Boolean(quickDlg)} onOpenChange={(o) => !o && setQuickDlg(null)}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-primary">{en ? "Standard classes" : "Classes standard"}</DialogTitle>
            <DialogDescription>{en ? "Adds the classes that do not exist yet. Existing classes are kept as they are, and no subject is added." : "Ajoute les classes qui n'existent pas encore. Les classes existantes sont conservées et aucune matière n'est ajoutée."}</DialogDescription>
          </DialogHeader>
          {quickDlg ? (
            <div className="space-y-3">
              {sections.length > 0 ? (
                <div className="space-y-1"><Label>{en ? "Section" : "Section"}</Label>
                  <Select value={quickDlg.section} onValueChange={(v) => setQuickDlg((p) => p && { ...p, section: v, language: sectionLang(sections.find((s) => s.id === v)?.name ?? "") ?? p.language })}>
                    <SelectTrigger><SelectValue placeholder={en ? "Pick a section" : "Choisissez une section"} /></SelectTrigger>
                    <SelectContent>{sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              ) : null}
              <div className="space-y-1"><Label>{en ? "Naming" : "Nomenclature"}</Label>
                <Select value={quickDlg.language} onValueChange={(v) => setQuickDlg((p) => p && { ...p, language: v as "en" | "fr" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="en">Anglophone: Form 1-5, Lower/Upper Sixth</SelectItem><SelectItem value="fr">Francophone: 6ème-3ème, Seconde, Première, Terminale</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                {CYCLES.map((cy) => (
                  <label key={cy} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={quickDlg.cycles.includes(cy)} onChange={(e) => setQuickDlg((p) => p && { ...p, cycles: e.target.checked ? [...p.cycles, cy] : p.cycles.filter((x) => x !== cy) })} />{cycleLabel(cy)} ({cycleHint(cy)})</label>
                ))}
              </div>
            </div>
          ) : null}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setQuickDlg(null)}>{en ? "Cancel" : "Annuler"}</Button>
            <Button className="flex-1 rounded-xl" disabled={busy} onClick={() => void runQuick()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : (en ? "Create classes" : "Créer les classes")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm */}
      <Dialog open={Boolean(ask)} onOpenChange={(o) => !o && setAsk(null)}>
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader><DialogTitle className="text-xl font-black text-primary">{ask?.title}</DialogTitle><DialogDescription>{ask?.body}</DialogDescription></DialogHeader>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setAsk(null)}>{en ? "Cancel" : "Annuler"}</Button>
            <Button variant="destructive" className="flex-1 rounded-xl" onClick={async () => { const a = ask; setAsk(null); await a?.run(); }}>{ask?.confirm}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
