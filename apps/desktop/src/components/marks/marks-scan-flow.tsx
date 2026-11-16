"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Camera, CheckCircle2, FileSpreadsheet, Loader2, Printer, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { downloadBlob } from "@/lib/browser-download";
import { marksheetsService, type SheetKind, type SheetPerson, type SheetReading } from "@/lib/api/services/marksheets.service";

export interface ScanEntry { studentId: string; value: number }

export interface MarksScanProps {
  open: boolean;
  onClose: () => void;
  kind: SheetKind;
  title: string;
  subtitleLines?: string[];
  maxScore: number;
  /** Digits before the decimal point and decimals on the printed sheet (1 and 0 for nursery ratings). */
  intDigits?: number;
  decimals?: number;
  students: SheetPerson[];
  /** Saves the confirmed marks the same way typing them would; resolves to how many could not be saved. */
  onConfirm: (entries: ScanEntry[]) => Promise<number>;
}

type Step = "start" | "fix" | "review";
const message = (e: any, fallback: string) => e?.response?.data?.detail || e?.response?.data?.message || fallback;

/**
 * Fill marks on paper, photograph the sheet (or import Excel/CSV), correct anything unclear, review every student,
 * then confirm. Nothing is kept from the photos; the confirmed marks are saved by the screen that opened this.
 */
