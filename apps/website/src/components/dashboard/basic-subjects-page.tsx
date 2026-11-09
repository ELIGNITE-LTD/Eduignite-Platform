"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BookOpen, Loader2, Pencil, Plus, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadError } from "@/components/ui/load-error";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { useEducationCategory } from "@/lib/hooks/useEducationCategory";
import { useSchoolSettings } from "@/lib/hooks/useSchools";
import { schoolsService } from "@/lib/api/services/schools.service";
import { gradesService } from "@/lib/api/services/grades.service";
import { getApiErrorMessage } from "@/lib/api/errors";
import type { HierarchyClass, HierarchyClassSubject } from "@/lib/api/types";

const list = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

// One-tap primary subjects: [English, French, code].
const DEFAULT_SUBJECTS: Array<[string, string, string]> = [
  ["English Language", "Anglais", "ENG"],
  ["French Language", "Francais", "FRE"],
  ["Mathematics", "Mathematiques", "MATH"],
  ["Science", "Sciences", "SCI"],
  ["Social Studies", "Etudes sociales", "SST"],
  ["Religious Studies", "Education religieuse", "REL"],
  ["Physical Education", "Education physique", "PE"],
  ["Arts & Crafts", "Arts et metiers", "ART"],
];

interface SubjectRow {
  id: string;
  name: string;
  code: string;
  coefficient: string;
  links: Array<{ linkId: string; classId: string }>;
}

