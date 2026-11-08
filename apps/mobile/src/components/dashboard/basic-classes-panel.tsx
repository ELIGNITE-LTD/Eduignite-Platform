"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, GraduationCap, Loader2, Pencil, Plus, Trash2, UserCog, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { schoolsService } from "@/lib/api/services/schools.service";
import { getApiErrorMessage } from "@/lib/api/errors";
import { useI18n } from "@/lib/i18n-context";
import { basicCycleForClassName, getEducationTerms } from "@/lib/education-terms";
import type { BasicSection } from "@/lib/cameroon-education-system";
import type { HierarchyClass, HierarchySubSchool, User } from "@/lib/api/types";

const NONE = "__none__";

interface BasicClassesPanelProps {
  schoolId: string;
  classes: HierarchyClass[];
  subSchools: HierarchySubSchool[];
  teachers: User[];
  sections: BasicSection[];
  onChanged: () => Promise<void>;
  onExplore?: (classId: string) => void;
}

/** Find the sub-school that matches a nursery/primary class, when the school has sub-schools. */
function inferSubSchool(subSchools: HierarchySubSchool[], cycle: "nursery" | "primary"): string {
  if (subSchools.length === 0) return "";
  const hint = cycle === "nursery" ? /nurs|matern|pre/i : /prim/i;
  const match = subSchools.find((s) => hint.test(s.name));
  if (match) return match.id;
  return subSchools.length === 1 ? subSchools[0].id : "";
}

/**
 * Classes page for nursery/primary schools: one obvious "Add class" button, a
 * tiny form (name, optional class teacher) and a plain list. No cycles, streams
 * or sub-school jargon unless the school really has several sub-schools.
 */