export function MarksScanFlow({ open, onClose, kind, title, subtitleLines, maxScore, intDigits, decimals, students, onConfirm }: MarksScanProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("start");
  const [sheetId, setSheetId] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [problems, setProblems] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, SheetReading>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [paste, setPaste] = useState("");
  const [absent, setAbsent] = useState<Set<string>>(new Set());
  const [pagesInfo, setPagesInfo] = useState("");
  const photoRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setStep("start"); setSheetId(""); setRows({}); setValues({}); setError(""); setProblems([]); setPaste(""); setPagesInfo(""); setAbsent(new Set());
  }, [open]);

  const ensureSheet = async () => {
    if (sheetId) return sheetId;
    const created = await marksheetsService.create({
      kind, title, subtitle_lines: subtitleLines, max_score: maxScore, int_digits: intDigits, decimals,
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
    setRows((cur) => {
      const next = { ...cur };
      for (const r of list) next[r.student_id] = r;
      return next;
    });
    setValues((cur) => {
      const next = { ...cur };
      for (const r of list) if (r.value !== null && r.value !== undefined && (r.status === "ok" || r.status === "uncertain")) next[r.student_id] = r.value;
      return next;
    });
  };

  const afterReading = (all: SheetReading[]) => {
    setStep(all.some((r) => r.status === "uncertain") ? "fix" : "review");
  };

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
      afterReading(Object.values({ ...rows, ...Object.fromEntries(result.rows.map((r) => [r.student_id, r])) }));
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
      afterReading(result.rows);
    } catch (e) { setError(message(e, "This could not be read. Use an Excel or CSV file, or paste the marks.")); }
    setBusy("");
  };

  const list = useMemo(() => students.map((s) => rows[s.id] || null), [students, rows]);
  const uncertain = useMemo(() => Object.values(rows).filter((r) => r.status === "uncertain"), [rows]);
  const valid = (v: string | undefined) => v !== undefined && v !== "" && Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= maxScore;
  const unresolved = uncertain.filter((r) => !valid(values[r.student_id]) && !absent.has(r.student_id));

  const entries: ScanEntry[] = students
    .filter((s) => valid(values[s.id]) && !absent.has(s.id))
    .map((s) => ({ studentId: s.id, value: Number(values[s.id]) }));
  const invalid = students.filter((s) => values[s.id] !== undefined && values[s.id] !== "" && !valid(values[s.id]));

  const confirm = async () => {
    setBusy("save");
    try {
      const failed = await onConfirm(entries);
      if (failed > 0) {
        toast({ title: `${failed} mark${failed === 1 ? "" : "s"} could not be saved`, description: "The others are saved. Check the marks and try again.", variant: "destructive" });
      } else {
        toast({ title: "Marks saved", description: `${entries.length} marks were saved. You can still change any mark if you made a mistake.` });
        onClose();
      }
    } catch (e: any) {
      toast({ title: "Marks not saved", description: e?.message || "Try again.", variant: "destructive" });
    }
    setBusy("");
  };

  const unit = kind === "rating" ? "level" : "mark";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Fill {unit}s from paper or Excel</DialogTitle>
          <DialogDescription>{title}{subtitleLines?.length ? ` · ${subtitleLines.join(" · ")}` : ""}</DialogDescription>
        </DialogHeader>

        {error && <p role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
        {problems.length > 0 && (
          <ul className="space-y-1 rounded-lg bg-amber-50 p-3 text-xs font-semibold text-amber-800">{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
        )}

        {step === "start" && (
          <div className="space-y-5">
            <section className="rounded-xl border p-4">
              <h3 className="text-sm font-black">1. Print the sheet</h3>
              <p className="mt-1 text-xs text-muted-foreground">It lists your {students.length} students and remembers this class and subject. Write one digit in each box. Tick ABS for an absent student.</p>
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
              <p className="mt-1 text-xs text-muted-foreground">Upload an Excel or CSV file, or paste two columns (matricule or name, then mark).</p>
              <div className="mt-3 flex flex-wrap items-start gap-2">
                <Button variant="outline" disabled={!!busy} onClick={() => fileRef.current?.click()}>Choose a file</Button>
                <input ref={fileRef} type="file" accept=".xlsx,.csv,.tsv,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importMarks({ file: f }); e.target.value = ""; }} />
              </div>
              <Textarea className="mt-3 min-h-[90px] text-xs" placeholder={"Paste here, for example:\nM123\t14.5\nNgwa Mary\t09"} value={paste} onChange={(e) => setPaste(e.target.value)} />
              <Button className="mt-2" variant="secondary" disabled={!!busy || !paste.trim()} onClick={() => importMarks({ text: paste })}>Use pasted marks</Button>
            </section>
          </div>
        )}

        {step === "fix" && (
          <div className="space-y-4">
            <p className="text-sm font-semibold">{unresolved.length ? `Please confirm ${uncertain.length} ${unit}${uncertain.length === 1 ? "" : "s"} the system was not sure about.` : "All unclear marks are confirmed."} {pagesInfo}</p>
            {uncertain.map((r) => (
              <div key={r.student_id} className="flex flex-wrap items-center gap-3 rounded-xl border p-3">
                <div className="min-w-[140px] flex-1">
                  <p className="text-sm font-black">{r.name}</p>
                  <p className="text-xs text-muted-foreground">{reasonText(r, maxScore)}</p>
                </div>
                {r.crop ? <img src={r.crop} alt={`Handwriting of ${r.name}`} className="h-14 rounded border bg-white" /> : null}
                {kind !== "rating" && (
                  <Button size="sm" variant={absent.has(r.student_id) ? "default" : "outline"} onClick={() => setAbsent((cur) => { const n = new Set(cur); if (n.has(r.student_id)) n.delete(r.student_id); else n.add(r.student_id); return n; })}>Absent</Button>
                )}
                <input
                  aria-label={`Correct ${unit} for ${r.name}`} inputMode="decimal"
                  className={`h-11 w-24 rounded-lg border px-2 text-center text-lg font-black ${valid(values[r.student_id]) ? "border-green-500" : "border-amber-500"}`}
                  value={values[r.student_id] ?? ""} onChange={(e) => setValues((c) => ({ ...c, [r.student_id]: e.target.value.replace(",", ".") }))}
                />
              </div>
            ))}
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
                <thead className="sticky top-0 bg-muted text-xs uppercase"><tr><th className="p-2 text-left">#</th><th className="p-2 text-left">Student</th><th className="p-2 text-right">{kind === "rating" ? "Level" : `Mark /${maxScore}`}</th></tr></thead>
                <tbody>
                  {students.map((s, i) => {
                    const r = list[i];
                    const v = values[s.id] ?? "";
                    const bad = v !== "" && !valid(v);
                    return (
                      <tr key={s.id} className="border-t">
                        <td className="p-2 text-muted-foreground">{i + 1}</td>
                        <td className="p-2"><span className="font-bold">{s.name}</span>{s.matricule ? <span className="ml-2 text-xs text-muted-foreground">{s.matricule}</span> : null}</td>
                        <td className="p-2 text-right">
                          <input
                            aria-label={`${unit} for ${s.name}`} inputMode="decimal" value={v}
                            placeholder={r?.status === "absent" ? "Absent" : "—"}
                            onChange={(e) => setValues((c) => ({ ...c, [s.id]: e.target.value.replace(",", ".") }))}
                            className={`h-9 w-20 rounded-md border px-2 text-right font-bold ${bad ? "border-red-500 bg-red-50" : ""}`}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">{entries.length} of {students.length} students have a {unit}. Empty boxes and absent students are left as they are.{invalid.length ? ` ${invalid.length} box(es) are outside 0–${maxScore}: fix them to continue.` : ""}</p>
            <div className="flex flex-wrap justify-between gap-2">
              <Button variant="outline" onClick={() => setStep("start")}>Add more photos or a file</Button>
              <Button className="gap-2" disabled={!!busy || !entries.length || invalid.length > 0} onClick={confirm}>
                {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Confirm and save {entries.length} {unit}s
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function reasonText(r: SheetReading, max: number) {
  if (r.reason === "above_max") return `Read as ${r.value}, which is above the maximum of ${max}.`;
  if (r.reason === "abs_and_mark") return "A mark is written and ABS is also marked. Which is right?";
  if (r.reason === "not_a_number") return `"${r.text ?? ""}" is not a number.`;
  if (r.reason === "negative") return "A mark cannot be negative.";
  return r.value ? `The system read ${r.value} but is not sure. Type the right one if it is wrong.` : "The writing could not be read. Please type it.";
}
