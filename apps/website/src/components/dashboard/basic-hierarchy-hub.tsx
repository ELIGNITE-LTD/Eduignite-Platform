"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown, ArrowUp, Check, ChevronDown, ChevronRight, Circle, Copy, Layers, Loader2, Pencil, Plus, School, Trash2, UserCog, Users, Wand2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadError } from "@/components/ui/load-error";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { useEducationCategory } from "@/lib/hooks/useEducationCategory";
import { useSchoolSettings } from "@/lib/hooks/useSchools";
import { schoolsService } from "@/lib/api/services/schools.service";
import { gradesService } from "@/lib/api/services/grades.service";
import { hierarchyHubService, type HubStep } from "@/lib/api/services/hierarchy-hub.service";
import { getApiErrorMessage } from "@/lib/api/errors";
import { basicCycleForClassName } from "@/lib/education-terms";
import type { ClassLevel, HierarchyClass, HierarchyClassSubject, HierarchySubSchool, User } from "@/lib/api/types";

const NONE = "__none__";
const TABS = ["overview", "sections", "levels", "classes", "subjects", "teachers"] as const;
type Tab = (typeof TABS)[number];

const list = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

const sectionLang = (name: string): "en" | "fr" | null =>
  /engl|anglo/i.test(name) ? "en" : /fran[cç]|franco|french/i.test(name) ? "fr" : null;

const CLASS_NAMES = {
  en: ["Nursery 1", "Nursery 2", "Nursery 3", "Class 1", "Class 2", "Class 3", "Class 4", "Class 5", "Class 6"],
  fr: ["Maternelle 1", "Maternelle 2", "Maternelle 3", "SIL", "CP", "CE1", "CE2", "CM1", "CM2"],
};

type Ask = { title: string; body: string; confirm: string; run: () => Promise<void> } | null;

/**
 * "Hierarchy & Sections" for a nursery/primary school: ONE guided hub where the head sets up
 * Section -> Class -> Subjects -> Class teacher, then sees fees and pupils fall into place.
 * Every list below is fed by the same react-query hooks, so a change anywhere refreshes everywhere.
 */
