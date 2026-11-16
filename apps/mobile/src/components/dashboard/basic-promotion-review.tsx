"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronDown, GraduationCap, Loader2, Wand2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { LoadError } from "@/components/ui/load-error";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { schoolsService } from "@/lib/api/services/schools.service";
import { basicPromotionService, type PromotionRow } from "@/lib/api/services/basic-promotion.service";
import { getApiErrorMessage } from "@/lib/api/errors";
import { BasicMovePupils } from "./basic-move-pupils";

function defaultAcademicYear() {
  const today = new Date();
  const start = today.getMonth() >= 7 ? today.getFullYear() : today.getFullYear() - 1;
  return `${start}-${start + 1}`;
}

/**
 * Year-end promotion of a nursery/primary school, the way secondary does it: the head sets ONE pass average for the
 * whole school and presses one button. Everyone with that average or more moves up (the final class graduates);
 * everyone below repeats. Afterwards the head can promote any of the repeating pupils, some or all.
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
  const [averageText, setAverageText] = useState("");
  const [liveAverage, setLiveAverage] = useState<number | undefined>(undefined);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [confirming, setConfirming] = useState(false);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [confirmingRepeaters, setConfirmingRepeaters] = useState<"selected" | "all" | null>(null);
  const [showMove, setShowMove] = useState(false);

  const settingsQ = useQuery({ queryKey: ["school-settings", schoolId], enabled: Boolean(schoolId), queryFn: () => schoolsService.getSchoolSettings(schoolId) });
  useEffect(() => { if (settingsQ.data?.academic_year) setYear(settingsQ.data.academic_year); }, [settingsQ.data?.academic_year]);

  // Wait for the head to stop typing before asking the server what the new average would do.
  useEffect(() => {
    const value = Number(averageText);
    if (averageText.trim() === "" || !Number.isFinite(value) || value < 0 || value > 20) return;
    const t = setTimeout(() => setLiveAverage(value), 450);
    return () => clearTimeout(t);
  }, [averageText]);

  const previewQ = useQuery({
    queryKey: ["student-promotions-basic", year, liveAverage ?? "school"],
    enabled: allowed && Boolean(year),
    queryFn: () => basicPromotionService.preview(year, liveAverage),
    placeholderData: (previous) => previous,
  });
  const preview = previewQ.data;
  useEffect(() => { if (preview && averageText === "") setAverageText(String(preview.school_pass_average)); }, [preview, averageText]);
  const rows = preview?.rows ?? [];

  const repeatersQ = useQuery({ queryKey: ["basic-repeaters", year], enabled: allowed && Boolean(year), queryFn: () => basicPromotionService.repeaters(year) });
  const repeaters = repeatersQ.data ?? [];
  const pickedIds = repeaters.filter((r) => picked[r.student]).map((r) => r.student);

  const locked = (row: PromotionRow) => row.decision === "already_applied" || row.decision === "hold";
  const counts = useMemo(() => {
    let up = 0, repeat = 0, leave = 0, blocked = 0, done = 0, noMarks = 0;
    for (const row of rows) {
      if (locked(row)) { done += 1; continue; }
      if (row.decision === "blocked") blocked += 1;
      else if (row.decision === "repeat") repeat += 1;
      else if (row.decision === "graduate") leave += 1;
      else { up += 1; if (row.no_average) noMarks += 1; }
    }
    return { up, repeat, leave, blocked, done, noMarks };
  }, [rows]);

  const groups = useMemo(() => {
    const map = new Map<string, PromotionRow[]>();
    for (const row of rows) map.set(row.from_class?.name ?? "-", [...(map.get(row.from_class?.name ?? "-") ?? []), row]);
    return Array.from(map.entries());
  }, [rows]);

  const averageValue = Number(averageText);
  const averageValid = averageText.trim() !== "" && Number.isFinite(averageValue) && averageValue >= 0 && averageValue <= 20;
  const settled = averageValid && liveAverage === averageValue && !previewQ.isFetching;

  const refreshAll = async () => { await queryClient.invalidateQueries(); };
  const confirmMutation = useMutation({
    mutationFn: () => basicPromotionService.confirm(year, averageValue),
    onSuccess: async (result) => { setConfirming(false); toast({ title: en ? "Promotion done" : "Promotion effectuée", description: result.detail }); await refreshAll(); },
    onError: (error) => { setConfirming(false); toast({ variant: "destructive", title: en ? "Nothing was changed" : "Rien n'a été modifié", description: getApiErrorMessage(error, "") }); },
  });
  const repeatersMutation = useMutation({
    mutationFn: (which: "selected" | "all") => basicPromotionService.promoteRepeaters(year, which === "all" ? "all" : pickedIds),
    onSuccess: async (result) => { setConfirmingRepeaters(null); setPicked({}); toast({ title: en ? "Repeating pupils promoted" : "Redoublants promus", description: result.detail }); await refreshAll(); },
    onError: (error) => { setConfirmingRepeaters(null); toast({ variant: "destructive", title: en ? "Nothing was changed" : "Rien n'a été modifié", description: getApiErrorMessage(error, "") }); },
  });
  const createMutation = useMutation({
    mutationFn: () => basicPromotionService.createMissingClasses(),
    onSuccess: async (result) => { toast({ title: en ? "Classes created" : "Classes créées", description: result.detail }); await refreshAll(); },
    onError: (error) => toast({ variant: "destructive", title: en ? "Could not create the classes" : "Impossible de créer les classes", description: getApiErrorMessage(error, "") }),
  });

  if (!allowed) return <p className="text-sm text-muted-foreground">{en ? "Only the school head can manage promotions." : "Seul le directeur peut gérer les promotions."}</p>;

  const total = counts.up + counts.repeat + counts.leave;
  const allDone = rows.length > 0 && counts.done === rows.length;
  const canConfirm = isHead && settled && counts.blocked === 0 && total > 0;
  const needsClasses = (preview?.blockers ?? []).some((b) => b.code === "no_classes");
  const stat = (label: string, value: number, tone: string) => (
    <Card className="rounded-2xl border-none shadow-sm"><CardContent className="p-4"><p className={`text-3xl font-black ${tone}`}>{value}</p><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p></CardContent></Card>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-28">
      <header className="space-y-2 rounded-3xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5 sm:p-7">
        <h1 className="text-2xl font-black text-primary sm:text-3xl">{en ? "Promote pupils to the next class" : "Faire passer les élèves en classe supérieure"}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {en ? "Set the pass average for the whole school, then press Promote. Every pupil with that average or more moves up. Every pupil below repeats. You can promote repeating pupils afterwards."
            : "Fixez la moyenne de passage pour toute l'école, puis appuyez sur Valider. Tout élève ayant cette moyenne ou plus passe. Tout élève en dessous redouble. Vous pourrez ensuite faire passer des redoublants."}
        </p>
        <p className="text-xs font-semibold text-muted-foreground">{en ? "School year" : "Année scolaire"}: {year}</p>
      </header>

      <Card className="rounded-3xl border-none shadow-sm">
        <CardContent className="flex flex-wrap items-end gap-4 p-5">
          <div className="space-y-1.5">
            <label htmlFor="pass-average" className="text-sm font-bold">{en ? "Pass average (out of 20)" : "Moyenne de passage (sur 20)"}</label>
            <div className="flex items-center gap-2">
              <Input id="pass-average" type="number" inputMode="decimal" min={0} max={20} step={0.25} value={averageText} disabled={!isHead || allDone}
                onChange={(e) => setAverageText(e.target.value)} className="h-12 w-28 rounded-xl text-lg font-bold" />
              <span className="text-sm text-muted-foreground">/ 20</span>
            </div>
          </div>
          <p className="max-w-md pb-1 text-sm text-muted-foreground">
            {averageValid
              ? (en ? `${averageValue} or more moves up. Below ${averageValue} repeats.` : `${averageValue} ou plus : passe. Moins de ${averageValue} : redouble.`)
              : (en ? "Enter a number between 0 and 20." : "Saisissez un nombre entre 0 et 20.")}
          </p>
          {previewQ.isFetching ? <Loader2 className="mb-3 h-4 w-4 animate-spin text-primary/50" /> : null}
        </CardContent>
      </Card>

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
              {stat(en ? "Move up" : "Passent", counts.up, "text-emerald-700")}
              {stat(en ? "Repeat" : "Redoublent", counts.repeat, "text-amber-700")}
              {stat(en ? "Leave school" : "Quittent l'école", counts.leave, "text-blue-700")}
              {counts.blocked > 0 ? stat(en ? "Need a class" : "Sans classe", counts.blocked, "text-red-700") : stat(en ? "Already done" : "Déjà faits", counts.done, "text-slate-600")}
            </div>
          )}
          {!allDone && counts.noMarks > 0 ? (
            <p className="text-sm text-muted-foreground">{en ? `${counts.noMarks} pupil(s) have no marks yet. They move up because there is no average to judge them by.` : `${counts.noMarks} élève(s) n'ont pas encore de notes. Ils passent faute de moyenne pour les juger.`}</p>
          ) : null}

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
              const up = list.filter((r) => !locked(r) && (r.decision === "promote" || r.decision === "graduate")).length;
              const rep = list.filter((r) => !locked(r) && r.decision === "repeat").length;
              const nextNames = Array.from(new Set(list.map((r) => r.target_class?.name).filter(Boolean)));
              const isOpen = open[className] ?? false;
              return (
                <Card key={className} className="rounded-3xl border-none shadow-sm">
                  <CardContent className="p-0">
                    <button type="button" onClick={() => setOpen({ ...open, [className]: !isOpen })} aria-expanded={isOpen} className="flex w-full items-center justify-between gap-3 p-4 text-left sm:p-5">
                      <div className="min-w-0">
                        <p className="text-lg font-black text-primary">{className}{nextNames.length ? <span className="font-semibold text-muted-foreground"> {"→"} {nextNames.join(", ")}</span> : null}</p>
                        <p className="text-xs text-muted-foreground">
                          {list.length} {en ? "pupils" : "élèves"}{list.every(locked) ? ` · ${en ? "done" : "terminé"}` : ` · ${up} ${en ? "move up" : "passent"} · ${rep} ${en ? "repeat" : "redoublent"}`}
                        </p>
                      </div>
                      <ChevronDown className={`h-5 w-5 shrink-0 text-primary transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </button>
                    {isOpen ? (
                      <ul className="divide-y divide-primary/5 border-t px-4 pb-2 sm:px-5">
                        {list.map((row) => (
                          <li key={row.student} className="flex items-center justify-between gap-2 py-2.5">
                            <div className="min-w-0"><p className="truncate font-semibold">{row.name}</p><p className="text-xs text-muted-foreground">{row.average != null ? `${row.average}/20` : (en ? "No average yet" : "Pas encore de moyenne")}</p></div>
                            <span className={`rounded-full px-3 py-1 text-xs font-bold ${locked(row) ? "bg-slate-100 text-slate-600" : row.decision === "repeat" ? "bg-amber-100 text-amber-800" : row.decision === "blocked" ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-800"}`}>
                              {locked(row) ? (en ? "Already decided" : "Déjà décidé") : row.decision === "repeat" ? (en ? "Repeats" : "Redouble") : row.decision === "blocked" ? (en ? "No class yet" : "Pas de classe") : row.decision === "graduate" ? (en ? "Leaves school" : "Quitte l'école") : (en ? "Moves up" : "Passe")}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      ) : null}

      {repeaters.length > 0 ? (
        <Card className="rounded-3xl border-none shadow-sm">
          <CardContent className="space-y-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-lg font-black text-primary">{en ? "Repeating pupils" : "Élèves redoublants"} ({repeaters.length})</p>
                <p className="text-xs text-muted-foreground">{en ? "Tick the pupils you want to promote anyway, or promote all of them." : "Cochez les élèves à faire passer quand même, ou faites passer tous les redoublants."}</p>
              </div>
              {isHead ? (
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" checked={repeaters.length > 0 && pickedIds.length === repeaters.length}
                    onChange={(e) => setPicked(e.target.checked ? Object.fromEntries(repeaters.map((r) => [r.student, true])) : {})} />
                  {en ? "Select all" : "Tout sélectionner"}
                </label>
              ) : null}
            </div>
            <ul className="divide-y divide-primary/5">
              {repeaters.map((r) => (
                <li key={r.student} className="flex items-center gap-3 py-2.5">
                  {isHead ? <input type="checkbox" aria-label={r.name} checked={Boolean(picked[r.student])} onChange={(e) => setPicked({ ...picked, [r.student]: e.target.checked })} /> : null}
                  <div className="min-w-0 flex-1"><p className="truncate font-semibold">{r.name}</p>
                    <p className="text-xs text-muted-foreground">{r.class?.name}{r.average != null ? ` · ${r.average}/20` : ""}{r.final ? ` · ${en ? "would leave school" : "quitterait l'école"}` : ""}</p></div>
                </li>
              ))}
            </ul>
            {isHead ? (
              <div className="flex flex-wrap gap-2">
                <Button disabled={pickedIds.length === 0 || repeatersMutation.isPending} onClick={() => setConfirmingRepeaters("selected")}>
                  {en ? `Promote the ${pickedIds.length} selected` : `Faire passer les ${pickedIds.length} sélectionnés`}
                </Button>
                <Button variant="outline" disabled={repeatersMutation.isPending} onClick={() => setConfirmingRepeaters("all")}>{en ? "Promote all repeating pupils" : "Faire passer tous les redoublants"}</Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="pt-2">
        <Button variant="ghost" size="sm" onClick={() => setShowMove((v) => !v)}>{showMove ? (en ? "Hide" : "Masquer") : (en ? "Need to move a pupil to another class (not promotion)?" : "Déplacer un élève dans une autre classe (hors promotion) ?")}</Button>
        {showMove ? <div className="mt-3"><BasicMovePupils /></div> : null}
      </div>

      {preview && rows.length > 0 && !allDone ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 p-3 backdrop-blur md:left-64">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {!averageValid ? (en ? "Enter the pass average to continue." : "Saisissez la moyenne de passage pour continuer.")
                : counts.blocked > 0 ? (en ? "Fix the class problem above to continue." : "Réglez le problème de classe ci-dessus pour continuer.")
                : en ? `${counts.up} move up · ${counts.repeat} repeat · ${counts.leave} leave school` : `${counts.up} passent · ${counts.repeat} redoublent · ${counts.leave} quittent l'école`}
            </p>
            {isHead ? (
              <Button disabled={!canConfirm} onClick={() => setConfirming(true)} className="h-12 gap-2 rounded-2xl px-6 text-base font-bold">
                <GraduationCap className="h-5 w-5" />{en ? "Promote all classes" : "Valider pour toutes les classes"}
              </Button>
            ) : <p className="text-sm text-muted-foreground">{en ? "Only the school head can promote." : "Seul le directeur peut valider."}</p>}
          </div>
        </div>
      ) : null}

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-primary">{en ? "Promote all classes now?" : "Valider pour toutes les classes ?"}</DialogTitle>
            <DialogDescription>
              {en ? `Pass average ${averageValue}/20: ${counts.up} pupil(s) move up, ${counts.repeat} repeat, ${counts.leave} leave school. Matricules stay the same. Parents are told. This applies to every class at once.`
                : `Moyenne ${averageValue}/20 : ${counts.up} élève(s) passent, ${counts.repeat} redoublent, ${counts.leave} quittent l'école. Les matricules restent les mêmes. Les parents sont informés. Cela s'applique à toutes les classes à la fois.`}
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

      <Dialog open={confirmingRepeaters !== null} onOpenChange={(o) => !o && setConfirmingRepeaters(null)}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-primary">{en ? "Promote repeating pupils?" : "Faire passer les redoublants ?"}</DialogTitle>
            <DialogDescription>
              {en ? `${confirmingRepeaters === "all" ? repeaters.length : pickedIds.length} repeating pupil(s) will move to the next class (those in the final class leave school). Parents are told.`
                : `${confirmingRepeaters === "all" ? repeaters.length : pickedIds.length} redoublant(s) passeront en classe supérieure (ceux de la dernière classe quittent l'école). Les parents sont informés.`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setConfirmingRepeaters(null)}>{en ? "Not yet" : "Pas encore"}</Button>
            <Button disabled={repeatersMutation.isPending || !confirmingRepeaters} className="flex-1 rounded-xl" onClick={() => confirmingRepeaters && repeatersMutation.mutate(confirmingRepeaters)}>
              {repeatersMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : en ? "Yes, promote" : "Oui, valider"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
