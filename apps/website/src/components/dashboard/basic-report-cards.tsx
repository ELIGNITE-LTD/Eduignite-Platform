"use client";

import { schoolAdminLabel } from "@/lib/role-labels";
import { useEffect, useMemo, useState } from "react";
import { Download, Eye, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { getApiErrorMessage } from "@/lib/api/errors";
import { gradesService } from "@/lib/api/services/grades.service";
import { buildCameroonReportCardHtml } from "@/lib/cameroon-report-card";
import { downloadReportCardsPdf } from "@/lib/browser-download";
import { pupilName } from "@/lib/pupil-name";
import { useMyClasses } from "@/lib/hooks/useClassTeachers";
import { useHierarchyClasses, useSchoolSettings } from "@/lib/hooks/useSchools";
import { useAllStudents, useMyChildren } from "@/lib/hooks/useStudents";
import { useActiveSequence } from "@/lib/hooks/useGrades";

const TERM_FROM_SETTING: Record<string, number> = { First: 1, Second: 2, Third: 3 };
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-");

/** Term (1-3) and academic year to open by default: school settings, then the active sequence. */
function useReportPeriod(readSettings: boolean) {
  const { user } = useAuth();
  const schoolId = typeof user?.school?.id === "string" ? user.school.id : "";
  const { data: settings } = useSchoolSettings(readSettings ? schoolId : "");
  const { data: active } = useActiveSequence();
  const seq: any = active?.results?.[0];
  const academicYear: string = settings?.academic_year || seq?.academic_year || "";
  const defaultTerm: number = TERM_FROM_SETTING[settings?.term ?? ""] || Number(seq?.term) || 1;
  return { academicYear, defaultTerm };
}

function TermPicker({ term, onChange }: { term: number; onChange: (t: number) => void }) {
  const { language } = useI18n();
  const en = language === "en";
  return (
    <div className="flex flex-wrap items-center gap-2">
      {[1, 2, 3].map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          className={`h-11 rounded-full border px-5 text-sm font-semibold transition ${t === term ? "border-primary bg-primary text-white" : "border-primary/20 bg-white text-primary hover:bg-primary/5"}`}
        >
          {en ? `Term ${t}` : `Trimestre ${t}`}
        </button>
      ))}
    </div>
  );
}

interface Row {
  id: string;
  name: string;
  detail?: string;
}

