"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Loader2, Table2 } from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { getApiErrorMessage } from "@/lib/api/errors";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { useEducationCategory } from "@/lib/hooks/useEducationCategory";
import { cn } from "@/lib/utils";

type Field = "ca" | "exam";

interface Cell {
  ca: number | null;
  exam: number | null;
  average: number | null;
}
interface GridSubject {
  id: string;
  name: string;
  code: string;
  coefficient: number;
}
interface GridStudent {
  id: string;
  name: string;
  admission_number: string;
  marks: Record<string, Cell>;
  average: number | null;
  rank: number | null;
  grade: string | null;
  passed: boolean | null;
}
interface Grid {
  class: { id: string; name: string };
  term: number;
  max_score: number;
  pass_mark: number;
  show_rank: boolean;
  can_edit: boolean;
  exam_sequence: { id: string; name: string } | null;
  subjects: GridSubject[];
  students: GridStudent[];
  class_average: number | null;
}
interface ClassOption {
  id: string;
  name: string;
}

type CellState = "saving" | "saved" | "error";

const key = (student: string, subject: string, field: Field) => `${student}|${subject}|${field}`;
const show = (value: number | null | undefined) => (value === null || value === undefined ? "" : String(value));

/** One screen for the class teacher: every subject, every pupil, CA + Exam, autosaved. */
export default function ClassMarksPage() {
  const { user } = useAuth();
  const { language } = useI18n();
  const tr = useCallback((en: string, fr: string) => (language === "fr" ? fr : en), [language]);
  const isBasic = useEducationCategory() === "basic";
  const isTeacher = user?.role === "TEACHER";

  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [classId, setClassId] = useState("");
  const [term, setTerm] = useState<number | null>(null);
  const [grid, setGrid] = useState<Grid | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  // What the teacher typed but the server has not confirmed yet.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [states, setStates] = useState<Record<string, CellState>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const requestId = useRef(0);
  const tableRef = useRef<HTMLDivElement>(null);

  const load = useCallback(
    async (nextClass: string, nextTerm: number | null) => {
      setLoading(true);
      setLoadError("");
      try {
        const params: Record<string, string | number> = {};
        if (nextClass) params.class_id = nextClass;
        if (nextTerm) params.term = nextTerm;
        const { data } = await apiClient.get("/grades/class-marks/", { params });
        setClasses(data.classes ?? []);
        setGrid(data.grid ?? null);
        if (data.grid) {
          setClassId(data.grid.class.id);
          setTerm(data.grid.term);
        }
        setDrafts({});
        setStates({});
        setErrors({});
      } catch (error) {
        setGrid(null);
        setLoadError(getApiErrorMessage(error));
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (isBasic && isTeacher) void load("", null);
    else setLoading(false);
  }, [isBasic, isTeacher, load]);

  const saveCell = async (student: GridStudent, subject: GridSubject, field: Field, raw: string) => {
    if (!grid) return;
    const k = key(student.id, subject.id, field);
    const text = raw.trim().replace(",", ".");
    const current = student.marks[subject.id]?.[field] ?? null;

    if (text === "") {
      if (current === null) {
        clearDraft(k);
        return;
      }
    } else {
      const value = Number(text);
      if (!Number.isFinite(value)) {
        setErrors((e) => ({ ...e, [k]: tr("Enter a number", "Entrez un nombre") }));
        return;
      }
      if (value < 0 || value > grid.max_score) {
        setErrors((e) => ({
          ...e,
          [k]: tr(`Maximum is ${grid.max_score}`, `Maximum : ${grid.max_score}`),
        }));
        return;
      }
      if (value === current) {
        clearDraft(k);
        return;
      }
    }

    setErrors((e) => {
      const { [k]: _gone, ...rest } = e;
      return rest;
    });
    setStates((s) => ({ ...s, [k]: "saving" }));
    const mine = ++requestId.current;
    try {
      const { data } = await apiClient.post("/grades/class-marks/save/", {
        class_id: grid.class.id,
        term: grid.term,
        entries: [{ student: student.id, subject: subject.id, field, score: text === "" ? null : text }],
      });
      // Only the newest answer refreshes the table, so averages and ranks never jump backwards.
      if (mine === requestId.current) setGrid(data.grid);
      clearDraft(k);
      setStates((s) => ({ ...s, [k]: "saved" }));
      window.setTimeout(() => setStates((s) => (s[k] === "saved" ? omit(s, k) : s)), 2500);
    } catch (error) {
      setStates((s) => ({ ...s, [k]: "error" }));
      setErrors((e) => ({ ...e, [k]: getApiErrorMessage(error) }));
    }
  };

  const clearDraft = (k: string) =>
    setDrafts((d) => {
      const { [k]: _gone, ...rest } = d;
      return rest;
    });

  const move = (input: HTMLInputElement, direction: 1 | -1) => {
    const row = Number(input.dataset.row);
    const col = Number(input.dataset.col);
    const root = tableRef.current;
    if (!root) return;
    const find = (r: number, c: number) =>
      root.querySelector<HTMLInputElement>(`input[data-row="${r}"][data-col="${c}"]`);
    const next = find(row + direction, col) ?? find(direction === 1 ? 0 : 999, col + direction);
    next?.focus();
    next?.select();
  };

  if (!user) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary/30" />
      </div>
    );
  }
  if (!isBasic || !isTeacher) {
    return (
      <p className="mx-auto max-w-3xl p-6 text-sm text-muted-foreground">
        {tr(
          "The class marks table is for class teachers of nursery and primary schools.",
          "Le tableau des notes est réservé aux enseignants titulaires des écoles maternelles et primaires.",
        )}
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 pb-24">
      <div>
        <h1 className="flex items-center gap-3 text-3xl font-bold text-primary font-headline">
          <div className="rounded-xl bg-primary p-2 text-secondary shadow-lg">
            <Table2 className="h-6 w-6" />
          </div>
          {tr("Class marks", "Notes de la classe")}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {tr(
            "Type each mark and move on: it is saved by itself. Marks are out of",
            "Tapez chaque note et passez à la suivante : elle s'enregistre toute seule. Notes sur",
          )}{" "}
          {grid?.max_score ?? 20}. <strong>CA</strong> = {tr("continuous assessment", "contrôle continu")},{" "}
          <strong>{tr("Exam", "Examen")}</strong>.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {classes.length > 1 && (
          <select
            aria-label={tr("Class", "Classe")}
            className="h-11 rounded-lg border bg-background px-3 text-base font-medium"
            value={classId}
            onChange={(e) => void load(e.target.value, term)}
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        {classes.length === 1 && <span className="text-lg font-semibold">{classes[0].name}</span>}
        <div className="inline-flex overflow-hidden rounded-lg border" role="group" aria-label={tr("Term", "Trimestre")}>
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => void load(classId, n)}
              className={cn(
                "h-11 px-5 text-base font-medium transition-colors",
                term === n ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
              )}
            >
              {tr(`Term ${n}`, `Trimestre ${n}`)}
            </button>
          ))}
        </div>
        {loading && <Loader2 className="h-5 w-5 animate-spin text-primary/50" />}
      </div>

      {loadError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          <AlertCircle className="h-4 w-4 shrink-0" /> {loadError}
        </div>
      )}

      {grid && !grid.can_edit && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {tr(
            "This term is not the current term: marks can be viewed but not changed.",
            "Ce trimestre n'est pas le trimestre en cours : les notes sont en lecture seule.",
          )}
        </div>
      )}
      {grid && !grid.exam_sequence && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {tr(
            "This term has only one assessment period, so the Exam column is not available.",
            "Ce trimestre n'a qu'une seule période d'évaluation : la colonne Examen n'est pas disponible.",
          )}
        </div>
      )}

      {grid && grid.subjects.length === 0 && (
        <p className="rounded-lg border p-6 text-center text-muted-foreground">
          {tr(
            "No subject is set up for this class yet. Ask your administrator to add the subjects.",
            "Aucune matière n'est configurée pour cette classe. Demandez à l'administrateur de les ajouter.",
          )}
        </p>
      )}
      {grid && grid.students.length === 0 && (
        <p className="rounded-lg border p-6 text-center text-muted-foreground">
          {tr("There are no pupils in this class yet.", "Il n'y a pas encore d'élèves dans cette classe.")}
        </p>
      )}

      {grid && grid.subjects.length > 0 && grid.students.length > 0 && (
        <div ref={tableRef} className="overflow-x-auto rounded-xl border bg-background shadow-sm">
          <table className="w-max min-w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted/60">
                <th rowSpan={2} className="sticky left-0 z-10 min-w-[190px] bg-muted px-3 py-2 text-left font-semibold">
                  {tr("Pupil", "Élève")}
                </th>
                {grid.subjects.map((s) => (
                  <th key={s.id} colSpan={2} className="border-l px-2 py-2 text-center font-semibold">
                    {s.name}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">×{s.coefficient}</span>
                  </th>
                ))}
                <th rowSpan={2} className="border-l px-3 py-2 text-center font-semibold">
                  {tr("Average", "Moyenne")}
                </th>
                {grid.show_rank && (
                  <th rowSpan={2} className="px-3 py-2 text-center font-semibold">
                    {tr("Rank", "Rang")}
                  </th>
                )}
                <th rowSpan={2} className="px-3 py-2 text-center font-semibold">
                  {tr("Grade", "Mention")}
                </th>
              </tr>
              <tr className="bg-muted/40 text-xs text-muted-foreground">
                {grid.subjects.map((s) => (
                  <FragmentHeads key={s.id} examLabel={tr("Exam", "Examen")} />
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.students.map((student, row) => (
                <tr key={student.id} className="border-t even:bg-muted/20">
                  <td className="sticky left-0 z-10 bg-background px-3 py-1.5 font-medium">
                    {student.name}
                    <div className="text-xs font-normal text-muted-foreground">{student.admission_number}</div>
                  </td>
                  {grid.subjects.map((subject, si) =>
                    (["ca", "exam"] as Field[]).map((field, fi) => {
                      const k = key(student.id, subject.id, field);
                      const disabled = !grid.can_edit || (field === "exam" && !grid.exam_sequence);
                      const value = k in drafts ? drafts[k] : show(student.marks[subject.id]?.[field]);
                      const state = states[k];
                      const error = errors[k];
                      return (
                        <td key={k} className={cn("relative px-1 py-1 text-center", fi === 0 && "border-l")}>
                          <div className="relative inline-block">
                            <input
                              type="text"
                              inputMode="decimal"
                              autoComplete="off"
                              aria-label={`${student.name} – ${subject.name} ${field === "ca" ? "CA" : tr("Exam", "Examen")}`}
                              data-row={row}
                              data-col={si * 2 + fi}
                              disabled={disabled}
                              value={value}
                              onChange={(e) => setDrafts((d) => ({ ...d, [k]: e.target.value }))}
                              onFocus={(e) => e.currentTarget.select()}
                              onBlur={(e) => {
                                if (k in drafts) void saveCell(student, subject, field, e.currentTarget.value);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  move(e.currentTarget, e.shiftKey ? -1 : 1);
                                }
                              }}
                              className={cn(
                                "h-10 w-16 rounded-md border bg-background text-center text-base tabular-nums focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:bg-muted/50",
                                error && "border-red-500 bg-red-50 text-red-800",
                              )}
                            />
                            <span className="pointer-events-none absolute -right-0.5 -top-0.5 h-4 w-4">
                              {state === "saving" && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                              {state === "saved" && <Check className="h-4 w-4 rounded-full bg-emerald-600 p-0.5 text-white" />}
                            </span>
                          </div>
                          {error && (
                            <div role="alert" className="mx-auto max-w-[8rem] text-[11px] leading-tight text-red-700">
                              {error}
                            </div>
                          )}
                        </td>
                      );
                    }),
                  )}
                  <td
                    className={cn(
                      "border-l px-3 py-1.5 text-center font-semibold tabular-nums",
                      student.average !== null && (student.passed ? "text-emerald-700" : "text-red-700"),
                    )}
                  >
                    {show(student.average) || "–"}
                  </td>
                  {grid.show_rank && (
                    <td className="px-3 py-1.5 text-center font-semibold tabular-nums">{show(student.rank) || "–"}</td>
                  )}
                  <td className="px-3 py-1.5 text-center font-semibold">{student.grade ?? "–"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/40">
                <td
                  className="sticky left-0 bg-muted px-3 py-2 text-right font-semibold"
                  colSpan={1 + grid.subjects.length * 2}
                >
                  {tr("Class average", "Moyenne de la classe")}
                </td>
                <td className="px-3 py-2 text-center font-bold tabular-nums">{show(grid.class_average) || "–"}</td>
                <td colSpan={grid.show_rank ? 2 : 1} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {grid && (
        <p className="text-xs text-muted-foreground">
          {tr(
            "Average = marks of each subject weighted by its coefficient (×). Empty boxes are ignored, not counted as zero. Pupils with the same average share the same rank.",
            "Moyenne = notes de chaque matière pondérées par son coefficient (×). Les cases vides sont ignorées, pas comptées comme zéro. Les élèves ayant la même moyenne partagent le même rang.",
          )}
        </p>
      )}
    </div>
  );
}

function FragmentHeads({ examLabel }: { examLabel: string }) {
  return (
    <>
      <th className="border-l px-1 py-1 font-medium">CA</th>
      <th className="px-1 py-1 font-medium">{examLabel}</th>
    </>
  );
}

function omit<T extends Record<string, unknown>>(obj: T, k: string): T {
  const { [k]: _gone, ...rest } = obj;
  return rest as T;
}