export function BasicClassesPanel({ schoolId, classes, subSchools, teachers, sections, onChanged, onExplore }: BasicClassesPanelProps) {
  const { toast } = useToast();
  const { language } = useI18n();
  const en = language === "en";
  const terms = getEducationTerms("basic");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [teacher, setTeacher] = useState(NONE);
  const [subSchool, setSubSchool] = useState(NONE);

  // "?add=class" (from the admin home) opens the form straight away.
  useEffect(() => {
    try {
      if (new URLSearchParams(window.location.search).get("add") === "class") setOpen(true);
    } catch {
      /* no window (SSR) */
    }
  }, []);

  const cycle = basicCycleForClassName(name);
  const inferred = inferSubSchool(subSchools, cycle);
  const needsSectionPick = subSchools.length > 1 && !inferred;

  const suggestions = useMemo(() => {
    const taken = new Set(classes.map((c) => c.name.trim().toLowerCase()));
    return terms.classSuggestions.filter((label) => {
      const isNursery = label.startsWith("Nursery");
      if (isNursery && !sections.includes("nursery")) return false;
      if (!isNursery && !sections.includes("primary")) return false;
      return !taken.has(label.toLowerCase());
    });
  }, [classes, sections, terms.classSuggestions]);

  const reset = () => {
    setEditingId(null);
    setName("");
    setTeacher(NONE);
    setSubSchool(NONE);
  };

  const openNew = () => {
    reset();
    setOpen(true);
  };

  const openEdit = (item: HierarchyClass) => {
    setEditingId(item.id);
    setName(item.name);
    setTeacher(item.class_master || NONE);
    setSubSchool(item.sub_school || NONE);
    setOpen(true);
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast({ variant: "destructive", title: en ? "Class name required" : "Nom de classe requis", description: en ? "Type or pick a class name, e.g. Class 3 A." : "Saisissez ou choisissez un nom de classe, ex. CE2 A." });
      return;
    }
    const chosenSub = subSchool !== NONE ? subSchool : inferred;
    if (subSchools.length > 0 && !chosenSub) {
      toast({ variant: "destructive", title: en ? "Pick a section" : "Choisissez une section", description: en ? "Say which section this class belongs to." : "Indiquez la section de cette classe." });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: trimmed,
        cycle: cycle as HierarchyClass["cycle"],
        class_master: teacher === NONE ? null : teacher,
        sub_school: chosenSub || null,
        school_id: schoolId,
      };
      if (editingId) await schoolsService.updateHierarchyClass(editingId, payload);
      else await schoolsService.createHierarchyClass(payload);
      setOpen(false);
      reset();
      await onChanged();
      toast({ title: en ? "Class saved" : "Classe enregistree", description: trimmed });
    } catch (error) {
      toast({ variant: "destructive", title: en ? "Could not save the class" : "Enregistrement impossible", description: getApiErrorMessage(error, en ? "Please check the name (it must be unique) and try again." : "Verifiez le nom (il doit etre unique) puis reessayez.") });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: HierarchyClass) => {
    if (Number(item.total_students) > 0) {
      toast({
        variant: "destructive",
        title: en ? "This class has pupils" : "Cette classe a des eleves",
        description: en
          ? `${item.name} has ${item.total_students} pupil(s). Move them to another class first, then delete it.`
          : `${item.name} compte ${item.total_students} eleve(s). Deplacez-les d'abord dans une autre classe, puis supprimez-la.`,
      });
      return;
    }
    const message = en ? `Delete ${item.name}? Pupils in it will no longer have a class.` : `Supprimer ${item.name} ? Les eleves n'auront plus de classe.`;
    if (typeof window !== "undefined" && !window.confirm(message)) return;
    try {
      await schoolsService.deleteHierarchyClass(item.id);
      await onChanged();
      toast({ title: en ? "Class deleted" : "Classe supprimee", description: item.name });
    } catch (error) {
      toast({ variant: "destructive", title: en ? "Could not delete" : "Suppression impossible", description: getApiErrorMessage(error, "") });
    }
  };

  return (
    <section id="add-class" className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary sm:text-3xl">{en ? "Classes" : "Classes"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {en ? "Add your classes, then give each one a class teacher." : "Ajoutez vos classes, puis donnez a chacune un titulaire."}
          </p>
        </div>
        <Button onClick={openNew} className="h-12 gap-2 rounded-2xl px-6 text-base font-bold shadow-md">
          <Plus className="h-5 w-5" />
          {en ? "Add class" : "Ajouter une classe"}
        </Button>
      </div>

      {classes.length === 0 ? (
        <Card className="rounded-3xl border-2 border-dashed border-primary/20 bg-primary/5 shadow-none">
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <span className="rounded-2xl bg-white p-4 text-primary shadow-sm"><GraduationCap className="h-8 w-8" /></span>
            <p className="text-lg font-bold text-primary">{en ? "No class yet" : "Aucune classe pour le moment"}</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {en ? "Start with your first class, for example Nursery 1 or Class 1." : "Commencez par votre premiere classe, par exemple Nursery 1 ou Class 1."}
            </p>
            <Button onClick={openNew} className="mt-1 h-12 gap-2 rounded-2xl px-6 text-base font-bold">
              <Plus className="h-5 w-5" />
              {en ? "Add your first class" : "Ajouter la premiere classe"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {classes.map((item) => (
            <Card key={item.id} className="rounded-3xl border-none shadow-sm transition hover:shadow-md">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-xl font-black text-primary">{item.name}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <UserCog className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.class_master_name || (en ? "No class teacher yet" : "Pas encore de titulaire")}</span>
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-accent/40 px-3 py-1 text-sm font-bold text-primary">
                    <Users className="h-4 w-4" />
                    {item.total_students} {item.total_students === 1 ? terms.learner.toLowerCase() : terms.learners.toLowerCase()}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 rounded-xl" onClick={() => openEdit(item)}>
                    <Pencil className="mr-2 h-4 w-4" />{en ? "Edit" : "Modifier"}
                  </Button>
                  {onExplore ? (
                    <Button variant="outline" size="sm" className="rounded-xl" onClick={() => onExplore(item.id)} aria-label={en ? "View" : "Voir"}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  ) : null}
                  <Button variant="outline" size="sm" className="rounded-xl text-destructive" title={Number(item.total_students) > 0 ? (en ? "Move the pupils out first" : "Deplacez d'abord les eleves") : undefined} onClick={() => void remove(item)} aria-label={en ? "Delete" : "Supprimer"}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}>
        <DialogContent className="max-w-lg rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black text-primary">
              {editingId ? (en ? "Edit class" : "Modifier la classe") : (en ? "Add a class" : "Ajouter une classe")}
            </DialogTitle>
            <DialogDescription>
              {en ? "Just the name is needed. The class teacher can be added now or later." : "Seul le nom est necessaire. Le titulaire peut etre ajoute maintenant ou plus tard."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div className="space-y-2">
              <Label className="font-bold">{en ? "Class name" : "Nom de la classe"} <span className="text-destructive">*</span></Label>
              <Input
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={terms.classExample}
                className="h-12 rounded-xl text-base"
              />
              {suggestions.length > 0 && !editingId ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  {suggestions.map((label) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setName(label)}
                      className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${name === label ? "border-primary bg-primary text-white" : "border-primary/20 bg-white text-primary hover:bg-primary/5"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label className="font-bold">{en ? "Class teacher (optional)" : "Titulaire (facultatif)"}</Label>
              <Select value={teacher} onValueChange={setTeacher}>
                <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder={en ? "Choose later" : "Choisir plus tard"} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{en ? "No class teacher yet" : "Pas encore de titulaire"}</SelectItem>
                  {teachers.map((member) => <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {needsSectionPick ? (
              <div className="space-y-2">
                <Label className="font-bold">{en ? "Section" : "Section"}</Label>
                <Select value={subSchool} onValueChange={setSubSchool}>
                  <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder={en ? "Choose a section" : "Choisir une section"} /></SelectTrigger>
                  <SelectContent>
                    {subSchools.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <Button onClick={() => void save()} disabled={saving} className="h-12 w-full gap-2 rounded-2xl text-base font-bold">
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
              {editingId ? (en ? "Save changes" : "Enregistrer") : (en ? "Add class" : "Ajouter la classe")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