export function BasicHierarchyHub() {
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const { language } = useI18n();
  const en = language === "en";
  const category = useEducationCategory();
  const queryClient = useQueryClient();
  const schoolId = user?.school?.id || "";
  const isHead = user?.role === "SCHOOL_ADMIN";
  const allowed = (isHead || user?.role === "SUB_ADMIN") && category === "basic";
  const { data: settings } = useSchoolSettings(allowed ? schoolId : "");
  const usesCoefficients = (settings as { assessment_config?: { use_coefficients?: boolean } } | undefined)?.assessment_config?.use_coefficients !== false;

  const [tab, setTab] = useState<Tab>("overview");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<Ask>(null);

  // Dialog state
  const [sectionDlg, setSectionDlg] = useState<{ item: HierarchySubSchool | null; name: string } | null>(null);
  const [classDlg, setClassDlg] = useState<{ item: HierarchyClass | null; names: string; section: string; level?: string; streams?: string; count?: string } | null>(null);
  const [levelDlg, setLevelDlg] = useState<{ item: ClassLevel | null; name: string; cycle: "nursery" | "primary"; is_final: boolean } | null>(null);
  const [subjectDlg, setSubjectDlg] = useState<{ klass: HierarchyClass } | null>(null);
  const [coefDlg, setCoefDlg] = useState<{ subjectId: string; name: string; value: string } | null>(null);
  const [wizard, setWizard] = useState(false);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const wanted = params.get("tab") as Tab | null;
      if (wanted && TABS.includes(wanted)) setTab(wanted);
      if (params.get("add") === "section") setSectionDlg({ item: null, name: "" });
      if (params.get("add") === "class") setClassDlg({ item: null, names: "", section: "" });
    } catch {
      /* no window (SSR) */
    }
  }, []);

  useEffect(() => {
    if (user && !allowed) router.replace(user.role === "SCHOOL_ADMIN" ? "/dashboard/institution" : "/dashboard");
  }, [user, allowed, router]);

  // ---- shared data hooks (all keys start with "hierarchy-" so any hierarchy write refreshes them)
  const on = allowed && Boolean(schoolId);
  const sectionsQ = useQuery({ queryKey: ["hierarchy-sections", schoolId], enabled: on, queryFn: () => schoolsService.getSubSchools(schoolId) });
  const classesQ = useQuery({ queryKey: ["hierarchy-classes", schoolId], enabled: on, queryFn: () => schoolsService.getHierarchyClasses({ school_id: schoolId }) });
  const linksQ = useQuery({ queryKey: ["hierarchy-class-subjects", schoolId], enabled: on, queryFn: () => schoolsService.getHierarchySubjects({ school_id: schoolId }) });
  const staffQ = useQuery({ queryKey: ["hierarchy-staff", schoolId], enabled: on, queryFn: () => schoolsService.getHierarchyStaff(schoolId) });
  const summaryQ = useQuery({ queryKey: ["hierarchy-summary", schoolId], enabled: on, queryFn: () => hierarchyHubService.summary() });
  const levelsQ = useQuery({ queryKey: ["hierarchy-levels", schoolId], enabled: on, queryFn: () => hierarchyHubService.levels() });

  const sections = list<HierarchySubSchool>(sectionsQ.data);
  const classes = list<HierarchyClass>(classesQ.data);
  const links = list<HierarchyClassSubject>(linksQ.data);
  const teachers = list<User>(staffQ.data).filter((m) => m?.role === "TEACHER");
  const summary = summaryQ.data;
  const levels = list<ClassLevel>(levelsQ.data);
  const loading = !allowed || sectionsQ.isLoading || classesQ.isLoading || linksQ.isLoading;
  const failed = sectionsQ.isError || classesQ.isError || linksQ.isError || summaryQ.isError;

  const refresh = () => queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("hierarchy-") });

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

  const classesBySection = useMemo(() => {
    const map = new Map<string, HierarchyClass[]>();
    for (const c of classes) {
      const key = c.sub_school || NONE;
      map.set(key, [...(map.get(key) ?? []), c]);
    }
    return map;
  }, [classes]);

  const classesByLevel = useMemo(() => {
    const map = new Map<string, HierarchyClass[]>();
    for (const c of classes) {
      const key = c.level || NONE;
      map.set(key, [...(map.get(key) ?? []), c]);
    }
    return map;
  }, [classes]);

  const linksByClass = useMemo(() => {
    const map = new Map<string, HierarchyClassSubject[]>();
    for (const l of links) map.set(l.school_class, [...(map.get(l.school_class) ?? []), l]);
    return map;
  }, [links]);

  const teacherLoad = useMemo(() => new Map((summary?.teachers ?? []).map((t) => [t.id, t.load])), [summary]);

  const subjectRows = useMemo(() => {
    const by = new Map<string, { id: string; name: string; code: string; coefficient: string; classIds: string[] }>();
    for (const l of links) {
      if (!l.subject) continue;
      const row = by.get(l.subject) ?? { id: l.subject, name: l.subject_name || "", code: l.subject_code || "", coefficient: String(l.coefficient ?? "1"), classIds: [] };
      row.classIds.push(l.school_class);
      by.set(l.subject, row);
    }
    return Array.from(by.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [links]);

  const sectionName = (id?: string | null) => sections.find((s) => s.id === id)?.name || (en ? "Unassigned" : "Sans section");
  const multiSection = sections.length > 1;
  const isNursery = (c: HierarchyClass) => (c.cycle || basicCycleForClassName(c.name)) === "nursery";

  // ---- actions
  const saveSection = async () => {
    if (!sectionDlg) return;
    const name = sectionDlg.name.trim();
    if (!name) return toast({ variant: "destructive", title: en ? "Section name required" : "Nom de section requis" });
    if (sections.some((s) => s.id !== sectionDlg.item?.id && s.name.trim().toLowerCase() === name.toLowerCase())) {
      return toast({ variant: "destructive", title: en ? "Name already used" : "Nom deja utilise" });
    }
    const item = sectionDlg.item;
    const ok = await run(
      () => (item
        ? schoolsService.updateSubSchool(item.id, { school_id: schoolId, vice_principal: item.vice_principal ?? null, ...(item.is_system_managed || name === item.name ? {} : { name }) })
        : schoolsService.createSubSchool({ name, school_id: schoolId })),
      en ? "Section saved" : "Section enregistree", name,
    );
    if (ok) setSectionDlg(null);
  };

  const deleteSection = (item: HierarchySubSchool) => {
    const count = (classesBySection.get(item.id) ?? []).length;
    if (count > 0) {
      return toast({ variant: "destructive", title: en ? "This section has classes" : "Cette section a des classes",
        description: en ? `Move or delete its ${count} class(es) first.` : `Deplacez ou supprimez d'abord ses ${count} classe(s).` });
    }
    setAsk({
      title: en ? `Delete ${item.name}?` : `Supprimer ${item.name} ?`, body: en ? "The section is empty, so nothing else is affected." : "La section est vide, rien d'autre n'est touche.",
      confirm: en ? "Delete" : "Supprimer",
      run: async () => { await run(() => schoolsService.deleteSubSchool(item.id), en ? "Section deleted" : "Section supprimee", item.name); },
    });
  };

  const saveClass = async () => {
    if (!classDlg) return;
    const { item, section } = classDlg;
    const picked = section || (sections.length === 1 ? sections[0].id : "");
    if (!picked) return toast({ variant: "destructive", title: en ? "Pick a section" : "Choisissez une section" });
    const level = classDlg.level && classDlg.level !== NONE ? classDlg.level : "";
    const streams = (classDlg.streams ?? "").split(/[,\n;]+/).map((n) => n.trim()).filter(Boolean);
    if (item) {
      if (level) {
        const ok = await run(
          () => schoolsService.updateHierarchyClass(item.id, { level, stream: streams[0] ?? "", sub_school: picked, school_id: schoolId }),
          en ? "Class saved" : "Classe enregistree",
        );
        if (ok) setClassDlg(null);
        return;
      }
      const name = classDlg.names.trim();
      if (!name) return toast({ variant: "destructive", title: en ? "Class name required" : "Nom de classe requis" });
      const ok = await run(
        () => schoolsService.updateHierarchyClass(item.id, { name, level: null, stream: "", sub_school: picked, cycle: basicCycleForClassName(name) as HierarchyClass["cycle"], school_id: schoolId }),
        en ? "Class saved" : "Classe enregistree", name,
      );
      if (ok) setClassDlg(null);
      return;
    }
    if (level) {
      const count = Math.max(1, Math.min(26, Number(classDlg.count) || 1));
      const ok = await run(async () => {
        const res = await hierarchyHubService.bulkClasses({ level, sub_school: picked, ...(streams.length ? { streams } : { count }) });
        if (!res.created.length && !(res.adopted?.length)) throw new Error(en ? "These classes already exist." : "Ces classes existent deja.");
      }, en ? "Classes added" : "Classes ajoutees", streams.length ? streams.join(", ") : `+${count}`);
      if (ok) setClassDlg(null);
      return;
    }
    const names = classDlg.names.split(/[,\n;]+/).map((n) => n.trim()).filter(Boolean);
    if (names.length === 0) return toast({ variant: "destructive", title: en ? "Class name required" : "Nom de classe requis" });
    const ok = await run(async () => {
      const res = await hierarchyHubService.bulkClasses({ names, sub_school: picked });
      if (res.existing.length && !res.created.length) {
        throw new Error(en ? "These classes already exist." : "Ces classes existent deja.");
      }
    }, en ? "Classes added" : "Classes ajoutees", names.join(", "));
    if (ok) setClassDlg(null);
  };

  const saveLevel = async () => {
    if (!levelDlg) return;
    const name = levelDlg.name.trim();
    if (!name) return toast({ variant: "destructive", title: en ? "Level name required" : "Nom de niveau requis" });
    const item = levelDlg.item;
    const ok = await run(
      () => (item
        ? hierarchyHubService.updateLevel(item.id, { name, cycle: levelDlg.cycle, is_final: levelDlg.is_final })
        : hierarchyHubService.createLevel({ name, cycle: levelDlg.cycle, is_final: levelDlg.is_final })),
      en ? "Level saved" : "Niveau enregistre", name,
    );
    if (ok) setLevelDlg(null);
  };

  const deleteLevel = (l: ClassLevel) => {
    if ((l.classes ?? 0) > 0) {
      return toast({ variant: "destructive", title: en ? "This level has classes" : "Ce niveau a des classes",
        description: en ? `Move or delete its ${l.classes} class(es) first.` : `Deplacez ou supprimez d'abord ses ${l.classes} classe(s).` });
    }
    setAsk({
      title: en ? `Delete ${l.name}?` : `Supprimer ${l.name} ?`, body: en ? "The level is empty, so nothing else is affected." : "Le niveau est vide, rien d'autre n'est touche.",
      confirm: en ? "Delete" : "Supprimer",
      run: async () => { await run(() => hierarchyHubService.deleteLevel(l.id), en ? "Level deleted" : "Niveau supprime", l.name); },
    });
  };

  const moveLevel = (index: number, delta: number) => {
    const ids = levels.map((l) => l.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    return run(() => hierarchyHubService.reorderLevels(ids), en ? "Order saved" : "Ordre enregistre");
  };

  const deleteClass = (c: HierarchyClass) => {
    if (Number(c.total_students) > 0) {
      return toast({ variant: "destructive", title: en ? "This class has pupils" : "Cette classe a des eleves",
        description: en ? `Move its ${c.total_students} pupil(s) to another class first.` : `Deplacez d'abord ses ${c.total_students} eleve(s) dans une autre classe.` });
    }
    setAsk({
      title: en ? `Delete ${c.name}?` : `Supprimer ${c.name} ?`,
      body: en ? "Its subject list is removed with it. Classes with marks cannot be deleted." : "Sa liste de matieres est supprimee avec elle. Une classe ayant des notes ne peut pas etre supprimee.",
      confirm: en ? "Delete" : "Supprimer",
      run: async () => { await run(() => schoolsService.deleteHierarchyClass(c.id), en ? "Class deleted" : "Classe supprimee", c.name); },
    });
  };

  const setTeacher = (c: HierarchyClass, teacher: string) =>
    run(() => hierarchyHubService.setClassTeacher(c.id, teacher === NONE ? null : teacher), en ? "Class teacher saved" : "Titulaire enregistre", c.name);

  const removeLink = (l: HierarchyClassSubject) =>
    run(() => schoolsService.deleteHierarchySubject(l.id), en ? "Subject removed" : "Matiere retiree", l.subject_name);

  const saveCoefficient = async () => {
    if (!coefDlg) return;
    const value = Number(coefDlg.value);
    if (!(value > 0)) return toast({ variant: "destructive", title: en ? "Coefficient must be above 0" : "Le coefficient doit etre superieur a 0" });
    const ok = await run(() => gradesService.updateSubject(coefDlg.subjectId, { coefficient: value } as never), en ? "Coefficient saved" : "Coefficient enregistre", coefDlg.name);
    if (ok) setCoefDlg(null);
  };

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary/30" /></div>;
  }

  // ---- small renderers
  const stepMeta: Record<HubStep["key"], { label: string; target: Tab | "link"; href?: string }> = {
    sections: { label: en ? "Sections" : "Sections", target: "sections" },
    levels: { label: en ? "Levels" : "Niveaux", target: "levels" },
    classes: { label: en ? "Classes" : "Classes", target: "classes" },
    subjects: { label: en ? "Subjects per class" : "Matieres par classe", target: "subjects" },
    teachers: { label: en ? "Class teachers" : "Titulaires", target: "teachers" },
    fees: { label: en ? "Fees per class" : "Frais par classe", target: "link", href: "/dashboard/fees" },
    pupils: { label: en ? "Pupils" : "Eleves", target: "link", href: "/dashboard/students" },
  };
  const nextHelp: Record<HubStep["key"], string> = {
    sections: en ? "Add your English and/or French section." : "Ajoutez votre section anglophone et/ou francophone.",
    levels: en ? "Add your levels (Class 1, Class 2 ...): the level decides where pupils go next." : "Ajoutez vos niveaux (CP, CE1 ...) : le niveau decide de la classe suivante.",
    classes: en ? "Add the classes of each level (Class 1 A, Class 1 B ...)." : "Ajoutez les classes de chaque niveau (CP A, CP B ...).",
    subjects: en ? "Add the subjects of each class, or copy them from another class." : "Ajoutez les matieres de chaque classe, ou copiez-les d'une autre classe.",
    teachers: en ? "Choose a class teacher for each class." : "Choisissez un titulaire pour chaque classe.",
    fees: en ? "Set the school fees of each class." : "Fixez les frais scolaires de chaque classe.",
    pupils: en ? "Admit your pupils into their classes." : "Inscrivez vos eleves dans leurs classes.",
  };
  const steps = summary?.steps ?? [];
  const nextStep = steps.find((s) => !s.done);
  const doneCount = steps.filter((s) => s.done).length;
  const goStep = (s: HubStep["key"]) => {
    const meta = stepMeta[s];
    if (meta.target === "link" && meta.href) router.push(meta.href);
    else setTab(meta.target as Tab);
  };
  const emptySchool = classes.length === 0;

  const teacherSelect = (c: HierarchyClass) => (
    <Select value={c.class_master || NONE} onValueChange={(v) => void setTeacher(c, v)} disabled={busy}>
      <SelectTrigger className="h-9 min-w-[10rem] rounded-xl text-sm"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{en ? "No class teacher" : "Pas de titulaire"}</SelectItem>
        {teachers.map((t) => {
          const load = teacherLoad.get(t.id) ?? 0;
          return <SelectItem key={t.id} value={t.id}>{t.name} ({load} {en ? (load === 1 ? "class" : "classes") : (load === 1 ? "classe" : "classes")})</SelectItem>;
        })}
      </SelectContent>
    </Select>
  );

  const classActions = (c: HierarchyClass) => (
    <div className="flex gap-1">
      <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" aria-label={en ? "Rename or move" : "Renommer ou deplacer"} onClick={() => setClassDlg({ item: c, names: c.name, section: c.sub_school || "", level: c.level || "", streams: c.stream || "" })}><Pencil className="h-4 w-4" /></Button>
      <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl text-destructive" aria-label={en ? "Delete" : "Supprimer"} onClick={() => deleteClass(c)}><Trash2 className="h-4 w-4" /></Button>
    </div>
  );

  const classCard = (c: HierarchyClass) => {
    const rows = linksByClass.get(c.id) ?? [];
    return (
      <div key={c.id} className="rounded-2xl border border-primary/10 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-lg font-black text-primary">{c.name}</p>
            {c.level_name ? <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{en ? "Level" : "Niveau"}: {c.level_name}{c.stream ? ` - ${c.stream}` : ""}</p> : null}
            <p className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Users className="h-3.5 w-3.5" />{c.total_students} {en ? (Number(c.total_students) === 1 ? "pupil" : "pupils") : (Number(c.total_students) === 1 ? "eleve" : "eleves")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">{teacherSelect(c)}{classActions(c)}</div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {isNursery(c) && rows.length === 0 ? (
            <Link href="/dashboard/grades/nursery" className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
              {en ? "Assessed by developmental areas" : "Evalue par domaines d'eveil"}
            </Link>
          ) : null}
          {rows.map((l) => (
            <span key={l.id} className="inline-flex items-center gap-1 rounded-full bg-sky-50 py-1 pl-3 pr-1 text-xs font-bold text-sky-800">
              <button type="button" className="text-left" title={usesCoefficients ? (en ? "Change coefficient" : "Changer le coefficient") : undefined} onClick={() => usesCoefficients && l.subject && setCoefDlg({ subjectId: l.subject, name: l.subject_name || "", value: String(Number(l.coefficient ?? 1)) })}>
                {l.subject_name}{usesCoefficients ? ` x${Number(l.coefficient ?? 1)}` : ""}
              </button>
              <button type="button" aria-label={en ? "Remove subject" : "Retirer la matiere"} className="rounded-full p-1 hover:bg-sky-100" onClick={() => void removeLink(l)}><X className="h-3 w-3" /></button>
            </span>
          ))}
          <Button size="sm" variant="outline" className="h-8 gap-1 rounded-full text-xs font-bold" onClick={() => setSubjectDlg({ klass: c })}>
            <Plus className="h-3.5 w-3.5" />{en ? "Subjects" : "Matieres"}
          </Button>
        </div>
      </div>
    );
  };

  // Classes of one section grouped under their level (a level with no class yet in the section still shows its add button).
  const levelGroups = (rows: HierarchyClass[], _sectionKey: string) => {
    const groups: Array<{ key: string; level: ClassLevel | null; rows: HierarchyClass[] }> = levels
      .map((l) => ({ key: l.id, level: l as ClassLevel | null, rows: rows.filter((c) => c.level === l.id) }))
      .filter((g) => g.rows.length > 0);
    const loose = rows.filter((c) => !c.level || !levels.some((l) => l.id === c.level));
    if (loose.length) groups.push({ key: NONE, level: null, rows: loose });
    return groups;
  };

  const sectionBlock = (key: string, name: string, rows: HierarchyClass[], item?: HierarchySubSchool) => {
    const expanded = open[key] ?? true;
    const pupils = rows.reduce((sum, c) => sum + (Number(c.total_students) || 0), 0);
    return (
      <Card key={key} className="rounded-3xl border-none shadow-sm">
        <CardContent className="space-y-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" className="flex items-center gap-2 text-left" onClick={() => setOpen((p) => ({ ...p, [key]: !expanded }))}>
              {expanded ? <ChevronDown className="h-5 w-5 text-primary" /> : <ChevronRight className="h-5 w-5 text-primary" />}
              <span className="text-xl font-black text-primary">{name}</span>
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">{rows.length} {en ? "classes" : "classes"} - {pupils} {en ? "pupils" : "eleves"}</span>
            </button>
            <div className="flex gap-2">
              {item ? <Button size="sm" className="h-9 gap-1 rounded-xl font-bold" onClick={() => setClassDlg({ item: null, names: "", section: item.id })}><Plus className="h-4 w-4" />{en ? "Add class" : "Ajouter une classe"}</Button> : null}
              {item && isHead ? <Button size="sm" variant="outline" className="h-9 w-9 rounded-xl p-0" aria-label={en ? "Rename section" : "Renommer la section"} onClick={() => setSectionDlg({ item, name: item.name })}><Pencil className="h-4 w-4" /></Button> : null}
            </div>
          </div>
          {expanded ? (
            rows.length === 0 ? <p className="rounded-2xl bg-primary/5 p-4 text-sm text-muted-foreground">{en ? "No class in this section yet." : "Aucune classe dans cette section."}</p>
              : <div className="space-y-4">{levelGroups(rows, key === NONE ? "" : key).map((g) => (
                <div key={g.key} className="space-y-2">
                  {g.level ? (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-primary"><Layers className="h-4 w-4" />{g.level.name} <span className="font-semibold normal-case text-muted-foreground">({g.rows.length} {en ? "classes" : "classes"})</span></p>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" className="h-8 gap-1 rounded-full text-xs font-bold" onClick={() => setClassDlg({ item: null, names: "", section: key === NONE ? "" : key, level: g.level!.id, streams: "", count: "1" })}><Plus className="h-3.5 w-3.5" />{en ? "Add class to this level" : "Ajouter une classe a ce niveau"}</Button>
                        <Button size="sm" variant="outline" className="h-8 rounded-full text-xs font-bold" onClick={() => setClassDlg({ item: null, names: "", section: key === NONE ? "" : key, level: g.level!.id, streams: "", count: "3" })}>{en ? "Add N classes" : "Ajouter N classes"}</Button>
                      </div>
                    </div>
                  ) : g.rows.length ? <p className="text-sm font-black uppercase tracking-wide text-muted-foreground">{en ? "Classes without a level" : "Classes sans niveau"}</p> : null}
                  {g.rows.map(classCard)}
                </div>
              ))}</div>
          ) : null}
        </CardContent>
      </Card>
    );
  };

  const overview = (
    <div className="space-y-4">
      {sections.map((s) => sectionBlock(s.id, s.name, classesBySection.get(s.id) ?? [], s))}
      {(classesBySection.get(NONE) ?? []).length > 0
        ? sectionBlock(NONE, en ? "Unassigned classes (pick a section)" : "Classes sans section (choisissez une section)", classesBySection.get(NONE) ?? [])
        : null}
      {sections.length === 0 ? <p className="text-sm text-muted-foreground">{en ? "No section yet." : "Aucune section."}</p> : null}
    </div>
  );

  const sectionsTab = (
    <div className="grid gap-4 sm:grid-cols-2">
      {sections.map((s) => {
        const rows = classesBySection.get(s.id) ?? [];
        const lang = sectionLang(s.name);
        return (
          <Card key={s.id} className="rounded-3xl border-none shadow-sm">
            <CardContent className="space-y-3 p-5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xl font-black text-primary">{s.name}</p>
                {lang ? <span className="rounded-full bg-accent/40 px-3 py-1 text-xs font-bold text-primary">{lang === "en" ? (en ? "English" : "Anglais") : (en ? "French" : "Francais")}</span> : null}
              </div>
              <p className="text-sm text-muted-foreground">{rows.length} {en ? "classes" : "classes"} - {rows.reduce((n, c) => n + (Number(c.total_students) || 0), 0)} {en ? "pupils" : "eleves"}</p>
              {isHead ? (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 rounded-xl" onClick={() => setSectionDlg({ item: s, name: s.name })}><Pencil className="mr-2 h-4 w-4" />{en ? "Rename" : "Renommer"}</Button>
                  {!s.is_system_managed ? <Button variant="outline" size="sm" className="rounded-xl text-destructive" aria-label={en ? "Delete" : "Supprimer"} onClick={() => deleteSection(s)}><Trash2 className="h-4 w-4" /></Button> : null}
                </div>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );

  const levelsTab = (
    <div className="space-y-3">
      <p className="rounded-2xl bg-primary/5 p-4 text-sm text-muted-foreground">
        {en ? "A level (Class 1, Class 2 ...) decides where a pupil is and which level comes next. Classes of a level are named Class 1 A, Class 1 B ... Pupils of the last level graduate." : "Un niveau (CP, CE1 ...) decide ou est l'eleve et quel niveau suit. Les classes d'un niveau s'appellent CP A, CP B ... Les eleves du dernier niveau terminent l'ecole."}
      </p>
      {isHead ? (
        <div className="flex flex-wrap gap-2">
          <Button className="h-10 gap-2 rounded-xl font-bold" onClick={() => setLevelDlg({ item: null, name: "", cycle: "primary", is_final: false })}><Plus className="h-4 w-4" />{en ? "Add level" : "Ajouter un niveau"}</Button>
          <Button variant="outline" disabled={busy} className="h-10 gap-2 rounded-xl font-bold" onClick={() => void run(() => hierarchyHubService.seedLevels(), en ? "Standard levels added" : "Niveaux standard ajoutes")}><Layers className="h-4 w-4" />{en ? "Add the standard levels" : "Ajouter les niveaux standard"}</Button>
        </div>
      ) : null}
      {levels.length === 0 ? <p className="text-sm text-muted-foreground">{en ? "No level yet." : "Aucun niveau."}</p> : null}
      {levels.map((l, i) => (
        <div key={l.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm">
          <div className="min-w-0">
            <p className="font-black text-primary">{l.name} {l.is_final ? <span className="ml-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">{en ? "last level" : "dernier niveau"}</span> : null}</p>
            <p className="text-xs text-muted-foreground">{l.cycle === "nursery" ? (en ? "Nursery" : "Maternelle") : (en ? "Primary" : "Primaire")} - {l.classes ?? 0} {en ? "classes" : "classes"} - {l.pupils ?? 0} {en ? "pupils" : "eleves"}</p>
          </div>
          {isHead ? (
            <div className="flex gap-1">
              <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" disabled={busy || i === 0} aria-label={en ? "Move up" : "Monter"} onClick={() => void moveLevel(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
              <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" disabled={busy || i === levels.length - 1} aria-label={en ? "Move down" : "Descendre"} onClick={() => void moveLevel(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
              <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" aria-label={en ? "Rename" : "Renommer"} onClick={() => setLevelDlg({ item: l, name: l.name, cycle: l.cycle, is_final: l.is_final })}><Pencil className="h-4 w-4" /></Button>
              <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl text-destructive" aria-label={en ? "Delete" : "Supprimer"} onClick={() => deleteLevel(l)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );

  const classesTab = (
    <div className="space-y-3">
      {classes.map((c) => (
        <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm">
          <div className="min-w-0">
            <p className="font-black text-primary">{c.name}</p>
            <p className="text-xs text-muted-foreground">{multiSection || !c.sub_school ? `${sectionName(c.sub_school)} - ` : ""}{c.total_students} {en ? "pupils" : "eleves"} - {(linksByClass.get(c.id) ?? []).length} {en ? "subjects" : "matieres"}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">{teacherSelect(c)}{classActions(c)}</div>
        </div>
      ))}
    </div>
  );

  const subjectsTab = (
    <div className="space-y-3">
      {subjectRows.length === 0 ? <p className="text-sm text-muted-foreground">{en ? "No subject yet. Use the Subjects button on a class to add your own subjects, or copy them from another class." : "Aucune matiere. Utilisez le bouton Matieres d'une classe pour ajouter les votres, ou copiez-les d'une autre classe."}</p> : null}
      {subjectRows.map((row) => (
        <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm">
          <div className="min-w-0">
            <p className="font-black text-primary">{row.name} <span className="text-xs font-bold uppercase text-muted-foreground">{row.code}</span></p>
            <p className="line-clamp-2 text-xs text-muted-foreground">{row.classIds.map((id) => classes.find((c) => c.id === id)?.name).filter(Boolean).join(", ")}</p>
          </div>
          {usesCoefficients ? (
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setCoefDlg({ subjectId: row.id, name: row.name, value: String(Number(row.coefficient)) })}>
              {en ? "Coefficient" : "Coefficient"} {Number(row.coefficient)} <Pencil className="ml-2 h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  );

  const teachersTab = (
    <div className="space-y-3">
      {(summary?.teachers ?? []).length === 0 ? <p className="text-sm text-muted-foreground">{en ? "No teacher yet. Add teachers in Staff, then assign them here." : "Aucun enseignant. Ajoutez-en dans Personnel, puis affectez-les ici."}</p> : null}
      {(summary?.teachers ?? []).map((t) => (
        <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white p-4 shadow-sm">
          <p className="font-black text-primary">{t.name}</p>
          <p className="text-sm text-muted-foreground">{t.classes.length ? t.classes.join(", ") : (en ? "Not assigned to a class" : "Sans classe")}</p>
        </div>
      ))}
      <Button asChild variant="outline" className="rounded-xl"><Link href="/dashboard/staff">{en ? "Manage staff" : "Gerer le personnel"}</Link></Button>
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-20">
      {failed ? <LoadError message="Some data could not be loaded. The view below may be incomplete." onRetry={() => void refresh()} /> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary sm:text-3xl">{en ? "Hierarchy & Sections" : "Hierarchie & Sections"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {en ? "Set up your school here: sections, classes, subjects and class teachers, all connected." : "Configurez votre ecole ici : sections, classes, matieres et titulaires, tout est relie."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isHead ? <Button variant="outline" className="h-11 gap-2 rounded-2xl font-bold" onClick={() => setSectionDlg({ item: null, name: "" })}><Plus className="h-4 w-4" />{en ? "Section" : "Section"}</Button> : null}
          <Button className="h-11 gap-2 rounded-2xl font-bold" onClick={() => setClassDlg({ item: null, names: "", section: "" })}><Plus className="h-4 w-4" />{en ? "Class" : "Classe"}</Button>
        </div>
      </div>

      {/* Setup checklist */}
      <Card className="rounded-3xl border-none bg-gradient-to-br from-primary/10 via-primary/5 to-transparent shadow-sm">
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-black uppercase tracking-widest text-primary">{en ? "School setup" : "Configuration"} - {doneCount}/{steps.length || 6}</p>
            {summary?.complete ? <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">{en ? "All set" : "Termine"}</span> : null}
          </div>
          <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.key}>
                <button type="button" onClick={() => goStep(s.key)} className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition hover:shadow-sm ${s.done ? "border-emerald-200 bg-emerald-50" : nextStep?.key === s.key ? "border-primary bg-white" : "border-primary/10 bg-white/70"}`}>
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${s.done ? "bg-emerald-600 text-white" : "bg-primary/10 text-primary"}`}>{s.done ? <Check className="h-4 w-4" /> : i + 1}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-primary">{stepMeta[s.key].label}</span>
                    <span className="block text-xs text-muted-foreground">{s.total != null ? `${s.count}/${s.total}` : s.count}{s.key === "classes" && s.unsectioned ? ` - ${s.unsectioned} ${en ? "without section" : "sans section"}` : ""}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
          {nextStep ? (
            <div className="flex flex-col gap-2 rounded-2xl bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-center gap-2 text-sm font-semibold text-primary"><Circle className="h-3 w-3 fill-primary text-primary" />{en ? "Next step: " : "Prochaine etape : "}{nextHelp[nextStep.key]}</p>
              <div className="flex gap-2">
                <Button className="h-10 rounded-xl font-bold" onClick={() => goStep(nextStep.key)}>{en ? "Go" : "Y aller"}</Button>
              </div>
            </div>
          ) : null}
          {emptySchool && isHead ? (
            <Button onClick={() => setWizard(true)} className="h-12 w-full gap-2 rounded-2xl text-base font-bold"><Wand2 className="h-5 w-5" />{en ? "Quick setup (recommended)" : "Configuration rapide (recommande)"}</Button>
          ) : null}
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-2xl bg-primary/5 p-1">
          {([["overview", en ? "Overview" : "Vue d'ensemble"], ["sections", "Sections"], ["levels", en ? "Levels" : "Niveaux"], ["classes", "Classes"], ["subjects", en ? "Subjects" : "Matieres"], ["teachers", en ? "Class teachers" : "Titulaires"]] as const).map(([value, label]) => (
            <TabsTrigger key={value} value={value} className="rounded-xl px-4 py-2 text-sm font-bold">{label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {tab === "subjects" && !usesCoefficients ? (
        <p className="text-xs text-muted-foreground">{en ? "Coefficients are off in your report-card settings." : "Les coefficients sont desactives dans les parametres du bulletin."}</p>
      ) : null}

      {tab === "overview" ? overview : tab === "sections" ? sectionsTab : tab === "levels" ? levelsTab : tab === "classes" ? classesTab : tab === "subjects" ? subjectsTab : teachersTab}

      {/* Section dialog */}
      <Dialog open={Boolean(sectionDlg)} onOpenChange={(o) => !o && setSectionDlg(null)}>
        <DialogContent className="max-w-lg rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black text-primary">{sectionDlg?.item ? (en ? "Rename section" : "Renommer la section") : (en ? "Add a section" : "Ajouter une section")}</DialogTitle>
            <DialogDescription>{en ? "A section groups classes, for example the English section and the French section." : "Une section regroupe des classes, par exemple la section anglophone et la section francophone."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input autoFocus value={sectionDlg?.name ?? ""} disabled={Boolean(sectionDlg?.item?.is_system_managed)} onChange={(e) => setSectionDlg((p) => p && { ...p, name: e.target.value })} placeholder={en ? "e.g. English Section" : "ex. Section Francophone"} className="h-12 rounded-xl text-base" />
            {!sectionDlg?.item ? (
              <div className="flex flex-wrap gap-2">
                {[en ? "English Section" : "English Section", "French Section"].filter((n) => !sections.some((s) => s.name.toLowerCase() === n.toLowerCase())).map((n) => (
                  <button key={n} type="button" onClick={() => setSectionDlg((p) => p && { ...p, name: n })} className="rounded-full border border-primary/20 px-3 py-1.5 text-sm font-semibold text-primary hover:bg-primary/5">{n}</button>
                ))}
              </div>
            ) : null}
            <Button disabled={busy} onClick={() => void saveSection()} className="h-12 w-full rounded-2xl text-base font-bold">{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : en ? "Save" : "Enregistrer"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Level dialog */}
      <Dialog open={Boolean(levelDlg)} onOpenChange={(o) => !o && setLevelDlg(null)}>
        <DialogContent className="max-w-lg rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black text-primary">{levelDlg?.item ? (en ? "Rename level" : "Renommer le niveau") : (en ? "Add a level" : "Ajouter un niveau")}</DialogTitle>
            <DialogDescription>{en ? "Renaming a level renames its classes too (Class 1 A becomes Primary 1 A). Pupils and marks are kept." : "Renommer un niveau renomme aussi ses classes. Les eleves et les notes sont conserves."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input autoFocus value={levelDlg?.name ?? ""} onChange={(e) => setLevelDlg((p) => p && { ...p, name: e.target.value })} placeholder={en ? "e.g. Class 1" : "ex. CP"} className="h-12 rounded-xl text-base" />
            <div className="grid grid-cols-2 gap-2">
              {(["nursery", "primary"] as const).map((c) => (
                <button key={c} type="button" onClick={() => setLevelDlg((p) => p && { ...p, cycle: c })} className={`rounded-xl border px-3 py-3 text-sm font-bold transition ${levelDlg?.cycle === c ? "border-primary bg-primary text-white" : "border-primary/20 bg-white text-primary hover:bg-primary/5"}`}>
                  {c === "nursery" ? (en ? "Nursery" : "Maternelle") : (en ? "Primary" : "Primaire")}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-3 rounded-xl bg-primary/5 p-3 text-sm font-semibold text-primary">
              <input type="checkbox" checked={levelDlg?.is_final ?? false} onChange={(e) => setLevelDlg((p) => p && { ...p, is_final: e.target.checked })} className="h-4 w-4" />
              {en ? "Last level: its pupils graduate" : "Dernier niveau : ses eleves terminent l'ecole"}
            </label>
            <Button disabled={busy} onClick={() => void saveLevel()} className="h-12 w-full rounded-2xl text-base font-bold">{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : en ? "Save" : "Enregistrer"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Class dialog */}
      <Dialog open={Boolean(classDlg)} onOpenChange={(o) => !o && setClassDlg(null)}>
        <DialogContent className="max-w-lg rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black text-primary">{classDlg?.item ? (en ? "Edit class" : "Modifier la classe") : (en ? "Add classes" : "Ajouter des classes")}</DialogTitle>
            <DialogDescription>{classDlg?.item ? (en ? "Changing the level or letter renames the class and updates pupils, marks and timetable." : "Changer le niveau ou la lettre renomme la classe et met a jour eleves, notes et emploi du temps.") : (en ? "Pick a level, then type the letters (A, B, C) or how many classes to add. Existing classes are never duplicated." : "Choisissez un niveau, puis saisissez les lettres (A, B, C) ou le nombre de classes. Les classes existantes ne sont jamais dupliquees.")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="font-bold">{en ? "Level" : "Niveau"}</Label>
              <Select value={classDlg?.level || NONE} onValueChange={(v) => setClassDlg((p) => p && { ...p, level: v === NONE ? "" : v })}>
                <SelectTrigger className="h-12 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{en ? "No level (free class name)" : "Sans niveau (nom libre)"}</SelectItem>
                  {levels.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {classDlg?.level ? (
              <div className="grid grid-cols-[1fr_6rem] gap-2">
                <div className="space-y-2">
                  <Label className="font-bold">{classDlg.item ? (en ? "Letter or name" : "Lettre ou nom") : (en ? "Letters (A, B, C) - or leave empty" : "Lettres (A, B, C) - ou laissez vide")}</Label>
                  <Input autoFocus value={classDlg.streams ?? ""} onChange={(e) => setClassDlg((p) => p && { ...p, streams: e.target.value })} placeholder="A, B, C" className="h-12 rounded-xl text-base" />
                </div>
                {!classDlg.item ? (
                  <div className="space-y-2">
                    <Label className="font-bold">{en ? "How many" : "Combien"}</Label>
                    <Input type="number" min="1" max="26" value={classDlg.count ?? "1"} disabled={Boolean((classDlg.streams ?? "").trim())} onChange={(e) => setClassDlg((p) => p && { ...p, count: e.target.value })} className="h-12 rounded-xl text-base" />
                  </div>
                ) : null}
              </div>
            ) : (
              <>
                <Input autoFocus value={classDlg?.names ?? ""} onChange={(e) => setClassDlg((p) => p && { ...p, names: e.target.value })} placeholder={en ? "e.g. Class 3 A, Class 3 B" : "ex. CE2 A, CE2 B"} className="h-12 rounded-xl text-base" />
                {!classDlg?.item && levels.length === 0 ? (() => {
                  const sec = sections.find((s) => s.id === (classDlg?.section || (sections.length === 1 ? sections[0].id : ""))) ?? null;
                  const names = CLASS_NAMES[sec && sectionLang(sec.name) === "fr" ? "fr" : "en"].filter((n) => !classes.some((c) => c.name.toLowerCase() === n.toLowerCase()));
                  return names.length ? (
                    <div className="flex flex-wrap gap-2">
                      {names.map((n) => <button key={n} type="button" onClick={() => setClassDlg((p) => p && { ...p, names: p.names ? `${p.names}, ${n}` : n })} className="rounded-full border border-primary/20 px-3 py-1.5 text-sm font-semibold text-primary hover:bg-primary/5">{n}</button>)}
                    </div>
                  ) : null;
                })() : null}
              </>
            )}
            <div className="space-y-2">
              <Label className="font-bold">{en ? "Section" : "Section"}</Label>
              <Select value={classDlg?.section || (sections.length === 1 ? sections[0].id : "")} onValueChange={(v) => setClassDlg((p) => p && { ...p, section: v })}>
                <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder={en ? "Choose a section" : "Choisir une section"} /></SelectTrigger>
                <SelectContent>{sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button disabled={busy} onClick={() => void saveClass()} className="h-12 w-full rounded-2xl text-base font-bold">{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : en ? "Save" : "Enregistrer"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Subjects of a class */}
      <SubjectsDialog
        state={subjectDlg} en={en} busy={busy} usesCoefficients={usesCoefficients} classes={classes}
        onClose={() => setSubjectDlg(null)}
        onCustom={(name, coefficient) => subjectDlg && run(() => hierarchyHubService.applySubjects({ mode: "custom", classes: [subjectDlg.klass.id], subjects: [{ name, coefficient }] }), en ? "Subject added" : "Matiere ajoutee", name)}
        onCopy={(from) => subjectDlg && run(() => hierarchyHubService.applySubjects({ mode: "copy", from_class: from, classes: [subjectDlg.klass.id] }), en ? "Subjects copied" : "Matieres copiees", subjectDlg.klass.name)}
      />

      {/* Coefficient */}
      <Dialog open={Boolean(coefDlg)} onOpenChange={(o) => !o && setCoefDlg(null)}>
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-primary">{coefDlg?.name}</DialogTitle>
            <DialogDescription>{en ? "The coefficient applies to this subject in every class that has it." : "Le coefficient s'applique a cette matiere dans toutes les classes qui l'ont."}</DialogDescription>
          </DialogHeader>
          <Input type="number" min="0.01" step="0.5" value={coefDlg?.value ?? ""} onChange={(e) => setCoefDlg((p) => p && { ...p, value: e.target.value })} className="h-12 rounded-xl" />
          <Button disabled={busy} onClick={() => void saveCoefficient()} className="h-12 w-full rounded-2xl font-bold">{en ? "Save" : "Enregistrer"}</Button>
        </DialogContent>
      </Dialog>

      {/* Quick setup */}
      <QuickSetup open={wizard} onClose={() => setWizard(false)} en={en} onDone={async (r) => { await refresh(); toast({ title: en ? "School structure created" : "Structure creee", description: en ? `${r.classes_created.length} classes created. Add your subjects next.` : `${r.classes_created.length} classes creees. Ajoutez ensuite vos matieres.` }); }} />

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

function SubjectsDialog({ state, en, busy, usesCoefficients, classes, onClose, onCustom, onCopy }: {
  state: { klass: HierarchyClass } | null; en: boolean; busy: boolean; usesCoefficients: boolean; classes: HierarchyClass[];
  onClose: () => void; onCustom: (name: string, coefficient: string) => unknown; onCopy: (from: string) => unknown;
}) {
  const [name, setName] = useState("");
  const [coef, setCoef] = useState("1");
  const [from, setFrom] = useState("");
  return (
    <Dialog open={Boolean(state)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black text-primary">{state?.klass.name}: {en ? "subjects" : "matieres"}</DialogTitle>
          <DialogDescription>{en ? "Type the subjects of this class, or copy the list from another class. Nothing is added for you." : "Saisissez les matieres de cette classe, ou copiez la liste d'une autre classe. Rien n'est ajoute automatiquement."}</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="space-y-2">
            <Label className="font-bold">{en ? "Add a subject" : "Ajouter une matiere"}</Label>
            <div className="flex gap-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={en ? "e.g. Mathematics" : "ex. Mathematiques"} className="h-11 rounded-xl" />
              {usesCoefficients ? <Input type="number" min="0.01" step="0.5" value={coef} onChange={(e) => setCoef(e.target.value)} className="h-11 w-24 rounded-xl" aria-label="Coefficient" /> : null}
              <Button disabled={busy || !name.trim()} className="h-11 rounded-xl font-bold" onClick={async () => { await onCustom(name.trim(), usesCoefficients ? coef : "1"); setName(""); }}><Plus className="h-4 w-4" /></Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="font-bold">{en ? "Copy from another class" : "Copier depuis une autre classe"}</Label>
            <div className="flex gap-2">
              <Select value={from} onValueChange={setFrom}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder={en ? "Choose a class" : "Choisir une classe"} /></SelectTrigger>
                <SelectContent>{classes.filter((c) => c.id !== state?.klass.id).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
              <Button disabled={busy || !from} variant="outline" className="h-11 gap-2 rounded-xl font-bold" onClick={() => void onCopy(from)}><Copy className="h-4 w-4" />{en ? "Copy" : "Copier"}</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function QuickSetup({ open, onClose, en, onDone }: { open: boolean; onClose: () => void; en: boolean; onDone: (r: Awaited<ReturnType<typeof hierarchyHubService.quickSetup>>) => unknown }) {
  const { toast } = useToast();
  const [langs, setLangs] = useState<Array<"en" | "fr">>(["en"]);
  const [nursery, setNursery] = useState(true);
  const [primary, setPrimary] = useState(true);
  const mutation = useMutation({
    mutationFn: () => hierarchyHubService.quickSetup({ languages: langs, nursery, primary }),
    onSuccess: async (r) => { await onDone(r); onClose(); },
    onError: (error) => toast({ variant: "destructive", title: en ? "Quick setup failed" : "Configuration impossible", description: getApiErrorMessage(error, "") }),
  });
  const toggle = (l: "en" | "fr") => setLangs((p) => (p.includes(l) ? p.filter((x) => x !== l) : [...p, l]));
  const chip = (on: boolean) => `rounded-xl border px-3 py-3 text-sm font-bold transition ${on ? "border-primary bg-primary text-white" : "border-primary/20 bg-white text-primary hover:bg-primary/5"}`;
  const preview = [...(langs.includes("en") ? [`${en ? "English" : "Anglophone"}: ${[...(nursery ? ["Nursery 1-3"] : []), ...(primary ? ["Class 1-6"] : [])].join(" + ")}`] : []),
    ...(langs.includes("fr") ? [`${en ? "French" : "Francophone"}: ${[...(nursery ? ["Maternelle 1-3"] : []), ...(primary ? ["SIL, CP-CM2"] : [])].join(" + ")}`] : [])];
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl font-black text-primary"><School className="h-6 w-6" />{en ? "Quick setup" : "Configuration rapide"}</DialogTitle>
          <DialogDescription>{en ? "Creates your sections, levels and one class per level in one go. No subjects are added: you add your own. Safe to run again." : "Cree vos sections, niveaux et une classe par niveau en une fois. Aucune matiere n'est ajoutee : ajoutez les votres. Sans risque."}</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="space-y-2">
            <Label className="font-bold">{en ? "Language sections" : "Sections linguistiques"}</Label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={chip(langs.includes("en"))} onClick={() => toggle("en")}>{en ? "English" : "Anglophone"}</button>
              <button type="button" className={chip(langs.includes("fr"))} onClick={() => toggle("fr")}>{en ? "French" : "Francophone"}</button>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="font-bold">{en ? "Which classes?" : "Quelles classes ?"}</Label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={chip(nursery)} onClick={() => setNursery(!nursery)}>{en ? "Nursery 1-3" : "Maternelle 1-3"}</button>
              <button type="button" className={chip(primary)} onClick={() => setPrimary(!primary)}>{en ? "Class 1-6" : "SIL, CP-CM2"}</button>
            </div>
          </div>
          {preview.length ? <ul className="rounded-xl bg-white p-3 text-sm text-muted-foreground shadow-sm">{preview.map((p) => <li key={p}>{p}</li>)}</ul> : null}
          <p className="flex items-center gap-2 text-xs text-muted-foreground"><UserCog className="h-4 w-4" />{en ? "Class teachers are chosen afterwards, class by class." : "Les titulaires se choisissent ensuite, classe par classe."}</p>
          <Button disabled={mutation.isPending || langs.length === 0 || !(nursery || primary)} onClick={() => mutation.mutate()} className="h-12 w-full gap-2 rounded-2xl text-base font-bold">
            {mutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Wand2 className="h-5 w-5" />}{en ? "Create my school structure" : "Creer la structure de mon ecole"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