/** Top-level "Subjects" tab for the head of a nursery/primary school. */
export function BasicSubjectsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const { language } = useI18n();
  const en = language === "en";
  const category = useEducationCategory();
  const schoolId = user?.school?.id || "";
  const allowed = (user?.role === "SCHOOL_ADMIN" || user?.role === "SUB_ADMIN") && category === "basic";
  const { data: settings } = useSchoolSettings(allowed ? schoolId : "");
  const usesCoefficients = (settings as { assessment_config?: { use_coefficients?: boolean } } | undefined)?.assessment_config?.use_coefficients !== false;

  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [classes, setClasses] = useState<HierarchyClass[]>([]);
  const [links, setLinks] = useState<HierarchyClassSubject[]>([]);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<SubjectRow | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [coefficient, setCoefficient] = useState("1");
  const [scope, setScope] = useState<"all" | "pick">("all");
  const [picked, setPicked] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    if (!schoolId) return;
    setFailed(false);
    try {
      const [classData, linkData] = await Promise.all([
        schoolsService.getHierarchyClasses({ school_id: schoolId }),
        schoolsService.getHierarchySubjects({ school_id: schoolId }),
      ]);
      setClasses(list<HierarchyClass>(classData));
      setLinks(list<HierarchyClassSubject>(linkData));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    if (user && !allowed) router.replace(user.role === "SCHOOL_ADMIN" ? "/dashboard/institution" : "/dashboard");
  }, [user, allowed, router]);

  useEffect(() => {
    if (allowed) void refresh();
  }, [allowed, refresh]);

  // "?add=subject" opens the form straight away.
  useEffect(() => {
    try {
      if (new URLSearchParams(window.location.search).get("add") === "subject") setOpen(true);
    } catch {
      /* no window (SSR) */
    }
  }, []);

  const rows = useMemo<SubjectRow[]>(() => {
    const byId = new Map<string, SubjectRow>();
    for (const link of links) {
      if (!link.subject) continue;
      const row = byId.get(link.subject) ?? {
        id: link.subject,
        name: link.subject_name || "",
        code: link.subject_code || "",
        coefficient: String(link.coefficient ?? "1"),
        links: [],
      };
      row.links.push({ linkId: link.id, classId: link.school_class });
      byId.set(link.subject, row);
    }
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [links]);

  const classNameById = useMemo(() => new Map(classes.map((c) => [c.id, c.name])), [classes]);

  const reset = () => {
    setEditing(null);
    setName("");
    setCode("");
    setCoefficient("1");
    setScope("all");
    setPicked([]);
  };

  const openNew = () => {
    reset();
    setOpen(true);
  };

  const openEdit = (row: SubjectRow) => {
    setEditing(row);
    setName(row.name);
    setCode(row.code);
    setCoefficient(row.coefficient);
    const covered = new Set(row.links.map((l) => l.classId));
    const everything = classes.length > 0 && classes.every((c) => covered.has(c.id));
    setScope(everything ? "all" : "pick");
    setPicked(Array.from(covered));
    setOpen(true);
  };

  const addToClasses = async (subjectName: string, subjectCode: string, coef: string, classIds: string[], subjectId?: string) => {
    for (const classId of classIds) {
      await schoolsService.createHierarchySubject({
        school_id: schoolId,
        school_class: classId,
        subject: subjectId ?? null,
        subject_name: subjectId ? "" : subjectName,
        subject_code: subjectCode,
        coefficient: coef,
        type: "mandatory",
      } as Partial<HierarchyClassSubject> & { school_id?: string });
    }
  };

  const quickAdd = async (labelEn: string, labelFr: string, subjectCode: string) => {
    if (classes.length === 0) {
      toast({ variant: "destructive", title: en ? "Add a class first" : "Ajoutez d'abord une classe" });
      return;
    }
    setSaving(true);
    try {
      await addToClasses(en ? labelEn : labelFr, subjectCode, "1", classes.map((c) => c.id));
      await refresh();
      toast({ title: en ? "Subject added" : "Matiere ajoutee", description: en ? labelEn : labelFr });
    } catch (error) {
      toast({ variant: "destructive", title: en ? "Could not add the subject" : "Ajout impossible", description: getApiErrorMessage(error, "") });
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast({ variant: "destructive", title: en ? "Subject name required" : "Nom de la matiere requis", description: en ? "Type a name, e.g. Mathematics." : "Saisissez un nom, ex. Mathematiques." });
      return;
    }
    const coef = usesCoefficients ? coefficient : "1";
    if (!(Number(coef) > 0)) {
      toast({ variant: "destructive", title: en ? "Coefficient must be above 0" : "Le coefficient doit etre superieur a 0" });
      return;
    }
    const targetIds = scope === "all" ? classes.map((c) => c.id) : picked;
    if (targetIds.length === 0) {
      toast({ variant: "destructive", title: en ? "Pick at least one class" : "Choisissez au moins une classe" });
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await gradesService.updateSubject(editing.id, { name: trimmed, code: code.trim() ? code.trim().toUpperCase() : editing.code, coefficient: Number(coef) } as never);
        const have = new Map(editing.links.map((l) => [l.classId, l.linkId]));
        const toAdd = targetIds.filter((id) => !have.has(id));
        const toRemove = editing.links.filter((l) => !targetIds.includes(l.classId));
        await addToClasses(trimmed, "", coef, toAdd, editing.id);
        for (const link of toRemove) await schoolsService.deleteHierarchySubject(link.linkId);
      } else {
        await addToClasses(trimmed, code.trim(), coef, targetIds);
      }
      setOpen(false);
      reset();
      await refresh();
      toast({ title: en ? "Subject saved" : "Matiere enregistree", description: trimmed });
    } catch (error) {
      toast({ variant: "destructive", title: en ? "Could not save the subject" : "Enregistrement impossible", description: getApiErrorMessage(error, en ? "Please check the name and code, then try again." : "Verifiez le nom et le code puis reessayez.") });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: SubjectRow) => {
    try {
      const marks = await gradesService.getGrades({ subject: row.id, page_size: 1 } as never);
      if (Number(marks?.count ?? 0) > 0) {
        toast({
          variant: "destructive",
          title: en ? "Marks exist for this subject" : "Des notes existent pour cette matiere",
          description: en ? `${row.name} already has marks, so it cannot be removed.` : `${row.name} a deja des notes, elle ne peut pas etre retiree.`,
        });
        return;
      }
    } catch (error) {
      toast({ variant: "destructive", title: en ? "Could not check marks" : "Verification impossible", description: getApiErrorMessage(error, "") });
      return;
    }
    const message = en ? `Remove ${row.name} from all classes?` : `Retirer ${row.name} de toutes les classes ?`;
    if (typeof window !== "undefined" && !window.confirm(message)) return;
    try {
      for (const link of row.links) await schoolsService.deleteHierarchySubject(link.linkId);
      await refresh();
      toast({ title: en ? "Subject removed" : "Matiere retiree", description: row.name });
    } catch (error) {
      toast({ variant: "destructive", title: en ? "Could not remove" : "Suppression impossible", description: getApiErrorMessage(error, "") });
    }
  };

  const togglePick = (id: string) => setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const existing = new Set(rows.flatMap((r) => [r.name.trim().toLowerCase()]));
  const suggestions = DEFAULT_SUBJECTS.filter(([e, f]) => !existing.has(e.toLowerCase()) && !existing.has(f.toLowerCase()));

  if (!allowed || loading) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary/30" /></div>;
  }

  const classesLabel = (row: SubjectRow) => {
    if (classes.length > 0 && row.links.length >= classes.length && classes.every((c) => row.links.some((l) => l.classId === c.id))) {
      return en ? "All classes" : "Toutes les classes";
    }
    return row.links.map((l) => classNameById.get(l.classId)).filter(Boolean).join(", ");
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-20">
      {failed ? <LoadError message="Some data could not be loaded. The list below may be incomplete." onRetry={() => void refresh()} /> : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary sm:text-3xl">{en ? "Subjects" : "Matieres"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {en ? "The subjects your pupils are taught and marked in." : "Les matieres enseignees et notees dans votre ecole."}
          </p>
        </div>
        <Button onClick={openNew} disabled={classes.length === 0} className="h-12 gap-2 rounded-2xl px-6 text-base font-bold shadow-md">
          <Plus className="h-5 w-5" />
          {en ? "Add subject" : "Ajouter une matiere"}
        </Button>
      </div>

      {classes.length === 0 ? (
        <Card className="rounded-3xl border-2 border-dashed border-primary/20 bg-primary/5 shadow-none">
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <span className="rounded-2xl bg-white p-4 text-primary shadow-sm"><BookOpen className="h-8 w-8" /></span>
            <p className="text-lg font-bold text-primary">{en ? "Add a class first" : "Ajoutez d'abord une classe"}</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {en ? "Subjects are taught in classes, so create at least one class." : "Les matieres sont enseignees dans des classes : creez au moins une classe."}
            </p>
            <Button asChild className="mt-1 h-12 gap-2 rounded-2xl px-6 text-base font-bold">
              <Link href="/dashboard/hierarchy?tab=classes&add=class"><Plus className="h-5 w-5" />{en ? "Add class" : "Ajouter une classe"}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {suggestions.length > 0 ? (
            <Card className="rounded-3xl border-none shadow-sm">
              <CardContent className="space-y-3 p-5">
                <p className="flex items-center gap-2 text-sm font-bold text-primary">
                  <Zap className="h-4 w-4 text-secondary" />
                  {en ? "Add in one tap (for all classes)" : "Ajouter en un clic (pour toutes les classes)"}
                </p>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map(([e, f, c]) => (
                    <button
                      key={c}
                      type="button"
                      disabled={saving}
                      onClick={() => void quickAdd(e, f, c)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-white px-3 py-1.5 text-sm font-semibold text-primary transition hover:bg-primary/5 disabled:opacity-50"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {en ? e : f}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {rows.length === 0 ? (
            <Card className="rounded-3xl border-none shadow-sm">
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                {en ? "No subject yet. Tap one above or use Add subject." : "Aucune matiere pour le moment. Touchez-en une ci-dessus ou utilisez Ajouter une matiere."}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {rows.map((row) => (
                <Card key={row.id} className="rounded-3xl border-none shadow-sm transition hover:shadow-md">
                  <CardContent className="space-y-4 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-xl font-black text-primary">{row.name}</p>
                        <p className="mt-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                          {row.code}{usesCoefficients ? ` - ${en ? "coef" : "coef"} ${Number(row.coefficient)}` : ""}
                        </p>
                      </div>
                      <BookOpen className="h-5 w-5 shrink-0 text-secondary" />
                    </div>
                    <p className="line-clamp-2 text-sm text-muted-foreground">{classesLabel(row)}</p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1 rounded-xl" onClick={() => openEdit(row)}>
                        <Pencil className="mr-2 h-4 w-4" />{en ? "Edit" : "Modifier"}
                      </Button>
                      <Button variant="outline" size="sm" className="rounded-xl text-destructive" onClick={() => void remove(row)} aria-label={en ? "Remove" : "Retirer"}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black text-primary">
              {editing ? (en ? "Edit subject" : "Modifier la matiere") : (en ? "Add a subject" : "Ajouter une matiere")}
            </DialogTitle>
            <DialogDescription>
              {en ? "Name it, then say which classes learn it." : "Donnez un nom, puis indiquez les classes concernees."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div className="space-y-2">
              <Label className="font-bold">{en ? "Subject name" : "Nom de la matiere"} <span className="text-destructive">*</span></Label>
              <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={en ? "e.g. Mathematics" : "ex. Mathematiques"} className="h-12 rounded-xl text-base" />
            </div>
            <div className={usesCoefficients ? "grid grid-cols-2 gap-3" : ""}>
              <div className="space-y-2">
                <Label className="font-bold">{en ? "Short code (optional)" : "Code court (facultatif)"}</Label>
                <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="MATH" className="h-12 rounded-xl" />
              </div>
              {usesCoefficients ? (
                <div className="space-y-2">
                  <Label className="font-bold">{en ? "Coefficient" : "Coefficient"}</Label>
                  <Input type="number" min="0.01" step="0.5" value={coefficient} onChange={(e) => setCoefficient(e.target.value)} className="h-12 rounded-xl" />
                </div>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label className="font-bold">{en ? "Which classes?" : "Quelles classes ?"}</Label>
              <div className="grid grid-cols-2 gap-2">
                {([["all", en ? "All classes" : "Toutes les classes"], ["pick", en ? "Pick classes" : "Choisir les classes"]] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setScope(value)}
                    className={`rounded-xl border px-3 py-2.5 text-sm font-bold transition ${scope === value ? "border-primary bg-primary text-white" : "border-primary/20 bg-white text-primary hover:bg-primary/5"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {scope === "pick" ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  {classes.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => togglePick(c.id)}
                      className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${picked.includes(c.id) ? "border-primary bg-primary text-white" : "border-primary/20 bg-white text-primary hover:bg-primary/5"}`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <Button onClick={() => void save()} disabled={saving} className="h-12 w-full gap-2 rounded-2xl text-base font-bold">
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
              {editing ? (en ? "Save changes" : "Enregistrer") : (en ? "Add subject" : "Ajouter la matiere")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
