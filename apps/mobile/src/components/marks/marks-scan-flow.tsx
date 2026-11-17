"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Camera, CheckCircle2, FileSpreadsheet, Loader2, Printer, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { downloadBlob } from "@/lib/browser-download";
import { marksheetsService, type SheetCell, type SheetColumn, type SheetKind, type SheetPerson, type SheetReading } from "@/lib/api/services/marksheets.service";

/** The confirmed marks of one student: only the columns that have a mark (an empty box is left as it is). */
export interface ScanEntry { studentId: string; values: Record<string, number> }

export interface MarksScanProps {
  open: boolean;
  onClose: () => void;
  kind: SheetKind;
  title: string;
  subtitleLines?: string[];
  /** One box per column on the printed sheet: for example CA and Exam, or a single Mark. */
  columns: SheetColumn[];
  students: SheetPerson[];
  /** Saves the confirmed marks the same way typing them would; resolves to how many could not be saved. */
  onConfirm: (entries: ScanEntry[]) => Promise<number>;
}

type Step = "start" | "fix" | "review";
const message = (e: any, fallback: string) => e?.response?.data?.detail || e?.response?.data?.message || fallback;
const cellKey = (studentId: string, key: string) => `${studentId}|${key}`;
const clean = (raw: string) => raw.replace(",", ".");

/**
 * Fill marks on paper like a normal register, photograph the sheet (or import Excel/CSV), correct anything unclear,
 * review every student, then confirm. Nothing is kept from the photos; the confirmed marks are saved by the screen
 * that opened this.
 */