/** Shared list: one row per pupil with View / PDF, plus optional whole-class download. */
function CardList({
  rows,
  term,
  academicYear,
  fileBase,
  showClassDownload,
}: {
  rows: Row[];
  term: number;
  academicYear: string;
  fileBase: string;
  showClassDownload: boolean;
}) {
  const { user } = useAuth();
  const { language } = useI18n();
  const en = language === "en";
  const [busy, setBusy] = useState<string>("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ html: string; name: string } | null>(null);

  const load = async (row: Row) => {
    const card = await gradesService.getTermReportCard(row.id, term, academicYear);
    return buildCameroonReportCardHtml(card, { title: en ? "Report Card" : "Bulletin", school: user?.school });
  };

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setBusy("");
    }
  };

  const view = (row: Row) => run(`v${row.id}`, async () => setPreview({ html: await load(row), name: row.name }));
  const pdf = (row: Row) =>
    run(`p${row.id}`, async () => downloadReportCardsPdf([await load(row)], `${slug(row.name)}-term-${term}-report-card`));
  const wholeClass = () =>
    run("all", async () => {
      const htmls: string[] = [];
      let skipped = 0;
      for (const row of rows) {
        try {
          htmls.push(await load(row));
        } catch {
          skipped += 1;
        }
      }
      if (!htmls.length) {
        throw new Error(en ? "No report card could be prepared for this class yet." : "Aucun bulletin n'a pu etre prepare pour cette classe.");
      }
      await downloadReportCardsPdf(htmls, `${slug(fileBase)}-term-${term}-report-cards`);
      if (skipped) {
        setError(en ? `${skipped} pupil(s) were skipped (no report card yet).` : `${skipped} eleve(s) ignores (pas encore de bulletin).`);
      }
    });

  if (!academicYear) {
    return <p className="px-1 text-sm text-muted-foreground">{en ? "No school year is set up yet." : "Aucune annee scolaire n'est configuree."}</p>;
  }

  return (
    <div className="space-y-3">
      {showClassDownload && rows.length > 0 ? (
        <Button onClick={wholeClass} disabled={busy !== ""} className="h-12 rounded-2xl px-6 text-base font-bold">
          {busy === "all" ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Download className="mr-2 h-5 w-5" />}
          {en ? "Download whole class (PDF)" : "Telecharger toute la classe (PDF)"}
        </Button>
      ) : null}
      {error ? <p className="rounded-2xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p> : null}
      {rows.length === 0 ? (
        <Card className="rounded-3xl border-none shadow-sm">
          <CardContent className="p-5 text-sm text-muted-foreground">{en ? "No pupils to show." : "Aucun eleve a afficher."}</CardContent>
        </Card>
      ) : (
        rows.map((row) => (
          <Card key={row.id} className="rounded-3xl border-none shadow-sm">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-primary">{row.name || "-"}</p>
                {row.detail ? <p className="truncate text-sm text-muted-foreground">{row.detail}</p> : null}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="h-11 rounded-2xl" disabled={busy !== ""} onClick={() => view(row)}>
                  {busy === `v${row.id}` ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
                  {en ? "View" : "Voir"}
                </Button>
                <Button className="h-11 rounded-2xl" disabled={busy !== ""} onClick={() => pdf(row)}>
                  {busy === `p${row.id}` ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
                  PDF
                </Button>
              </div>
            </CardContent>
          </Card>
        ))
      )}

      <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{preview?.name}</DialogTitle>
          </DialogHeader>
          {preview ? <div dangerouslySetInnerHTML={{ __html: preview.html }} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Class teachers and admins: pick a class and a term, then view / print each card or the whole class. */
export function StaffReportCards() {
  const { user } = useAuth();
  const { language } = useI18n();
  const en = language === "en";
  const isTeacher = user?.role === "TEACHER";
  const { academicYear, defaultTerm } = useReportPeriod(true);
  const mine = useMyClasses(isTeacher);
  const all = useHierarchyClasses(undefined, !isTeacher);
  const classes: Array<{ id: string; name: string }> = isTeacher
    ? (mine.data?.classes ?? []).map((c: any) => ({ id: c.id, name: c.name }))
    : (all.data ?? []).map((c) => ({ id: c.id, name: c.name }));
  const [classId, setClassId] = useState("");
  const [picked, setPicked] = useState<number | null>(null);
  const term = picked ?? defaultTerm;
  const current = classes.find((c) => c.id === classId) ?? classes[0];
  const students = useAllStudents({ school_class: current?.id } as any, Boolean(current?.id));
  const [search, setSearch] = useState("");

  useEffect(() => setSearch(""), [current?.id]);

  const rows: Row[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (students.data?.results ?? [])
      .map((s: any) => ({ id: s.id as string, name: pupilName(s), detail: s.admission_number || s.display_matricule || "" }))
      .filter((r) => !q || r.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [students.data, search]);

  const loading = isTeacher ? mine.isLoading : all.isLoading;

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-20">
      <header className="rounded-3xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6">
        <h1 className="text-2xl font-black tracking-tight text-primary sm:text-3xl">{en ? "Report cards" : "Bulletins"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {en ? "Choose a class and a term, then view or print the report cards." : "Choisissez une classe et un trimestre, puis consultez ou imprimez les bulletins."}
        </p>
      </header>

      {loading ? (
        <p className="px-1 text-sm text-muted-foreground">{en ? "Loading..." : "Chargement..."}</p>
      ) : classes.length === 0 ? (
        <Card className="rounded-3xl border-none shadow-sm">
          <CardContent className="p-5 text-sm text-muted-foreground">
            {isTeacher
              ? (en ? `You have not been assigned to a class yet. Ask your ${schoolAdminLabel("basic", "en")}.` : `Vous n'avez pas encore de classe. Contactez le ${schoolAdminLabel("basic", "fr")}.`)
              : (en ? "No class has been created yet." : "Aucune classe n'a encore ete creee.")}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {classes.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setClassId(c.id)}
                className={`h-11 rounded-full border px-5 text-sm font-semibold transition ${c.id === current?.id ? "border-primary bg-primary text-white" : "border-primary/20 bg-white text-primary hover:bg-primary/5"}`}
              >
                {c.name}
              </button>
            ))}
          </div>
          <TermPicker term={term} onChange={setPicked} />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={en ? "Search a pupil" : "Chercher un eleve"}
            className="h-11 rounded-2xl"
          />
          {students.isLoading ? (
            <p className="px-1 text-sm text-muted-foreground">{en ? "Loading..." : "Chargement..."}</p>
          ) : (
            <CardList rows={rows} term={term} academicYear={academicYear} fileBase={current?.name ?? "class"} showClassDownload />
          )}
        </>
      )}
    </div>
  );
}

/** Parents: one row per child with the term report card (available once the school publishes it). */
export function ParentReportCards() {
  const { language } = useI18n();
  const en = language === "en";
  const { academicYear, defaultTerm } = useReportPeriod(false);
  const { data, isLoading } = useMyChildren();
  const children = data?.results ?? [];
  const [picked, setPicked] = useState<number | null>(null);
  const term = picked ?? defaultTerm;

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-20">
      <header className="rounded-3xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6">
        <h1 className="text-2xl font-black tracking-tight text-primary sm:text-3xl">{en ? "Report cards" : "Bulletins"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {en ? "A report card appears here once the school has published it." : "Un bulletin apparait ici des que l'ecole l'a publie."}
        </p>
      </header>
      <TermPicker term={term} onChange={setPicked} />
      {isLoading ? (
        <p className="px-1 text-sm text-muted-foreground">{en ? "Loading..." : "Chargement..."}</p>
      ) : (
        <CardList
          rows={children.map((c: any) => ({ id: c.id, name: pupilName(c), detail: c.student_class || c.school_class_name || "" }))}
          term={term}
          academicYear={academicYear}
          fileBase="report-card"
          showClassDownload={false}
        />
      )}
    </div>
  );
}
