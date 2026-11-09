"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, GraduationCap, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { schoolsService } from "@/lib/api/services/schools.service";
import { basicPromotionService, type PromotionOverride, type PromotionRow } from "@/lib/api/services/basic-promotion.service";
import { getApiErrorMessage } from "@/lib/api/errors";
import type { HierarchyClass } from "@/lib/api/types";
import { BasicMovePupils } from "./basic-move-pupils";

const REPEAT = "__repeat__";
const GRADUATE = "__graduate__";
const NONE = "__none__";

function defaultAcademicYear() {
  const today = new Date();
  const start = today.getMonth() >= 7 ? today.getFullYear() : today.getFullYear() - 1;
  return `${start}-${start + 1}`;
}

/**
 * Year-end promotion of a nursery/primary school, as a guided review: the class LEVEL decides the
 * next class (Class 1 A -> Class 2 A; fewer classes above means pupils are shared evenly). The head
 * checks the table, may change any pupil's class, then confirms once. Nothing moves before that.
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

  const [tab, setTab] = useState<"promotion" | "move">("promotion");
  const [year, setYear] = useState(defaultAcademicYear());
  const [overrides, setOverrides] = useState<Record<string, PromotionOverride>>({});
  const [confirming, setConfirming] = useState(false);

  const settingsQ = useQuery({ queryKey: ["school-settings", schoolId], enabled: Boolean(schoolId), queryFn: () => schoolsService.getSchoolSettings(schoolId) });
  useEffect(() => {
    if (settingsQ.data?.academic_year) setYear(settingsQ.data.academic_year);
  }, [settingsQ.data?.academic_year]);

  const classesQ = useQuery({ queryKey: ["school-classes", schoolId], enabled: Boolean(schoolId), queryFn: () => schoolsService.getSchoolClasses(schoolId) });
  const classes = useMemo(() => (Array.isArray(classesQ.data) ? (classesQ.data as HierarchyClass[]) : []), [classesQ.data]);

  const previewQ = useQuery({
    queryKey: ["student-promotions-basic", year],
    enabled: allowed && Boolean(year),
    queryFn: () => basicPromotionService.preview(year),
  });
  useEffect(() => setOverrides({}), [year]);
  const preview = previewQ.data;

  // Effective decision of a row after the head's changes.
  const effective = (row: PromotionRow): { kind: "promote" | "repeat" | "graduate" | "other"; target: string | null; blocked: boolean } => {
    const o = overrides[row.student];
    if (o?.action === "repeat") return { kind: "repeat", target: null, blocked: false };
    if (o?.target_class) return { kind: "promote", target: o.target_class, blocked: false };
    if (row.decision === "promote") return { kind: "promote", target: row.target_class?.id ?? null, blocked: !row.target_class };
    if (row.decision === "repeat") return { kind: "repeat", target: null, blocked: false };
    if (row.decision === "graduate") return { kind: "graduate", target: null, blocked: false };
    return { kind: "other", target: null, blocked: row.decision === "blocked" };
  };

  const rows = preview?.rows ?? [];
  const stats = useMemo(() => {
    const perTarget = new Map<string, number>();
    let promote = 0, repeat = 0, graduate = 0, blocked = 0, locked = 0;
    for (const row of rows) {
      const e = effective(row);
      if (row.decision === "already_applied" || row.decision === "hold") { locked += 1; continue; }
      if (e.blocked) blocked += 1;
      else if (e.kind === "promote") { promote += 1; if (e.target) perTarget.set(e.target, (perTarget.get(e.target) ?? 0) + 1); }
      else if (e.kind === "repeat") repeat += 1;
      else if (e.kind === "graduate") graduate += 1;
    }
    return { perTarget, promote, repeat, graduate, blocked, locked };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, overrides]);

  const grouped = useMemo(() => {
    const map = new Map<string, PromotionRow[]>();
    for (const row of rows) {
      const key = row.from_class?.name ?? "-";
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    return Array.from(map.entries());
  }, [rows]);

  const choose = (row: PromotionRow, value: string) => {
    setOverrides((prev) => {
      const next = { ...prev };
      const sameAsDefault = (value === REPEAT && row.decision === "repeat") || (value === row.target_class?.id && row.decision === "promote") || (value === GRADUATE && row.decision === "graduate");
      if (sameAsDefault || value === NONE || value === GRADUATE) delete next[row.student];
      else next[row.student] = value === REPEAT ? { student: row.student, action: "repeat" } : { student: row.student, target_class: value };
      return next;
    });
  };

  const confirmMutation = useMutation({
    mutationFn: () => basicPromotionService.confirm(year, Object.values(overrides)),
    onSuccess: async (result) => {
      setConfirming(false);
      setOverrides({});
      toast({ title: en ? "Promotion confirmed" : "Promotion confirmee", description: result.detail });
      await queryClient.invalidateQueries();
    },
    onError: (error) => toast({ variant: "destructive", title: en ? "Promotion not applied" : "Promotion non appliquee", description: getApiErrorMessage(error, "") }),
  });

  if (!allowed) return <p className="text-sm text-muted-foreground">{en ? "Only the school head can manage promotions." : "Seul le directeur peut gerer les promotions."}</p>;

  const targetName = (id: string) => classes.find((c) => c.id === id)?.name ?? "";
  const canConfirm = isHead && stats.blocked === 0 && stats.promote + stats.repeat + stats.graduate > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-20">
      <div>
        <h1 className="text-2xl font-bold text-primary sm:text-3xl">{en ? "Promotion and class moves" : "Promotion et changements de classe"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {en ? "Pupils go to the next level: Class 1 A to Class 2 A. Review, change anyone you want, then confirm." : "Les eleves passent au niveau suivant : CE1 A vers CE2 A. Verifiez, changez qui vous voulez, puis confirmez."}
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "promotion" | "move")}>
        <TabsList className="h-auto rounded-2xl bg-primary/5 p-1">
          <TabsTrigger value="promotion" className="rounded-xl px-4 py-2 text-sm font-bold">{en ? "End of year promotion" : "Promotion de fin d'annee"}</TabsTrigger>
          <TabsTrigger value="move" className="rounded-xl px-4 py-2 text-sm font-bold">{en ? "Move pupils" : "Deplacer des eleves"}</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "move" ? <BasicMovePupils /> : (
        <>
          <Card className="rounded-3xl border-none shadow-sm">
            <CardContent className="flex flex-wrap items-end gap-3 p-5">
              <div className="space-y-2">
                <Label className="font-bold">{en ? "School year" : "Annee scolaire"}</Label>
                <Input value={year} onChange={(e) => setYear(e.target.value)} className="h-12 w-44 rounded-xl" placeholder="2026-2027" />
              </div>
              <Button variant="outline" className="h-12 rounded-xl font-bold" onClick={() => void previewQ.refetch()}>{en ? "Refresh" : "Actualiser"}</Button>
            </CardContent>
          </Card>

          {previewQ.isError ? <LoadError message={getApiErrorMessage(previewQ.error, "The promotion preview could not be loaded.")} onRetry={() => void previewQ.refetch()} /> : null}
          {previewQ.isLoading ? <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary/30" /></div> : null}

          {preview ? (
            <>
              {preview.blockers.length > 0 ? (
                <Card className="rounded-3xl border border-amber-200 bg-amber-50 shadow-none">
                  <CardContent className="space-y-1 p-4 text-sm font-semibold text-amber-800">
                    {preview.blockers.map((b) => <p key={b.code + b.level} className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 shrink-0" />{b.message}</p>)}
                  </CardContent>
                </Card>
              ) : null}

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {([
                  [en ? "Move up" : "Passent", stats.promote, "text-emerald-700"],
                  [en ? "Repeat" : "Redoublent", stats.repeat, "text-amber-700"],
                  [en ? "Graduate" : "Sortent", stats.graduate, "text-blue-700"],
                  [en ? "No class yet" : "Sans classe", stats.blocked, "text-red-700"],
                ] as const).map(([label, value, tone]) => (
                  <Card key={label} className="rounded-2xl border-none shadow-sm"><CardContent className="p-4"><p className={`text-3xl font-black ${tone}`}>{value}</p><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p></CardContent></Card>
                ))}
              </div>

              {stats.perTarget.size > 0 ? (
                <Card className="rounded-3xl border-none shadow-sm">
                  <CardContent className="space-y-2 p-5">
                    <p className="text-sm font-black uppercase tracking-widest text-primary">{en ? "Pupils per new class" : "Eleves par nouvelle classe"}</p>
                    <div className="flex flex-wrap gap-2">
                      {Array.from(stats.perTarget.entries()).map(([id, n]) => <Badge key={id} variant="secondary" className="rounded-full px-3 py-1 text-sm font-bold">{targetName(id)}: {n}</Badge>)}
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              {grouped.length === 0 ? <p className="text-sm text-muted-foreground">{en ? "No pupil to promote yet." : "Aucun eleve a promouvoir."}</p> : null}
              {grouped.map(([className, list]) => (
                <Card key={className} className="rounded-3xl border-none shadow-sm">
                  <CardContent className="space-y-2 p-4 sm:p-5">
                    <p className="flex items-center gap-2 text-lg font-black text-primary">{className} <span className="text-xs font-bold text-muted-foreground">({list.length})</span></p>
                    <ul className="divide-y divide-primary/5">
                      {list.map((row) => {
                        const e = effective(row);
                        const locked = row.decision === "already_applied" || row.decision === "hold";
                        const value = e.kind === "repeat" ? REPEAT : e.kind === "graduate" ? GRADUATE : e.target ?? NONE;
                        return (
                          <li key={row.student} className="flex flex-wrap items-center justify-between gap-2 py-2">
                            <div className="min-w-0">
                              <p className="truncate font-semibold">{row.name}</p>
                              <p className="text-xs text-muted-foreground">{row.average != null ? `${row.average}/20 - ` : ""}{overrides[row.student] ? (en ? "changed by you" : "modifie par vous") : row.reason}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <ArrowRight className="hidden h-4 w-4 text-primary sm:block" />
                              {locked ? (
                                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{row.decision === "hold" ? (en ? "Not moved" : "Non deplace") : (en ? "Already decided" : "Deja decide")}</span>
                              ) : (
                                <Select value={value} onValueChange={(v) => choose(row, v)} disabled={!isHead}>
                                  <SelectTrigger className={`h-10 min-w-[11rem] rounded-xl text-sm ${e.blocked ? "border-red-300" : ""}`}><SelectValue placeholder={en ? "Choose a class" : "Choisir une classe"} /></SelectTrigger>
                                  <SelectContent>
                                    {row.decision === "graduate" ? <SelectItem value={GRADUATE}>{en ? "Graduates" : "Termine l'ecole"}</SelectItem> : null}
                                    <SelectItem value={REPEAT}>{en ? "Stays in the same class" : "Redouble la meme classe"}</SelectItem>
                                    {e.blocked ? <SelectItem value={NONE} disabled>{en ? "Choose a class" : "Choisir une classe"}</SelectItem> : null}
                                    {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </CardContent>
                </Card>
              ))}

              {isHead ? (
                <Button disabled={!canConfirm} onClick={() => setConfirming(true)} className="h-14 w-full gap-2 rounded-2xl text-base font-bold">
                  <GraduationCap className="h-5 w-5" />{en ? "Confirm promotion" : "Confirmer la promotion"}
                </Button>
              ) : <p className="text-sm text-muted-foreground">{en ? "Only the school head can confirm." : "Seul le directeur peut confirmer."}</p>}
              {stats.blocked > 0 ? <p className="text-sm font-semibold text-red-700">{en ? "Choose a class for the pupils marked in red, or create the missing classes in Hierarchy & Sections." : "Choisissez une classe pour les eleves en rouge, ou creez les classes manquantes dans Hierarchie & Sections."}</p> : null}
            </>
          ) : null}
        </>
      )}

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-primary">{en ? "Confirm the promotion?" : "Confirmer la promotion ?"}</DialogTitle>
            <DialogDescription>
              {en ? `${stats.promote} pupil(s) move up, ${stats.repeat} repeat, ${stats.graduate} graduate. Matricules are kept. This is applied in one go.` : `${stats.promote} eleve(s) passent, ${stats.repeat} redoublent, ${stats.graduate} sortent. Les matricules sont conserves. Tout est applique en une fois.`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setConfirming(false)}>{en ? "Cancel" : "Annuler"}</Button>
            <Button disabled={confirmMutation.isPending} className="flex-1 rounded-xl" onClick={() => confirmMutation.mutate()}>
              {confirmMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : en ? "Yes, confirm" : "Oui, confirmer"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