export function MarksScanFlow({ open, onClose, kind, title, subtitleLines, columns, students, onConfirm }: MarksScanProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("start");
  const [sheetId, setSheetId] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [problems, setProblems] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, SheetReading>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [absent, setAbsent] = useState<Set<string>>(new Set());
  const [paste, setPaste] = useState("");
  const [pagesInfo, setPagesInfo] = useState("");
  const photoRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const columnKey = columns.map((c) => `${c.key}:${c.max}`).join(",");

  useEffect(() => {
    if (!open) return;
    setStep("start"); setSheetId(""); setRows({}); setValues({}); setError(""); setProblems([]); setPaste(""); setPagesInfo(""); setAbsent(new Set());
  }, [open]);
  // A different subject or column choice is a different sheet.
  useEffect(() => { setSheetId(""); }, [columnKey, title]);

  const maxOf = (key: string) => columns.find((c) => c.key === key)?.max ?? 0;
  const labelOf = (key: string) => columns.find((c) => c.key === key)?.label ?? key;
  const valid = (key: string, v: string | undefined) => v !== undefined && v !== "" && Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= maxOf(key);

  const ensureSheet = async () => {
    if (sheetId) return sheetId;
    const created = await marksheetsService.create({
      kind, title, subtitle_lines: subtitleLines,
      columns: columns.map((c) => ({ key: c.key, label: c.label, max_score: c.max })),
      student_ids: students.map((s) => s.id),
    });
    setSheetId(created.id);
    return created.id;
  };

  const printSheet = async () => {
    setBusy("print"); setError("");
    try {
      const id = await ensureSheet();
      downloadBlob(await marksheetsService.pdf(id), `mark-sheet-${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`);
    } catch (e) { setError(message(e, "The sheet could not be made. Check your connection and try again.")); }
    setBusy("");
  };

  const take = (list: SheetReading[]) => {
    setRows((cur) => { const next = { ...cur }; for (const r of list) next[r.student_id] = r; return next; });
    setValues((cur) => {
      const next = { ...cur };
      for (const r of list) for (const c of r.cells) if (c.value !== null && c.value !== undefined && (c.status === "ok" || c.status === "uncertain")) next[cellKey(r.student_id, c.key)] = c.value;
      return next;
    });
    setAbsent((cur) => { const next = new Set(cur); for (const r of list) if (r.absent) next.add(r.student_id); return next; });
  };

  const hasUncertain = (all: SheetReading[]) => all.some((r) => r.cells.some((c) => c.status === "uncertain"));

  const addPhotos = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setBusy("read"); setError("");
    try {
      const id = await ensureSheet();
      const result = await marksheetsService.read(id, Array.from(files));
      setProblems((result.problems || []).map((p) => `${p.file}: ${p.detail}`));
      if (!result.rows.length) { setError("No marks could be read. Check the photos are of the printed sheet, flat and well lit, then try again."); setBusy(""); return; }
      take(result.rows);
      setPagesInfo(`Pages read: ${(result.pages_read || []).join(", ")} of ${result.pages_total}.`);
      setStep(hasUncertain([...Object.values(rows), ...result.rows]) ? "fix" : "review");
    } catch (e) { setError(message(e, "The photos could not be read. Check your connection and try again.")); }
    setBusy("");
  };

  const importMarks = async (input: { file?: File; text?: string }) => {
    setBusy("import"); setError("");
    try {
      const id = await ensureSheet();
      const result = await marksheetsService.importFile(id, input);
      take(result.rows);
      setProblems((result.unmatched || []).map((u) => `Not matched to any student: ${u.line}`));
      setPagesInfo(`${result.matched ?? 0} students matched.`);
      setStep(hasUncertain(result.rows) ? "fix" : "review");
    } catch (e) { setError(message(e, "This could not be read. Use an Excel or CSV file, or paste the marks.")); }
    setBusy("");
  };

  // Every box the system was not sure about, with the handwriting, until the teacher has typed or confirmed a mark.
  const uncertain = useMemo(() => {
    const out: Array<{ row: SheetReading; cell: SheetCell }> = [];
    for (const r of Object.values(rows)) for (const c of r.cells) if (c.status === "uncertain") out.push({ row: r, cell: c });
    return out;
  }, [rows]);
  const unresolved = uncertain.filter(({ row, cell }) => !valid(cell.key, values[cellKey(row.student_id, cell.key)]) && !absent.has(row.student_id));

  const entries: ScanEntry[] = students.flatMap((s) => {
    if (absent.has(s.id)) return [];
    const v: Record<string, number> = {};
    for (const c of columns) if (valid(c.key, values[cellKey(s.id, c.key)])) v[c.key] = Number(values[cellKey(s.id, c.key)]);
    return Object.keys(v).length ? [{ studentId: s.id, values: v }] : [];
  });
  const marksCount = entries.reduce((n, e) => n + Object.keys(e.values).length, 0);
  const invalidCount = students.reduce((n, s) => n + columns.filter((c) => { const v = values[cellKey(s.id, c.key)]; return v !== undefined && v !== "" && !valid(c.key, v); }).length, 0);

  const confirm = async () => {
    setBusy("save");
    try {
      const failed = await onConfirm(entries);
      if (failed > 0) toast({ title: `${failed} mark${failed === 1 ? "" : "s"} could not be saved`, description: "The others are saved. Check the marks and try again.", variant: "destructive" });
      else { toast({ title: "Marks saved", description: `${marksCount} marks were saved. You can still change any mark if you made a mistake.` }); onClose(); }
    } catch (e: any) {
      toast({ title: "Marks not saved", description: e?.message || "Try again.", variant: "destructive" });
    }
    setBusy("");
  };

  const unit = kind === "rating" ? "level" : "mark";
  const setValue = (studentId: string, key: string, raw: string) => setValues((c) => ({ ...c, [cellKey(studentId, key)]: clean(raw) }));
  const toggleAbsent = (id: string) => setAbsent((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const columnsText = columns.map((c) => `${c.label} /${c.max}`).join(" and ");

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Fill {unit}s from paper or Excel</DialogTitle>
          <DialogDescription>{title}{subtitleLines?.length ? ` · ${subtitleLines.join(" · ")}` : ""}</DialogDescription>
        </DialogHeader>

        {error && <p role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
        {problems.length > 0 && <ul className="space-y-1 rounded-lg bg-amber-50 p-3 text-xs font-semibold text-amber-800">{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>}

        {step === "start" && (
          <div className="space-y-5">
            <section className="rounded-xl border p-4">
              <h3 className="text-sm font-black">1. Print the sheet</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                A normal mark sheet with your {students.length} students and a box for {columnsText}. Write each {unit} in its box the way you normally write it, for example 14.5. Tick ABS for an absent student.
              </p>
              <Button className="mt-3 gap-2" onClick={printSheet} disabled={!!busy || !students.length}>
                {busy === "print" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />} Download the sheet (PDF)
              </Button>
            </section>
            <section className="rounded-xl border p-4">
              <h3 className="text-sm font-black">2. Take photos of the filled sheet</h3>
              <p className="mt-1 text-xs text-muted-foreground">Lay it flat in good light and keep all four black corner squares in the photo. A sheet with several pages needs one photo per page; add them together or one after another.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="outline" className="gap-2" disabled={!!busy} onClick={() => cameraRef.current?.click()}><Camera className="h-4 w-4" /> Take a photo</Button>
                <Button variant="outline" className="gap-2" disabled={!!busy} onClick={() => photoRef.current?.click()}><Upload className="h-4 w-4" /> Choose photos</Button>
                {busy === "read" && <span className="flex items-center gap-2 text-sm font-semibold"><Loader2 className="h-4 w-4 animate-spin" /> Reading the sheet…</span>}
              </div>
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { void addPhotos(e.target.files); e.target.value = ""; }} />
              <input ref={photoRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { void addPhotos(e.target.files); e.target.value = ""; }} />
            </section>
            <section className="rounded-xl border p-4">
              <h3 className="flex items-center gap-2 text-sm font-black"><FileSpreadsheet className="h-4 w-4" /> Or import from Excel</h3>
              <p className="mt-1 text-xs text-muted-foreground">Upload an Excel or CSV file, or paste the marks: matricule or name, then {columns.length > 1 ? columns.map((c) => c.label).join(", then ") : `the ${unit}`}.</p>
              <div className="mt-3 flex flex-wrap items-start gap-2">
                <Button variant="outline" disabled={!!busy} onClick={() => fileRef.current?.click()}>Choose a file</Button>
                <input ref={fileRef} type="file" accept=".xlsx,.csv,.tsv,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importMarks({ file: f }); e.target.value = ""; }} />
              </div>
              <Textarea className="mt-3 min-h-[90px] text-xs" placeholder={`Paste here, for example:\nM123\t${columns.map((c) => Math.max(1, Math.round(c.max / 2))).join("\t")}`} value={paste} onChange={(e) => setPaste(e.target.value)} />
              <Button className="mt-2" variant="secondary" disabled={!!busy || !paste.trim()} onClick={() => importMarks({ text: paste })}>Use pasted marks</Button>
            </section>
          </div>
        )}

        {step === "fix" && (
          <div className="space-y-4">
            <p className="text-sm font-semibold">{unresolved.length ? `Please confirm ${uncertain.length} ${unit}${uncertain.length === 1 ? "" : "s"} the system was not sure about.` : "All unclear marks are confirmed."} {pagesInfo}</p>
            {uncertain.map(({ row, cell }) => {
              const k = cellKey(row.student_id, cell.key);
              return (
                <div key={k} className="flex flex-wrap items-center gap-3 rounded-xl border p-3">
                  <div className="min-w-[140px] flex-1">
                    <p className="text-sm font-black">{row.name}{columns.length > 1 ? ` · ${labelOf(cell.key)} /${maxOf(cell.key)}` : ""}</p>
                    <p className="text-xs text-muted-foreground">{reasonText(cell, maxOf(cell.key))}</p>
                  </div>
                  {cell.crop ? <img src={cell.crop} alt={`Handwriting of ${row.name}`} className="h-14 max-w-[220px] rounded border bg-white object-contain" /> : null}
                  {kind !== "rating" && (
                    <Button size="sm" variant={absent.has(row.student_id) ? "default" : "outline"} onClick={() => toggleAbsent(row.student_id)}>Absent</Button>
                  )}
                  <input
                    aria-label={`Correct ${labelOf(cell.key)} for ${row.name}`} inputMode="decimal"
                    className={`h-11 w-24 rounded-lg border px-2 text-center text-lg font-black ${valid(cell.key, values[k]) ? "border-green-500" : "border-amber-500"}`}
                    value={values[k] ?? ""} onChange={(e) => setValue(row.student_id, cell.key, e.target.value)}
                  />
                </div>
              );
            })}
            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => setStep("start")}>Add more photos</Button>
              <Button onClick={() => setStep("review")} disabled={unresolved.length > 0}>Continue to review</Button>
            </div>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-3">
            <p className="text-sm font-semibold">Check every {unit}. Change any box that is wrong, then confirm. {pagesInfo}</p>
            <div className="max-h-[50vh] overflow-y-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted text-xs uppercase">
                  <tr>
                    <th className="p-2 text-left">#</th><th className="p-2 text-left">Student</th>
                    {columns.map((c) => <th key={c.key} className="p-2 text-right">{kind === "rating" ? "Level" : `${c.label} /${c.max}`}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {students.map((s, i) => (
                    <tr key={s.id} className="border-t">
                      <td className="p-2 text-muted-foreground">{i + 1}</td>
                      <td className="p-2"><span className="font-bold">{s.name}</span>{s.matricule ? <span className="ml-2 text-xs text-muted-foreground">{s.matricule}</span> : null}{absent.has(s.id) ? <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase">Absent</span> : null}</td>
                      {columns.map((c) => {
                        const v = values[cellKey(s.id, c.key)] ?? "";
                        const bad = v !== "" && !valid(c.key, v);
                        return (
                          <td key={c.key} className="p-2 text-right">
                            <input
                              aria-label={`${c.label} for ${s.name}`} inputMode="decimal" value={v} placeholder={absent.has(s.id) ? "Absent" : "—"}
                              onChange={(e) => setValue(s.id, c.key, e.target.value)}
                              className={`h-9 w-20 rounded-md border px-2 text-right font-bold ${bad ? "border-red-500 bg-red-50" : ""}`}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">{entries.length} of {students.length} students have a {unit}. Empty boxes and absent students are left as they are.{invalidCount ? ` ${invalidCount} box(es) are above the maximum: fix them to continue.` : ""}</p>
            <div className="flex flex-wrap justify-between gap-2">
              <Button variant="outline" onClick={() => setStep("start")}>Add more photos or a file</Button>
              <Button className="gap-2" disabled={!!busy || !entries.length || invalidCount > 0} onClick={confirm}>
                {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Confirm and save {marksCount} {unit}{marksCount === 1 ? "" : "s"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function reasonText(c: SheetCell, max: number) {
  if (c.reason === "above_max") return `Read as ${c.value}, which is above the maximum of ${max}.`;
  if (c.reason === "abs_and_mark") return "A mark is written and ABS is also ticked. Which is right?";
  if (c.reason === "not_a_number") return `"${c.text ?? ""}" is not a number.`;
  if (c.reason === "negative") return "A mark cannot be negative.";
  if (c.reason === "unreadable") return "The writing could not be read as a number. Please type it.";
  return c.value ? `The system read ${c.value} but is not sure. Type the right one if it is wrong.` : "The writing could not be read. Please type it.";
}
