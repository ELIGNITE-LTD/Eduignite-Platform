"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Languages, Loader2, Pencil, Plus, School, Trash2, UserCog, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadError } from "@/components/ui/load-error";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { useEducationCategory } from "@/lib/hooks/useEducationCategory";
import { schoolsService } from "@/lib/api/services/schools.service";
import { getApiErrorMessage } from "@/lib/api/errors";
import type { HierarchySubSchool, User } from "@/lib/api/types";

const NONE = "__none__";

const list = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

/** Language of a section, read from its name (no extra field is stored). */
export function sectionLanguage(name: string): "en" | "fr" | null {
  if (/engl|anglo/i.test(name)) return "en";
  if (/fran[cç]|franco|french/i.test(name)) return "fr";
  return null;
}

/**
 * "Sections" tab for the head of a nursery/primary school: many Cameroonian
 * schools run an English section and a French section. The head adds them here,
 * then picks one when adding a class. SUB_ADMIN sees the list only.
 */
export function BasicSectionsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const { language } = useI18n();
  const en = language === "en";
  const category = useEducationCategory();
  const schoolId = user?.school?.id || "";
  const canManage = user?.role === "SCHOOL_ADMIN";
  const allowed = (canManage || user?.role === "SUB_ADMIN") && category === "basic";

  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [sections, setSections] = useState<HierarchySubSchool[]>([]);
  const [staff, setStaff] = useState<User[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<HierarchySubSchool | null>(null);
  const [name, setName] = useState("");
  const [head, setHead] = useState(NONE);

  const refresh = useCallback(async () => {
    if (!schoolId) return;
    setFailed(false);
    try {
      const [subSchoolData, staffData] = await Promise.all([
        schoolsService.getSubSchools(schoolId),
        schoolsService.getHierarchyStaff(schoolId),
      ]);
      setSections(list<HierarchySubSchool>(subSchoolData));
      setStaff(list<User>(staffData));
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

  useEffect(() => {
    try {
      if (canManage && new URLSearchParams(window.location.search).get("add") === "section") setOpen(true);
    } catch {
      /* no window (SSR) */
    }
  }, [canManage]);

  const reset = () => {
    setEditing(null);
    setName("");
    setHead(NONE);
  };

  const openNew = (preset = "") => {
    reset();
    setName(preset);
    setOpen(true);
  };

  const openEdit = (item: HierarchySubSchool) => {
    setEditing(item);
    setName(item.name);
    setHead(item.vice_principal || NONE);
    setOpen(true);
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast({ variant: "destructive", title: en ? "Section name required" : "Nom de section requis", description: en ? "Type or pick a name, e.g. English Section." : "Saisissez ou choisissez un nom, ex. Section Francophone." });
      return;
    }
    if (sections.some((s) => s.id !== editing?.id && s.name.trim().toLowerCase() === trimmed.toLowerCase())) {
      toast({ variant: "destructive", title: en ? "Name already used" : "Nom deja utilise", description: en ? "You already have a section with this name." : "Vous avez deja une section de ce nom." });
      return;
    }
    setSaving(true);
    try {
      const vice = head === NONE ? null : head;
      if (editing) {
        const payload: { school_id: string; vice_principal: string | null; name?: string } = { school_id: schoolId, vice_principal: vice };
        if (!editing.is_system_managed && trimmed !== editing.name) payload.name = trimmed;
        await schoolsService.updateSubSchool(editing.id, payload);
      } else {
        await schoolsService.createSubSchool({ name: trimmed, vice_principal: vice, school_id: schoolId });
      }
      setOpen(false);
      reset();
      await refresh();
      toast({ title: en ? "Section saved" : "Section enregistree", description: trimmed });
    } catch (error) {
      toast({ variant: "destructive", title: en ? "Could not save the section" : "Enregistrement impossible", description: getApiErrorMessage(error, en ? "Please check the name (it must be unique) and try again." : "Verifiez le nom (il doit etre unique) puis reessayez.") });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: HierarchySubSchool) => {
    const classCount = Number(item.total_classes) || item.classes?.length || 0;
    if (classCount > 0) {
      toast({
        variant: "destructive",
        title: en ? "This section has classes" : "Cette section a des classes",
        description: en
          ? `${item.name} has ${classCount} class(es). Move or delete them first, then delete the section.`
          : `${item.name} compte ${classCount} classe(s). Deplacez-les ou supprimez-les d'abord, puis supprimez la section.`,
      });
      return;
    }
    const message = en ? `Delete the section "${item.name}"?` : `Supprimer la section "${item.name}" ?`;
    if (typeof window !== "undefined" && !window.confirm(message)) return;
    try {
      await schoolsService.deleteSubSchool(item.id);
      await refresh();
      toast({ title: en ? "Section deleted" : "Section supprimee", description: item.name });
    } catch (error) {
      toast({ variant: "destructive", title: en ? "Could not delete" : "Suppression impossible", description: getApiErrorMessage(error, "") });
    }
  };

  if (!allowed || loading) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary/30" /></div>;
  }

  const staffChoices = staff.filter((m) => m && ["TEACHER", "SUB_ADMIN", "SCHOOL_ADMIN"].includes(m.role));
  const taken = new Set(sections.map((s) => s.name.trim().toLowerCase()));
  const quickPicks = [
    { label: en ? "English Section" : "Section Anglophone", value: "English Section" },
    { label: en ? "French Section" : "Section Francophone", value: "French Section" },
  ].filter((pick) => !taken.has(pick.value.toLowerCase()));

  const pupilCount = (item: HierarchySubSchool) =>
    (item.classes ?? []).reduce((sum, c) => sum + (Number(c.total_students) || 0), 0);

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-20">
      {failed ? <LoadError message="Some data could not be loaded. The list below may be incomplete." onRetry={() => void refresh()} /> : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary sm:text-3xl">{en ? "Sections" : "Sections"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {en
              ? "Does your school have an English section and a French section? Add them here, then choose one when you add a class. If you have just one, you can skip this."
              : "Votre ecole a une section anglophone et une section francophone ? Ajoutez-les ici, puis choisissez-en une en ajoutant une classe. Si vous n'en avez qu'une, vous pouvez passer."}
          </p>
        </div>
        {canManage ? (
          <Button onClick={() => openNew()} className="h-12 gap-2 rounded-2xl px-6 text-base font-bold shadow-md">
            <Plus className="h-5 w-5" />
            {en ? "Add section" : "Ajouter une section"}
          </Button>
        ) : null}
      </div>

      {sections.length === 0 ? (
        <Card className="rounded-3xl border-2 border-dashed border-primary/20 bg-primary/5 shadow-none">
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <span className="rounded-2xl bg-white p-4 text-primary shadow-sm"><School className="h-8 w-8" /></span>
            <p className="text-lg font-bold text-primary">{en ? "No section yet" : "Aucune section pour le moment"}</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {en ? "Add an English and/or French section, or skip this if your school has just one." : "Ajoutez une section anglophone et/ou francophone, ou passez si votre ecole n'en a qu'une."}
            </p>
            {canManage ? (
              <div className="flex flex-wrap justify-center gap-2 pt-1">
                {quickPicks.map((pick) => (
                  <Button key={pick.value} onClick={() => openNew(pick.value)} className="h-12 gap-2 rounded-2xl px-5 text-base font-bold">
                    <Plus className="h-5 w-5" />{pick.label}
                  </Button>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sections.map((item) => {
            const lang = sectionLanguage(item.name);
            const classCount = Number(item.total_classes) || item.classes?.length || 0;
            const pupils = pupilCount(item);
            return (
              <Card key={item.id} className="rounded-3xl border-none shadow-sm transition hover:shadow-md">
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-xl font-black text-primary">{item.name}</p>
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <UserCog className="h-4 w-4 shrink-0" />
                        <span className="truncate">{item.vice_principal_name || (en ? "No head yet" : "Pas encore de responsable")}</span>
                      </p>
                    </div>
                    {lang ? (
                      <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-accent/40 px-3 py-1 text-sm font-bold text-primary">
                        <Languages className="h-4 w-4" />
                        {lang === "en" ? (en ? "English" : "Anglais") : (en ? "French" : "Francais")}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2 text-sm font-semibold text-primary">
                    <span className="flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1"><School className="h-4 w-4" />{classCount} {en ? (classCount === 1 ? "class" : "classes") : (classCount === 1 ? "classe" : "classes")}</span>
                    <span className="flex items-center gap-1.5 rounded-full bg-purple-50 px-3 py-1"><Users className="h-4 w-4" />{pupils} {en ? (pupils === 1 ? "pupil" : "pupils") : (pupils === 1 ? "eleve" : "eleves")}</span>
                  </div>
                  {canManage ? (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1 rounded-xl" onClick={() => openEdit(item)}>
                        <Pencil className="mr-2 h-4 w-4" />{en ? "Edit" : "Modifier"}
                      </Button>
                      {!item.is_system_managed ? (
                        <Button variant="outline" size="sm" className="rounded-xl text-destructive" title={classCount > 0 ? (en ? "Move its classes out first" : "Deplacez d'abord ses classes") : undefined} onClick={() => void remove(item)} aria-label={en ? "Delete" : "Supprimer"}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}>
        <DialogContent className="max-w-lg rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black text-primary">
              {editing ? (en ? "Edit section" : "Modifier la section") : (en ? "Add a section" : "Ajouter une section")}
            </DialogTitle>
            <DialogDescription>
              {en ? "Just the name is needed. The head of section can be added now or later." : "Seul le nom est necessaire. Le responsable peut etre ajoute maintenant ou plus tard."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div className="space-y-2">
              <Label className="font-bold">{en ? "Section name" : "Nom de la section"} <span className="text-destructive">*</span></Label>
              <Input
                autoFocus
                value={name}
                disabled={Boolean(editing?.is_system_managed)}
                onChange={(event) => setName(event.target.value)}
                placeholder={en ? "e.g. English Section" : "ex. Section Francophone"}
                className="h-12 rounded-xl text-base"
              />
              {!editing && quickPicks.length > 0 ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  {quickPicks.map((pick) => (
                    <button
                      key={pick.value}
                      type="button"
                      onClick={() => setName(pick.value)}
                      className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${name === pick.value ? "border-primary bg-primary text-white" : "border-primary/20 bg-white text-primary hover:bg-primary/5"}`}
                    >
                      {pick.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label className="font-bold">{en ? "Head of section (optional)" : "Responsable de section (facultatif)"}</Label>
              <Select value={head} onValueChange={setHead}>
                <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder={en ? "Choose later" : "Choisir plus tard"} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{en ? "No head yet" : "Pas encore de responsable"}</SelectItem>
                  {staffChoices.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => void save()} disabled={saving} className="h-12 w-full gap-2 rounded-2xl text-base font-bold">
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
              {editing ? (en ? "Save changes" : "Enregistrer") : (en ? "Add section" : "Ajouter la section")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
