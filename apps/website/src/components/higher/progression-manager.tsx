"use client";

import { useEffect, useMemo, useState } from "react";
import { GraduationCap, Loader2, MoveUp, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useHigherAcademicYears, useHigherProgrammes } from "@/lib/hooks/useHigherEd";
import { higherEdErrorMessage, higherEdProgressionService as api, type ProgressionResult, type ProgressionRow } from "@/lib/api/services/higher-ed.service";
import { HigherPageHeader, LoadFailed, Loading, selectClass, useHigherRole, useHigherText } from "./higher-shared";

const STATE_TEXT: Record<ProgressionRow["state"], [string, string, string]> = {
  to_decide: ["Moves up", "Passe au niveau suivant", "bg-emerald-100 text-emerald-800"],
  ready_to_graduate: ["Graduates", "Diplômé", "bg-violet-100 text-violet-800"],
  final_not_met: ["Final level, credits not complete", "Dernier niveau, crédits incomplets", "bg-amber-100 text-amber-800"],
  graduated: ["Graduated", "Diplômé", "bg-slate-100 text-slate-600"],
  moved: ["Already moved", "Déjà passé", "bg-slate-100 text-slate-600"],
};

/** Year-end progression of a higher-education institution: filter by programme and level, move students up, or graduate the final level. */
export function ProgressionManager() {
  const tr = useHigherText();
  const { toast } = useToast();
  const { isAdmin } = useHigherRole();
  const years = useHigherAcademicYears();
  const programmes = useHigherProgrammes();
  const [fromYear, setFromYear] = useState("");
  const [toYear, setToYear] = useState("");
  const [programme, setProgramme] = useState("");
  const [level, setLevel] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ProgressionRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState("");
  const [nonce, setNonce] = useState(0);

  const yearList = years.data ?? [];
  useEffect(() => {
    if (fromYear || !yearList.length) return;
    const sorted = [...yearList].sort((a, b) => a.start_date.localeCompare(b.start_date));
    const current = sorted.find((y) => y.is_current) ?? sorted[sorted.length - 1];
    setFromYear(current.id);
    setToYear(sorted.find((y) => y.start_date > current.start_date)?.id ?? "");
  }, [yearList, fromYear]);

  const levels = useMemo(() => (programmes.data ?? []).find((p) => p.id === programme)?.years ?? [], [programmes.data, programme]);

  useEffect(() => {
    if (!fromYear) return;
    let cancelled = false;
    setFailed(false);
    const t = setTimeout(() => {
      api.list({ academic_year: fromYear, programme, level, q }).then((r) => { if (!cancelled) { setRows(r); setPicked({}); } }).catch(() => { if (!cancelled) setFailed(true); });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [fromYear, programme, level, q, nonce]);

  if (!isAdmin) return <p className="text-sm text-muted-foreground">{tr("Only the administration can move students up.", "Seule l'administration peut faire passer les étudiants.")}</p>;
  if (years.isLoading || programmes.isLoading) return <Loading />;
  if (failed || years.isError) return <LoadFailed />;

  const list = rows ?? [];
  const chosen = list.filter((r) => picked[r.enrolment]);
  const movable = list.filter((r) => r.state === "to_decide");
  const graduating = list.filter((r) => r.state === "ready_to_graduate");

  async function act(name: string, call: () => Promise<ProgressionResult>, done: (r: ProgressionResult) => string) {
    setBusy(name);
    try {
      const r = await call();
      toast({ title: done(r), description: r.failed.length ? r.failed.slice(0, 4).map((f) => `${f.name}: ${f.reason}`).join(" · ") : undefined, variant: undefined });
      setNonce((n) => n + 1);
    } catch (error) {
      toast({ variant: "destructive", title: tr("Nothing was changed", "Rien n'a été modifié"), description: higherEdErrorMessage(error, tr("Please try again.", "Réessayez.")) });
    }
    setBusy("");
  }
  const needTarget = () => { if (!toYear) { toast({ variant: "destructive", title: tr("Choose the new academic year first", "Choisissez d'abord la nouvelle année académique") }); return false; } return true; };
  const scope = { programme: programme || undefined, level: level || undefined };

  return (
    <div className="space-y-5">
      <HigherPageHeader
        title={tr("Promotion and graduation", "Passage et diplomation")}
        help={tr("At the end of the year, move students to the next level of their programme. Students of the final level who earned the credits their programme requires graduate. Filter by programme and level to work one group at a time.", "En fin d'année, faites passer les étudiants au niveau suivant de leur filière. Les étudiants du dernier niveau ayant validé les crédits requis sont diplômés. Filtrez par filière et niveau pour travailler un groupe à la fois.")}
      />
      <div className="grid gap-3 rounded-2xl bg-card p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1"><Label>{tr("Promote from", "Passer depuis")}</Label>
          <select className={selectClass} value={fromYear} onChange={(e) => setFromYear(e.target.value)}>{yearList.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}</select></div>
        <div className="space-y-1"><Label>{tr("Into academic year", "Vers l'année académique")}</Label>
          <select className={selectClass} value={toYear} onChange={(e) => setToYear(e.target.value)}><option value="">{tr("Choose…", "Choisir…")}</option>{yearList.filter((y) => y.id !== fromYear).map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}</select></div>
        <div className="space-y-1"><Label>{tr("Programme", "Filière")}</Label>
          <select className={selectClass} value={programme} onChange={(e) => { setProgramme(e.target.value); setLevel(""); }}><option value="">{tr("All programmes", "Toutes les filières")}</option>{(programmes.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <div className="space-y-1"><Label>{tr("Level", "Niveau")}</Label>
          <select className={selectClass} value={level} onChange={(e) => setLevel(e.target.value)} disabled={!programme}><option value="">{tr("All levels", "Tous les niveaux")}</option>{levels.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select></div>
        <div className="space-y-1"><Label>{tr("Search", "Rechercher")}</Label><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Name or matricule", "Nom ou matricule")} /></div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button disabled={!movable.length || !!busy} onClick={() => needTarget() && act("promote", () => api.promote({ academic_year: fromYear, target_academic_year: toYear, all: true, ...scope }), (r) => tr(`${r.moved} student(s) moved up.`, `${r.moved} étudiant(s) passé(s).`))}>
          {busy === "promote" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MoveUp className="mr-2 h-4 w-4" />}{tr(`Move up all shown (${movable.length})`, `Faire passer tous (${movable.length})`)}
        </Button>
        <Button variant="secondary" disabled={!graduating.length || !!busy} onClick={() => act("graduate", () => api.graduate({ academic_year: fromYear, all: true, ...scope }), (r) => tr(`${r.graduated} student(s) graduated.`, `${r.graduated} étudiant(s) diplômé(s).`))}>
          {busy === "graduate" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GraduationCap className="mr-2 h-4 w-4" />}{tr(`Graduate all who qualify (${graduating.length})`, `Diplômer tous ceux qui remplissent les critères (${graduating.length})`)}
        </Button>
        <Button variant="outline" disabled={!chosen.length || !!busy} onClick={() => needTarget() && act("repeat", () => api.repeat({ academic_year: fromYear, target_academic_year: toYear, enrolment_ids: chosen.map((r) => r.enrolment) }), (r) => tr(`${r.moved} student(s) will repeat their level.`, `${r.moved} étudiant(s) redoublent.`))}>
          <RotateCcw className="mr-2 h-4 w-4" />{tr(`Repeat the ${chosen.length} selected`, `Faire redoubler les ${chosen.length} sélectionnés`)}
        </Button>
        <Button variant="outline" disabled={!chosen.length || !!busy} onClick={() => needTarget() && act("promote-sel", () => api.promote({ academic_year: fromYear, target_academic_year: toYear, enrolment_ids: chosen.map((r) => r.enrolment) }), (r) => tr(`${r.moved} student(s) moved up.`, `${r.moved} étudiant(s) passé(s).`))}>
          {tr(`Move up the ${chosen.length} selected`, `Faire passer les ${chosen.length} sélectionnés`)}
        </Button>
      </div>

      {rows === null ? <Loading /> : (
        <div className="overflow-x-auto rounded-2xl bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs">
              <tr>
                <th className="p-2"><input type="checkbox" aria-label={tr("Select all", "Tout sélectionner")} checked={list.length > 0 && list.every((r) => picked[r.enrolment])}
                  onChange={(e) => setPicked(e.target.checked ? Object.fromEntries(list.map((r) => [r.enrolment, true])) : {})} /></th>
                <th className="p-2">{tr("Student", "Étudiant")}</th><th className="p-2">{tr("Programme", "Filière")}</th><th className="p-2">{tr("Level", "Niveau")}</th>
                <th className="p-2">{tr("Credits this year", "Crédits de l'année")}</th><th className="p-2">{tr("Credits total", "Crédits cumulés")}</th><th className="p-2">{tr("Decision", "Décision")}</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.enrolment} className="border-t">
                  <td className="p-2"><input type="checkbox" aria-label={r.name} checked={Boolean(picked[r.enrolment])} onChange={(e) => setPicked({ ...picked, [r.enrolment]: e.target.checked })} /></td>
                  <td className="p-2"><p className="font-semibold">{r.name}</p><p className="font-mono text-xs text-muted-foreground">{r.matricule}</p></td>
                  <td className="p-2">{r.programme_name}</td>
                  <td className="p-2">{r.level_label}{r.is_final ? ` · ${tr("final", "dernier")}` : ""}</td>
                  <td className="p-2">{r.credits_earned}/{r.credits_attempted}{r.gpa ? ` · GPA ${r.gpa}` : r.average ? ` · ${r.average}/20` : ""}</td>
                  <td className="p-2">{r.credits_total}{r.credits_required ? ` / ${r.credits_required}` : ""}</td>
                  <td className="p-2"><span className={`rounded-full px-3 py-1 text-xs font-bold ${STATE_TEXT[r.state][2]}`}>{tr(STATE_TEXT[r.state][0], STATE_TEXT[r.state][1])}</span></td>
                </tr>
              ))}
              {list.length === 0 ? <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">{tr("No students match.", "Aucun étudiant.")}</td></tr> : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
