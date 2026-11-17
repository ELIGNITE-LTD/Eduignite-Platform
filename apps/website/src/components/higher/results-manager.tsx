"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useHigherResultOfferings } from "@/lib/hooks/useHigherEd";
import { higherEdResultsService as api, type HigherResultOffering, type HigherRoster } from "@/lib/api/services/higher-ed.service";
import { downloadCsv, HigherTable, StatusBadge } from "./higher-table";
import { MarkInput } from "@/components/marks/mark-input";
import { useAutoSave } from "@/lib/hooks/useAutoSave";
import { higherEdErrorMessage } from "@/lib/api/services/higher-ed.service";
import { generateBrandedTablePdf } from "@/lib/pdf-branded";
import { FileSpreadsheet, FileText, ScanLine } from "lucide-react";
import { MarksScanFlow, type ScanEntry } from "@/components/marks/marks-scan-flow";
import { HigherPageHeader, LoadFailed, Loading, useHigherRunner, useHigherText } from "./higher-shared";

type Entry = { ca: string; exam: string };

function Roster({ offeringId, onChanged }: { offeringId: string; onChanged: () => void }) {
  const tr = useHigherText();
  const { user } = useAuth();
  const { run, busy } = useHigherRunner();
  const { toast } = useToast();
  const isAdmin = user?.role === "SCHOOL_ADMIN" || user?.role === "SUB_ADMIN";
  const [roster, setRoster] = useState<HigherRoster | null>(null);
  const [failed, setFailed] = useState(false);
  const [entries, setEntries] = useState<Record<string, Entry>>({});

  const [scanOpen, setScanOpen] = useState(false);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

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

  // A score is saved by itself a moment after it is typed. There is no draft and no Save button; typing a different
  // number later simply corrects it (even after the administration has published the result).
  const autoSave = useAutoSave(async (key) => {
    const student = key.split("|")[0];
    const cur = entriesRef.current[student] ?? { ca: "", exam: "" };
    try {
      const next = await api.save(offeringId, [{ student, ca_score: cur.ca || null, exam_score: cur.exam || null }]);
      setRoster(next);
      onChanged();
    } catch (error) {
      throw new Error(higherEdErrorMessage(error, tr("Could not save this score.", "Cette note n'a pas pu être enregistrée.")));
    }
  });
  const typeScore = (student: string, field: "ca" | "exam", value: string) => {
    setEntries((e) => ({ ...e, [student]: { ...(e[student] ?? { ca: "", exam: "" }), [field]: value } }));
    entriesRef.current = { ...entriesRef.current, [student]: { ...(entriesRef.current[student] ?? { ca: "", exam: "" }), [field]: value } };
    autoSave.change(`${student}|${field}`, value);
  };

  /** Saves scores confirmed from a scanned sheet or Excel file for one column; the other column is kept as it is. */
  const saveScanned = async (list: ScanEntry[]) => {
    try {
      const next = await api.save(offeringId, list.map((e) => {
        const cur = entriesRef.current[e.studentId] ?? { ca: "", exam: "" };
        // A column that was left empty on the sheet keeps the score already saved.
        return {
          student: e.studentId,
          ca_score: e.values.ca !== undefined ? String(e.values.ca) : cur.ca || null,
          exam_score: e.values.exam !== undefined ? String(e.values.exam) : cur.exam || null,
        };
      }));
      load(next);
      onChanged();
      return 0;
    } catch (error) {
      throw new Error(higherEdErrorMessage(error, tr("The scores could not be saved.", "Les notes n'ont pas pu être enregistrées.")));
    }
  };

  if (failed) return <LoadFailed />;
  if (!roster) return <Loading />;
  if (!roster.scale) {
    return <p className="text-sm text-amber-900">{tr("Choose how results are graded first (Settings, then Grading).", "Choisissez d'abord le mode de notation (Paramètres, puis Notation).")}</p>;
  }

  const published = roster.rows.filter((r) => r.status === "published").length;
  const scaleHint = roster.scale === "gpa_4"
    ? tr(`Continuous assessment /${roster.ca_max} + exam /${roster.exam_max} = /${roster.total_max}. GPA scale (4.0).`, `Contrôle continu /${roster.ca_max} + examen /${roster.exam_max} = /${roster.total_max}. Échelle GPA (4.0).`)
    : tr(`Continuous assessment /${roster.ca_max} + exam /${roster.exam_max} = /${roster.total_max}. Marks out of 20.`, `Contrôle continu /${roster.ca_max} + session normale /${roster.exam_max} = /${roster.total_max}. Notes sur 20.`);

  const sheetRows = () => roster.rows.map((r, i) => [i + 1, r.matricule, r.name, r.level, r.ca_score ?? "", r.exam_score ?? "", r.total_score ?? "", r.grade || "", r.passed === null ? "" : r.passed ? tr("Pass", "Admis") : tr("Fail", "Ajourné")]);
  const sheetHead = [tr("No", "N°"), "Matricule", tr("Name", "Nom"), tr("Level", "Niveau"), `${tr("CA", "CC")} /${roster.ca_max}`, `${tr("Exam", "Examen")} /${roster.exam_max}`, `Total /${roster.total_max}`, roster.scale === "gpa_4" ? tr("Grade", "Note") : tr("Mention", "Mention"), tr("Result", "Résultat")];
  const sheetName = `marksheet_${roster.course_code}_${roster.period}`.replace(/\s+/g, "_");
  async function sheetPdf() {
    await generateBrandedTablePdf({
      ministry: "higher",
      title: tr("Course Mark Sheet", "Fiche de notes du cours"), school: user?.school as never, schoolName: user?.school?.name || "EduIgnite",
      chips: [{ label: tr("Course", "Cours"), value: `${roster.course_code} ${roster.course_title}` }, { label: tr("Credits", "Crédits"), value: String(roster.credits) }, { label: tr("Semester", "Semestre"), value: roster.period }],
      issuingOffice: tr("Examination Office", "Service des examens"), columns: sheetHead, rows: sheetRows(), fileName: sheetName, landscape: true,
      monoColumns: [1], centerColumns: [4, 5, 6, 7, 8],
    });
  }

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
                return (
                  <tr key={r.student} className="border-t">
                    <td className="p-2"><span className="font-medium">{r.name}</span><span className="block text-xs text-muted-foreground">{r.matricule} · {r.level}</span></td>
                    {(["ca", "exam"] as const).map((field) => (
                      <td key={field} className="p-2">
                        <MarkInput
                          label={`${r.name} ${field === "ca" ? "CA" : "exam"}`} column={`he-${field}`} max={Number((field === "ca" ? roster.ca_max : roster.exam_max) ?? 100)}
                          value={entries[r.student]?.[field] ?? ""} onChange={(v) => typeScore(r.student, field, v)} onFlush={() => autoSave.flush(`${r.student}|${field}`)}
                          state={autoSave.states[`${r.student}|${field}`]} error={autoSave.errors[`${r.student}|${field}`]} onRetry={() => autoSave.retry(`${r.student}|${field}`)}
                        />
                      </td>
                    ))}
                    <td className="p-2">{r.total_score ?? "–"}</td>
                    <td className="p-2">{r.grade || "–"}{r.passed === false ? " ✗" : ""}</td>
                    <td className="p-2 text-xs">{r.status === "none" ? tr("Not entered", "Non saisi") : r.status === "submitted" ? tr("Saved", "Enregistré") : tr("Published", "Publié")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <MarksScanFlow
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        kind="he_result"
        title={`${roster.course_code} ${roster.course_title}`}
        subtitleLines={[roster.period]}
        columns={[{ key: "ca", label: tr("CA", "CC"), max: Number(roster.ca_max ?? 100) }, { key: "exam", label: tr("Exam", "Examen"), max: Number(roster.exam_max ?? 100) }]}
        students={roster.rows.map((r) => ({ id: r.student, name: r.name, matricule: r.matricule }))}
        onConfirm={saveScanned}
      />
      {roster.rows.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={sheetPdf}><FileText className="mr-1.5 h-4 w-4" />{tr("Mark sheet (PDF)", "Fiche de notes (PDF)")}</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => downloadCsv(sheetName, sheetHead, sheetRows() as Array<Array<string | number>>)}><FileSpreadsheet className="mr-1.5 h-4 w-4" />Excel</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setScanOpen(true)}><ScanLine className="mr-1.5 h-4 w-4" />{tr("Scan or import scores", "Scanner ou importer les notes")}</Button>
          <Button type="button" disabled={autoSave.busy} onClick={async () => {
            const failed = await autoSave.flushAll();
            toast({ variant: failed ? "destructive" : undefined, title: failed ? tr("Some scores are not saved", "Certaines notes ne sont pas enregistrées") : tr("All scores are saved", "Toutes les notes sont enregistrées"),
              description: failed ? tr("Tap the red mark next to each one to try again.", "Touchez le repère rouge à côté de chacune pour réessayer.") : tr("You can still correct any score if you made a mistake.", "Vous pouvez encore corriger une note en cas d'erreur.") });
          }}>{tr("Save scores", "Enregistrer les notes")}</Button>
          <p className="basis-full text-xs text-muted-foreground">{tr("Scores also save by themselves as you type. You can correct any score at any time.", "Les notes s'enregistrent aussi toutes seules pendant la saisie. Vous pouvez corriger une note à tout moment.")}</p>
          {isAdmin ? (
            <>
              <Button type="button" variant="secondary" disabled={busy} onClick={() => act(() => api.publish(offeringId), tr("Results published to students.", "Résultats publiés aux étudiants."))}>{tr("Publish to students", "Publier aux étudiants")}</Button>
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
    else if (o.submitted) parts.push(tr(`${o.submitted} saved`, `${o.submitted} enregistrés`));
    return parts.join(" · ");
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
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
            <HigherTable<HigherResultOffering>
              rows={list}
              rowKey={(o) => o.id}
              label={tr("courses", "cours")}
              searchPlaceholder={tr("Search course", "Rechercher un cours")}
              empty={tr("No course matches.", "Aucun cours ne correspond.")}
              exportConfig={{ title: tr("Results Progress by Course", "Avancement des résultats par cours"), fileName: "results_progress", issuingOffice: tr("Examination Office", "Service des examens") }}
              rowClassName={(o) => (o.id === openId ? "bg-primary/5" : undefined)}
              columns={[
                { key: "code", header: "Code", value: (o) => o.course_code, mono: true },
                { key: "title", header: tr("Course", "Cours"), value: (o) => o.course_title, render: (o) => <span className="font-medium">{o.course_title}</span> },
                { key: "period", header: tr("Semester", "Semestre"), value: (o) => `${o.period_name} ${o.academic_year}` },
                { key: "credits", header: tr("Credits", "Crédits"), value: (o) => o.credits, align: "center" },
                { key: "enrolled", header: tr("Students", "Étudiants"), value: (o) => o.enrolled, align: "center" },
                { key: "submitted", header: tr("Saved", "Enregistrés"), value: (o) => o.submitted, align: "center" },
                { key: "published", header: tr("Published", "Publiés"), value: (o) => o.published, align: "center" },
                { key: "state", header: tr("Status", "Statut"), value: (o) => (o.published >= o.enrolled && o.enrolled > 0 ? "published" : o.submitted ? "saved" : "open"),
                  render: (o) => o.published >= o.enrolled && o.enrolled > 0 ? <StatusBadge tone="green">{tr("Published", "Publié")}</StatusBadge> : o.submitted ? <StatusBadge tone="blue">{tr("Saved, ready to publish", "Enregistré, prêt à publier")}</StatusBadge> : <StatusBadge tone="slate">{tr("Not started", "Non commencé")}</StatusBadge> },
                { key: "act", header: "", value: () => "", noExport: true, sortable: false, align: "right",
                  render: (o) => <Button type="button" size="sm" variant={o.id === openId ? "secondary" : "outline"} onClick={() => setOpenId(o.id === openId ? "" : o.id)}>{o.id === openId ? tr("Close", "Fermer") : tr("Enter marks", "Saisir les notes")}</Button> },
              ]}
            />
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
