"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronDown, GraduationCap, Loader2, Wand2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LoadError } from "@/components/ui/load-error";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { schoolsService } from "@/lib/api/services/schools.service";
import { basicPromotionService, type PromotionOverride, type PromotionRow } from "@/lib/api/services/basic-promotion.service";
import { getApiErrorMessage } from "@/lib/api/errors";
import type { HierarchyClass } from "@/lib/api/types";
import { BasicMovePupils } from "./basic-move-pupils";

type Choice = "up" | "repeat" | "leave";

function defaultAcademicYear() {
  const today = new Date();
  const start = today.getMonth() >= 7 ? today.getFullYear() : today.getFullYear() - 1;
  return `${start}-${start + 1}`;
}

/**
 * Year-end promotion of a nursery/primary school in one plain page: the system already worked out who moves up
 * (the average reaches the pass mark), who repeats and who leaves school (final class). The head only looks at the
 * result, flips anyone who should go the other way, and presses one button. Nothing moves before that.
 */
export function BasicPromotionReview() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { language } = useI18n();
  const en = language === "en";
  const queryClient = useQueryClient();
  const schoolId = user?.school?.id || "";
  const isHead = user?.role === "SCHOOL_ADMIN";
  const allowed = isHead || user?.role === "SUB_ADMIN";

  const [year, setYear] = useState(defaultAcademicYear());
  const [overrides, setOverrides] = useState<Record<string, PromotionOverride>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [confirming, setConfirming] = useState(false);
  const [showMove, setShowMove] = useState(false);

  const settingsQ = useQuery({ queryKey: ["school-settings", schoolId], enabled: Boolean(schoolId), queryFn: () => schoolsService.getSchoolSettings(schoolId) });
  useEffect(() => { if (settingsQ.data?.academic_year) setYear(settingsQ.data.academic_year); }, [settingsQ.data?.academic_year]);

  const classesQ = useQuery({ queryKey: ["school-classes", schoolId], enabled: Boolean(schoolId), queryFn: () => schoolsService.getSchoolClasses(schoolId) });
  const classes = useMemo(() => (Array.isArray(classesQ.data) ? (classesQ.data as HierarchyClass[]) : []), [classesQ.data]);

  const previewQ = useQuery({ queryKey: ["student-promotions-basic", year], enabled: allowed && Boolean(year), queryFn: () => basicPromotionService.preview(year) });
  useEffect(() => setOverrides({}), [year]);
  const preview = previewQ.data;
  const rows = preview?.rows ?? [];

  const locked = (row: PromotionRow) => row.decision === "already_applied" || row.decision === "hold";
  /** What the pupil will do after the head's changes. */
  const choiceOf = (row: PromotionRow): Choice | "blocked" => {
    const o = overrides[row.student];
    if (o?.action === "repeat") return "repeat";
    if (o?.action === "promote" || o?.target_class) return row.decision === "graduate" ? "leave" : "up";
    if (row.decision === "repeat") return "repeat";
    if (row.decision === "graduate") return "leave";
    if (row.decision === "blocked") return "blocked";
    return "up";
  };

  const setChoice = (row: PromotionRow, choice: Choice) => {
    setOverrides((prev) => {
      const next = { ...prev };
      const defaultChoice: Choice = row.decision === "repeat" ? "repeat" : row.decision === "graduate" ? "leave" : "up";
      if (choice === defaultChoice) delete next[row.student];
      else next[row.student] = { student: row.student, action: choice === "repeat" ? "repeat" : "promote" };
      return next;
    });
  };

  const setTarget = (row: PromotionRow, classId: string) => {
    setOverrides((prev) => ({ ...prev, [row.student]: { student: row.student, target_class: classId } }));
  };

  const groups = useMemo(() => {
    const map = new Map<string, PromotionRow[]>();
    for (const row of rows) map.set(row.from_class?.name ?? "-", [...(map.get(row.from_class?.name ?? "-") ?? []), row]);
    return Array.from(map.entries());
  }, [rows]);

  const totals = useMemo(() => {
    let up = 0, repeat = 0, leave = 0, blocked = 0, done = 0;
    for (const row of rows) {
      if (locked(row)) { done += 1; continue; }
      const c = choiceOf(row);
      if (c === "blocked") blocked += 1; else if (c === "up") up += 1; else if (c === "repeat") repeat += 1; else leave += 1;
    }
    return { up, repeat, leave, blocked, done };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, overrides]);

  const confirmMutation = useMutation({
    mutationFn: () => basicPromotionService.confirm(year, Object.values(overrides)),
    onSuccess: async (result) => {
      setConfirming(false);
      setOverrides({});
      toast({ title: en ? "Promotion done" : "Promotion effectuée", description: result.detail });
      await queryClient.invalidateQueries();
    },
    onError: (error) => { setConfirming(false); toast({ variant: "destructive", title: en ? "Nothing was changed" : "Rien n'a été modifié", description: getApiErrorMessage(error, "") }); },
  });
  const createMutation = useMutation({
    mutationFn: () => basicPromotionService.createMissingClasses(),
    onSuccess: async (result) => { toast({ title: en ? "Classes created" : "Classes créées", description: result.detail }); await queryClient.invalidateQueries(); },
    onError: (error) => toast({ variant: "destructive", title: en ? "Could not create the classes" : "Impossible de créer les classes", description: getApiErrorMessage(error, "") }),
  });

  if (!allowed) return <p className="text-sm text-muted-foreground">{en ? "Only the school head can manage promotions." : "Seul le directeur peut gérer les promotions."}</p>;

  const total = totals.up + totals.repeat + totals.leave;
  const allDone = rows.length > 0 && totals.done === rows.length;
  const canConfirm = isHead && totals.blocked === 0 && total > 0;
  const needsClasses = (preview?.blockers ?? []).some((b) => b.code === "no_classes");
  const stat = (label: string, value: number, tone: string) => (
    <Card className="rounded-2xl border-none shadow-sm"><CardContent className="p-4"><p className={`text-3xl font-black ${tone}`}>{value}</p><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p></CardContent></Card>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-28">
      <header className="space-y-2 rounded-3xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5 sm:p-7">
        <h1 className="text-2xl font-black text-primary sm:text-3xl">{en ? "Promote pupils to the next class" : "Faire passer les élèves en classe supérieure"}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {en ? "We have already worked out who moves up. Look at the list, change anyone you want, then press the button at the bottom."
            : "Nous avons déjà calculé qui passe. Regardez la liste, changez qui vous voulez, puis appuyez sur le bouton en bas."}
        </p>
        <p className="text-xs font-semibold text-muted-foreground">{en ? "School year" : "Année scolaire"}: {year}</p>
      </header>

      {previewQ.isError ? <LoadError message={getApiErrorMessage(previewQ.error, en ? "The list could not be loaded." : "La liste n'a pas pu être chargée.")} onRetry={() => void previewQ.refetch()} /> : null}
      {previewQ.isLoading ? <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary/30" /></div> : null}

      {preview && rows.length === 0 ? (
        <Card className="rounded-3xl border-none shadow-sm"><CardContent className="p-6 text-sm text-muted-foreground">{en ? "There are no pupils in a class yet. Add your pupils to their classes first." : "Aucun élève n'est encore dans une classe. Ajoutez d'abord vos élèves dans leurs classes."}</CardContent></Card>
      ) : null}

      {preview && rows.length > 0 ? (
        <>
          {allDone ? (
            <Card className="rounded-3xl border border-emerald-200 bg-emerald-50 shadow-none">
              <CardContent className="flex items-center gap-3 p-5 text-emerald-800">
                <CheckCircle2 className="h-6 w-6 shrink-0" />
                <p className="text-sm font-semibold">{en ? `The promotion for ${year} is done. Pupils are in their new classes.` : `La promotion ${year} est terminée. Les élèves sont dans leurs nouvelles classes.`}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {stat(en ? "Move up" : "Passent", totals.up, "text-emerald-700")}
              {stat(en ? "Repeat" : "Redoublent", totals.repeat, "text-amber-700")}
              {stat(en ? "Leave school" : "Quittent l'école", totals.leave, "text-blue-700")}
              {totals.blocked > 0 ? stat(en ? "Need a class" : "Sans classe", totals.blocked, "text-red-700") : stat(en ? "Already done" : "Déjà faits", totals.done, "text-slate-600")}
            </div>
          )}

          {preview.blockers.length > 0 ? (
            <Card className="rounded-3xl border border-amber-200 bg-amber-50 shadow-none">
              <CardContent className="space-y-3 p-5">
                <p className="flex items-center gap-2 text-sm font-black text-amber-900"><AlertTriangle className="h-4 w-4" />{en ? "One thing to fix first" : "Une chose à régler d'abord"}</p>
                <ul className="space-y-1 text-sm text-amber-900">
                  {preview.blockers.map((b) => <li key={`${b.code}-${b.level}`}>{b.code === "no_classes"
                    ? (en ? `There is no class yet for ${b.next_level}, where ${b.level} pupils go.` : `Il n'y a pas encore de classe de ${b.next_level}, où vont les élèves de ${b.level}.`) : b.message}</li>)}
                </ul>
                <div className="flex flex-wrap gap-2">
                  {needsClasses && isHead ? (
                    <Button className="gap-2" disabled={createMutation.isPending} onClick={() => createMutation.mutate()}>
                      {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                      {en ? "Create the missing classes for me" : "Créer les classes manquantes pour moi"}
                    </Button>
                  ) : null}
                  <Button asChild variant="outline"><Link href="/dashboard/hierarchy">{en ? "Open my classes" : "Ouvrir mes classes"}</Link></Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <div className="space-y-3">
            {groups.map(([className, list]) => {
              const counts = { up: 0, repeat: 0, leave: 0 } as Record<Choice, number>;
              for (const row of list) { const c = choiceOf(row); if (c !== "blocked" && !locked(row)) counts[c] += 1; }
              const nextNames = Array.from(new Set(list.map((r) => r.target_class?.name).filter(Boolean)));
              const isOpen = open[className] ?? false;
              return (
                <Card key={className} className="rounded-3xl border-none shadow-sm">
                  <CardContent className="p-0">
                    <button type="button" onClick={() => setOpen({ ...open, [className]: !isOpen })} aria-expanded={isOpen} className="flex w-full items-center justify-between gap-3 p-4 text-left sm:p-5">
                      <div className="min-w-0">
                        <p className="text-lg font-black text-primary">{className}{nextNames.length ? <span className="font-semibold text-muted-foreground"> {"→"} {nextNames.join(", ")}</span> : null}</p>
                        <p className="text-xs text-muted-foreground">
                          {list.length} {en ? "pupils" : "élèves"}
                          {!list.every(locked) ? ` · ${counts.up} ${en ? "move up" : "passent"}${counts.repeat ? ` · ${counts.repeat} ${en ? "repeat" : "redoublent"}` : ""}${counts.leave ? ` · ${counts.leave} ${en ? "leave" : "quittent"}` : ""}` : ` · ${en ? "done" : "terminé"}`}
                        </p>
                      </div>
                      <ChevronDown className={`h-5 w-5 shrink-0 text-primary transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </button>
                    {isOpen ? (
                      <ul className="divide-y divide-primary/5 border-t px-4 pb-2 sm:px-5">
                        {list.map((row) => {
                          const c = choiceOf(row);
                          const final = row.decision === "graduate";
                          const upLabel = final ? (en ? "Leaves school" : "Quitte l'école") : (en ? "Moves up" : "Passe");
                          const sameLevelTargets = row.target_class ? classes.filter((k) => k.level_name === row.target_class?.level) : [];
                          return (
                            <li key={row.student} className="flex flex-wrap items-center justify-between gap-2 py-3">
                              <div className="min-w-0">
                                <p className="truncate font-semibold">{row.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {row.average != null ? `${row.average}/20` : (en ? "No average yet" : "Pas encore de moyenne")}
                                  {c === "up" && row.target_class ? ` · ${en ? "goes to" : "va en"} ${(overrides[row.student]?.target_class && classes.find((k) => k.id === overrides[row.student]?.target_class)?.name) || row.target_class.name}` : ""}
                                </p>
                              </div>
                              {locked(row) ? (
                                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{row.decision === "hold" ? (en ? "Not moved" : "Non déplacé") : (en ? "Already decided" : "Déjà décidé")}</span>
                              ) : c === "blocked" ? (
                                <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">{en ? "No class to go to yet" : "Pas encore de classe"}</span>
                              ) : (
                                <div className="flex flex-wrap items-center gap-2">
                                  {c === "up" && sameLevelTargets.length > 1 && isHead ? (
                                    <select aria-label={en ? "Class" : "Classe"} className="h-9 rounded-lg border bg-background px-2 text-sm" value={overrides[row.student]?.target_class ?? row.target_class?.id ?? ""} onChange={(e) => setTarget(row, e.target.value)}>
                                      {sameLevelTargets.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                                    </select>
                                  ) : null}
                                  <div role="group" aria-label={row.name} className="inline-flex overflow-hidden rounded-xl border">
                                    <button type="button" disabled={!isHead} onClick={() => setChoice(row, final ? "leave" : "up")} aria-pressed={c !== "repeat"}
                                      className={`px-3 py-1.5 text-sm font-bold ${c !== "repeat" ? "bg-emerald-600 text-white" : "bg-background text-muted-foreground"}`}>{upLabel}</button>
                                    <button type="button" disabled={!isHead} onClick={() => setChoice(row, "repeat")} aria-pressed={c === "repeat"}
                                      className={`border-l px-3 py-1.5 text-sm font-bold ${c === "repeat" ? "bg-amber-500 text-white" : "bg-background text-muted-foreground"}`}>{en ? "Repeats" : "Redouble"}</button>
                                  </div>
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="pt-2">
            <Button variant="ghost" size="sm" onClick={() => setShowMove((v) => !v)}>{showMove ? (en ? "Hide" : "Masquer") : (en ? "Need to move a pupil to another class (not promotion)?" : "Déplacer un élève dans une autre classe (hors promotion) ?")}</Button>
            {showMove ? <div className="mt-3"><BasicMovePupils /></div> : null}
          </div>
        </>
      ) : null}

      {preview && rows.length > 0 && !allDone ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 p-3 backdrop-blur md:left-64">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {totals.blocked > 0
                ? (en ? "Fix the class problem above to continue." : "Réglez le problème de classe ci-dessus pour continuer.")
                : en ? `${totals.up} move up · ${totals.repeat} repeat · ${totals.leave} leave school` : `${totals.up} passent · ${totals.repeat} redoublent · ${totals.leave} quittent l'école`}
            </p>
            {isHead ? (
              <Button disabled={!canConfirm} onClick={() => setConfirming(true)} className="h-12 gap-2 rounded-2xl px-6 text-base font-bold">
                <GraduationCap className="h-5 w-5" />{en ? "Promote the pupils" : "Valider la promotion"}
              </Button>
            ) : <p className="text-sm text-muted-foreground">{en ? "Only the school head can promote." : "Seul le directeur peut valider."}</p>}
          </div>
        </div>
      ) : null}

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-primary">{en ? "Promote the pupils now?" : "Valider la promotion maintenant ?"}</DialogTitle>
            <DialogDescription>
              {en ? `${totals.up} pupil(s) move up, ${totals.repeat} repeat, ${totals.leave} leave school. Matricules stay the same. Parents are told. This is done in one go.`
                : `${totals.up} élève(s) passent, ${totals.repeat} redoublent, ${totals.leave} quittent l'école. Les matricules restent les mêmes. Les parents sont informés. Tout est fait en une fois.`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setConfirming(false)}>{en ? "Not yet" : "Pas encore"}</Button>
            <Button disabled={confirmMutation.isPending} className="flex-1 rounded-xl" onClick={() => confirmMutation.mutate()}>
              {confirmMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : en ? "Yes, promote" : "Oui, valider"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
