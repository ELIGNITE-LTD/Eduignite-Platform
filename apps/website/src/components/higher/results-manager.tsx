"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import { useHigherResultOfferings } from "@/lib/hooks/useHigherEd";
import { higherEdResultsService as api, type HigherResultOffering, type HigherRoster } from "@/lib/api/services/higher-ed.service";
import { HigherPageHeader, LoadFailed, Loading, useHigherRunner, useHigherText } from "./higher-shared";

type Entry = { ca: string; exam: string };

function Roster({ offeringId, onChanged }: { offeringId: string; onChanged: () => void }) {
  const tr = useHigherText();
  const { user } = useAuth();
  const { run, busy } = useHigherRunner();
  const isAdmin = user?.role === "SCHOOL_ADMIN" || user?.role === "SUB_ADMIN";
  const [roster, setRoster] = useState<HigherRoster | null>(null);
  const [failed, setFailed] = useState(false);
  const [entries, setEntries] = useState<Record<string, Entry>>({});

  function load(next: HigherRoster) {
    setRoster(next);
    setEntries(Object.fromEntries(next.rows.map((r) => [r.student, { ca: r.ca_score ?? "", exam: r.exam_score ?? "" }])));
  }

  useEffect(() => {
    let cancelled = false;
    setRoster(null);
    setFailed(false);
    api.roster(offeringId).then((r) => { if (!cancelled) load(r); }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [offeringId]);

  const dirty = useMemo(() => roster?.rows.some((r) => (entries[r.student]?.ca ?? "") !== (r.ca_score ?? "") || (entries[r.student]?.exam ?? "") !== (r.exam_score ?? "")) ?? false, [roster, entries]);

  if (failed) return <LoadFailed />;
  if (!roster) return <Loading />;
  if (!roster.scale) {
    return <p className="text-sm text-amber-900">{tr("Choose how results are graded first (Settings, then Grading).", "Choisissez d'abord le mode de notation (Paramètres, puis Notation).")}</p>;
  }

  const published = roster.rows.filter((r) => r.status === "published").length;
  const scaleHint = roster.scale === "gpa_4"
    ? tr(`Continuous assessment /${roster.ca_max} + exam /${roster.exam_max} = /${roster.total_max}. GPA scale (4.0).`, `Contrôle continu /${roster.ca_max} + examen /${roster.exam_max} = /${roster.total_max}. Échelle GPA (4.0).`)
    : tr(`Continuous assessment /${roster.ca_max} + exam /${roster.exam_max} = /${roster.total_max}. Marks out of 20.`, `Contrôle continu /${roster.ca_max} + session normale /${roster.exam_max} = /${roster.total_max}. Notes sur 20.`);

  const payload = () => roster.rows.filter((r) => r.status !== "published").map((r) => ({
    student: r.student, ca_score: entries[r.student]?.ca || null, exam_score: entries[r.student]?.exam || null,
  }));

  async function act(fn: () => Promise<HigherRoster>, done: string) {
    let next: HigherRoster | null = null;
    const ok = await run(async () => { next = await fn(); }, done);
    if (ok && next) { load(next); onChanged(); }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{scaleHint}</p>
      {roster.rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {tr("No student takes this course yet. Add the course to a programme level (Course units) and admit students.", "Aucun étudiant ne suit ce cours pour l'instant. Ajoutez le cours à un niveau de programme (Unités d'enseignement) et admettez des étudiants.")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs">
              <tr>
                <th className="p-2">{tr("Student", "Étudiant")}</th>
                <th className="p-2">{tr("CA", "CC")} /{roster.ca_max}</th>
                <th className="p-2">{tr("Exam", "Examen")} /{roster.exam_max}</th>
                <th className="p-2">{tr("Total", "Total")}</th>
                <th className="p-2">{roster.scale === "gpa_4" ? tr("Grade", "Note") : tr("Mention", "Mention")}</th>
                <th className="p-2">{tr("Status", "Statut")}</th>
              </tr>
            </thead>
            <tbody>
              {roster.rows.map((r) => {
                const locked = r.status === "published";
                return (
                  <tr key={r.student} className="border-t">
                    <td className="p-2"><span className="font-medium">{r.name}</span><span className="block text-xs text-muted-foreground">{r.matricule} · {r.level}</span></td>
                    <td className="p-2"><Input type="number" inputMode="decimal" step="0.25" min="0" max={roster.ca_max ?? undefined} className="h-9 w-20" disabled={locked} value={entries[r.student]?.ca ?? ""} onChange={(e) => setEntries({ ...entries, [r.student]: { ...entries[r.student], ca: e.target.value } })} aria-label={`${r.name} CA`} /></td>
                    <td className="p-2"><Input type="number" inputMode="decimal" step="0.25" min="0" max={roster.exam_max ?? undefined} className="h-9 w-20" disabled={locked} value={entries[r.student]?.exam ?? ""} onChange={(e) => setEntries({ ...entries, [r.student]: { ...entries[r.student], exam: e.target.value } })} aria-label={`${r.name} exam`} /></td>
                    <td className="p-2">{r.total_score ?? "–"}</td>
                    <td className="p-2">{r.grade || "–"}{r.passed === false ? " ✗" : ""}</td>
                    <td className="p-2 text-xs">{r.status === "none" ? tr("Not entered", "Non saisi") : r.status === "draft" ? tr("Draft", "Brouillon") : r.status === "submitted" ? tr("Submitted", "Soumis") : tr("Published", "Publié")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {roster.rows.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={busy || !dirty} onClick={() => act(() => api.save(offeringId, payload()), tr("Scores saved.", "Notes enregistrées."))}>{tr("Save scores", "Enregistrer les notes")}</Button>
          <Button type="button" variant="outline" disabled={busy || dirty} onClick={() => act(() => api.submit(offeringId), tr("Sent to the administration.", "Transmis à l'administration."))}>{tr("Submit to the administration", "Transmettre à l'administration")}</Button>
          {isAdmin ? (
            <>
              <Button type="button" variant="secondary" disabled={busy || dirty} onClick={() => act(() => api.publish(offeringId), tr("Results published to students.", "Résultats publiés aux étudiants."))}>{tr("Publish to students", "Publier aux étudiants")}</Button>
              {published > 0 ? <Button type="button" variant="ghost" disabled={busy} onClick={() => act(() => api.unpublish(offeringId), tr("Results unpublished.", "Publication annulée."))}>{tr("Unpublish", "Annuler la publication")}</Button> : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ResultsManager() {
  const tr = useHigherText();
  const offerings = useHigherResultOfferings();
  const [openId, setOpenId] = useState("");
  const list = offerings.data ?? [];
  const open = list.find((o) => o.id === openId) ?? null;

  function chip(o: HigherResultOffering) {
    const parts = [tr(`${o.enrolled} students`, `${o.enrolled} étudiants`)];
    if (o.published) parts.push(tr(`${o.published} published`, `${o.published} publiés`));
    else if (o.submitted) parts.push(tr(`${o.submitted} submitted`, `${o.submitted} soumis`));
    else if (o.draft) parts.push(tr(`${o.draft} draft`, `${o.draft} brouillons`));
    return parts.join(" · ");
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <HigherPageHeader
        title={tr("Results", "Résultats")}
        help={tr("Enter continuous assessment and exam marks for your courses. The administration publishes them to students.",
          "Saisissez les notes de contrôle continu et d'examen de vos cours. L'administration les publie aux étudiants.")}
      />
      <Card className="rounded-3xl border-none shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">{tr("Courses", "Cours")}</CardTitle>
          <CardDescription>{tr("Choose a course to enter or review marks.", "Choisissez un cours pour saisir ou revoir les notes.")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {offerings.isLoading ? <Loading /> : offerings.isError ? <LoadFailed /> : list.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              {tr("No courses to mark yet. Open a course for a semester under Lecturers, and assign its lecturer.", "Aucun cours à noter pour l'instant. Ouvrez un cours pour un semestre sous Enseignants et attribuez son enseignant.")}
            </p>
          ) : (
            <ul className="space-y-2">
              {list.map((o) => (
                <li key={o.id}>
                  <button type="button" onClick={() => setOpenId(o.id === openId ? "" : o.id)} className={`flex w-full items-center justify-between gap-3 rounded-2xl bg-muted/40 p-3 text-left hover:bg-muted/50 ${o.id === openId ? "border-primary" : ""}`}>
                    <span className="min-w-0"><span className="block text-sm font-semibold">{o.course_code} · {o.course_title}</span><span className="block text-xs text-muted-foreground">{o.period_name} · {o.academic_year} · {o.credits} {tr("credits", "crédits")}</span></span>
                    <span className="shrink-0 text-xs text-muted-foreground">{chip(o)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {open ? (
        <Card className="rounded-3xl border-none shadow-sm">
          <CardHeader><CardTitle className="text-base">{open.course_code} · {open.course_title}</CardTitle><CardDescription>{open.period_name} · {open.academic_year}</CardDescription></CardHeader>
          <CardContent><Roster offeringId={open.id} onChanged={() => offerings.refetch()} /></CardContent>
        </Card>
      ) : null}
    </div>
  );
}
