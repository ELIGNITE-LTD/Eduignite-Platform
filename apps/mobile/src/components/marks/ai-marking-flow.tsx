"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, Download, FileText, Loader2, Share2, Sparkles, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { downloadBlob } from "@/lib/browser-download";
import {
  aiMarkingService, type MarkQuestion, type MarkedScript, type MarkingApproach, type MarkingChallenge, type MarkingJob,
} from "@/lib/api/services/ai-marking.service";
import type { SheetColumn, SheetPerson } from "@/lib/api/services/marksheets.service";
import type { ScanEntry } from "./marks-scan-flow";

const APPROACHES: Array<{ value: MarkingApproach; label: string; help: string }> = [
  { value: "idea_based", label: "Idea-based marking", help: "A mark for each correct idea, even if the student words it differently." },
  { value: "strict", label: "Strict marking", help: "A mark only when the answer matches the marking scheme exactly." },
  { value: "conceptual", label: "Conceptual understanding", help: "Rewards understanding and reasoning, not memorised wording." },
  { value: "partial_credit", label: "Partial credit", help: "Marks for every correct step, including method when the final answer is wrong." },
  { value: "custom", label: "Other (my own instructions)", help: "Write how the AI should mark." },
];

const err = (e: any, fallback: string) => e?.response?.data?.detail || e?.response?.data?.message || fallback;
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));

export interface AiMarkingProps {
  open: boolean;
  onClose: () => void;
  /** What this marking is for, for example "Mathematics · Form 5 A · Sequence 2". */
  title: string;
  /** Jobs started from the same screen and class are listed together. */
  scopeKey: string;
  /** The register boxes the finished marks can go into (the teacher picks one when there are several). */
  columns: SheetColumn[];
  students: SheetPerson[];
  onConfirm: (entries: ScanEntry[]) => Promise<number>;
}

type Step = "home" | "setup" | "estimate" | "marking" | "review";

/**
 * AI-assisted marking of exam scripts. The teacher gives the marking scheme and approach, uploads the scripts, sees the
 * cost and authorises it; the AI proposes marks and comments; the teacher reviews, adjusts and approves everything
 * before any mark is saved or shared with students.
 */
export function AiMarkingFlow({ open, onClose, title, scopeKey, columns, students, onConfirm }: AiMarkingProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("home");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [jobs, setJobs] = useState<MarkingJob[]>([]);
  const [questions, setQuestions] = useState<MarkingChallenge[]>([]);
  const [job, setJob] = useState<MarkingJob | null>(null);
  // setup form
  const [name, setName] = useState(title);
  const [approach, setApproach] = useState<MarkingApproach>("idea_based");
  const [custom, setCustom] = useState("");
  const [schemeText, setSchemeText] = useState("");
  const [schemeFiles, setSchemeFiles] = useState<File[]>([]);
  const [scriptFiles, setScriptFiles] = useState<File[]>([]);
  const [paperTotal, setPaperTotal] = useState("");
  const [pagesPer, setPagesPer] = useState("1");
  const [columnKey, setColumnKey] = useState(columns[0]?.key ?? "");
  const schemeRef = useRef<HTMLInputElement>(null);
  const scriptRef = useRef<HTMLInputElement>(null);

  const loadHome = useCallback(async () => {
    try {
      const [j, q] = await Promise.all([aiMarkingService.list(scopeKey), aiMarkingService.challenges("open").catch(() => [])]);
      setJobs(j); setQuestions(q);
    } catch { /* the home list is a convenience */ }
  }, [scopeKey]);

  useEffect(() => {
    if (!open) return;
    setStep("home"); setError(""); setJob(null); setName(title); setApproach("idea_based"); setCustom(""); setSchemeText("");
    setSchemeFiles([]); setScriptFiles([]); setPaperTotal(""); setPagesPer("1"); setColumnKey(columns[0]?.key ?? "");
    void loadHome();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // While the AI is marking, look again every few seconds.
  useEffect(() => {
    if (!open || step !== "marking" || !job) return;
    const t = setInterval(async () => {
      try {
        const next = await aiMarkingService.get(job.id);
        setJob(next);
        if (next.status === "review") setStep("review");
        if (next.status === "failed") { setError(next.error || "The marking failed. Nothing was charged."); setStep("home"); void loadHome(); }
      } catch { /* try again on the next tick */ }
    }, 4000);
    return () => clearInterval(t);
  }, [open, step, job?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const openJob = async (j: MarkingJob) => {
    setBusy("open"); setError("");
    try {
      const full = await aiMarkingService.get(j.id);
      setJob(full);
      setStep(full.status === "review" ? "review" : full.status === "marking" ? "marking" : full.status === "uploaded" ? "estimate" : "home");
      if (full.status === "failed") setError(full.error || "This marking failed. Nothing was charged.");
    } catch (e) { setError(err(e, "Could not open this marking.")); }
    setBusy("");
  };

  const submitSetup = async () => {
    setError("");
    if (!name.trim()) return setError("Give this marking a name.");
    if (!Number(paperTotal) || Number(paperTotal) <= 0) return setError("Say what the paper is out of.");
    if (!schemeText.trim() && !schemeFiles.length) return setError("Add the marking scheme: type it or upload it.");
    if (!scriptFiles.length) return setError("Upload the students' scripts.");
    if (approach === "custom" && !custom.trim()) return setError("Write your marking instructions.");
    setBusy("create");
    try {
      const created = await aiMarkingService.create({
        title: name.trim(), approach, custom_instructions: custom, scheme_text: schemeText, paper_total: Number(paperTotal),
        pages_per_script: Number(pagesPer) || 1, scope_key: scopeKey, roster: students.map((s) => ({ id: s.id })),
        scheme_files: schemeFiles, script_files: scriptFiles,
      });
      setJob(created); setStep("estimate");
    } catch (e) { setError(err(e, "The files could not be uploaded. Check them and try again.")); }
    setBusy("");
  };

  const authoriseMarking = async () => {
    if (!job) return;
    setBusy("start"); setError("");
    try {
      const started = await aiMarkingService.start(job.id);
      setJob(started); setStep("marking");
    } catch (e: any) {
      setError(e?.response?.status === 402 ? "You do not have enough AI credits for this. Buy credits or mark fewer scripts." : err(e, "Marking could not start. Nothing was charged."));
    }
    setBusy("");
  };

  const cancelJob = async () => {
    if (!job) return;
    try { await aiMarkingService.remove(job.id); } catch { /* ignore */ }
    setJob(null); setStep("home"); void loadHome();
  };

  const refreshJob = async () => { if (job) setJob(await aiMarkingService.get(job.id)); };

  const replaceScript = (s: MarkedScript) => setJob((cur) => (cur ? { ...cur, scripts: (cur.scripts || []).map((x) => (x.id === s.id ? s : x)) } : cur));

  const total = job ? job.paper_total : 0;
  const approved = (job?.scripts || []).filter((s) => s.status === "approved");
  const column = columns.find((c) => c.key === columnKey) ?? columns[0];
  const converted = (s: MarkedScript) => (total ? Math.round(((s.total / total) * (column?.max ?? total)) * 100) / 100 : 0);

  const saveToRegister = async () => {
    if (!column) return;
    const entries: ScanEntry[] = approved.filter((s) => s.student).map((s) => ({ studentId: s.student as string, values: { [column.key]: converted(s) } }));
    if (!entries.length) return setError("Approve at least one script that has a student.");
    setBusy("register"); setError("");
    try {
      const failed = await onConfirm(entries);
      if (failed > 0) toast({ variant: "destructive", title: `${failed} mark(s) could not be saved`, description: "The others are saved." });
      else toast({ title: "Marks saved", description: `${entries.length} marks were saved to the register. You can still correct any mark.` });
    } catch (e: any) { setError(e?.message || "The marks could not be saved."); }
    setBusy("");
  };

  const publish = async () => {
    if (!job) return;
    setBusy("publish"); setError("");
    try {
      const r = await aiMarkingService.publish(job.id);
      toast({ title: "Shared with students", description: `${r.published} students can now see their marked paper and ask about a mark.` });
      await refreshJob();
    } catch (e) { setError(err(e, "Could not share the papers.")); }
    setBusy("");
  };

  const downloadAll = async () => {
    if (!job) return;
    setBusy("pdf");
    try { downloadBlob(await aiMarkingService.pdf(`/jobs/${job.id}/pdf/`), "marked-scripts.pdf"); } catch (e) { setError(err(e, "Could not make the PDF.")); }
    setBusy("");
  };

  const unmatched = (job?.scripts || []).filter((s) => !s.student && !s.failed).length;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> Mark exam papers with AI</DialogTitle>
          <DialogDescription>{title}. The AI proposes marks and comments; you review and approve everything before any mark is saved.</DialogDescription>
        </DialogHeader>
        {error && <p role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}

        {step === "home" && (
          <div className="space-y-4">
            <Button className="gap-2" onClick={() => { setError(""); setStep("setup"); }}><Sparkles className="h-4 w-4" /> New marking</Button>
            {questions.length > 0 && <StudentQuestions items={questions} onChanged={loadHome} />}
            {jobs.length > 0 && (
              <section>
                <h3 className="mb-2 text-sm font-black">Earlier markings for this class</h3>
                <ul className="divide-y rounded-xl border">
                  {jobs.map((j) => (
                    <li key={j.id} className="flex flex-wrap items-center gap-2 p-3">
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{j.title}</p>
                        <p className="text-xs text-muted-foreground">{j.script_count} scripts · {statusText(j)}</p></div>
                      <Button size="sm" variant="outline" disabled={!!busy} onClick={() => openJob(j)}>Open</Button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        {step === "setup" && (
          <div className="space-y-5">
            <label className="block text-sm font-bold">Name of this marking
              <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} maxLength={160} /></label>
            <section className="space-y-2 rounded-xl border p-4">
              <h3 className="text-sm font-black">1. Marking scheme and instructions</h3>
              <label className="block text-xs font-bold">How should the AI mark?
                <select className="mt-1 h-11 w-full rounded-lg border bg-background px-3 text-sm font-semibold" value={approach} onChange={(e) => setApproach(e.target.value as MarkingApproach)}>
                  {APPROACHES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
                <span className="mt-1 block font-normal text-muted-foreground">{APPROACHES.find((a) => a.value === approach)?.help}</span></label>
              {approach === "custom" && <Textarea placeholder="For example: award full marks for the correct final answer; deduct one mark for missing units…" value={custom} onChange={(e) => setCustom(e.target.value)} className="min-h-[80px] text-sm" />}
              <Textarea placeholder="Type the marking scheme or expected answers here, or upload it below" value={schemeText} onChange={(e) => setSchemeText(e.target.value)} className="min-h-[110px] text-sm" />
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="outline" className="gap-2" onClick={() => schemeRef.current?.click()}><Upload className="h-4 w-4" /> Upload the marking scheme (PDF or photos)</Button>
                <input ref={schemeRef} type="file" accept="application/pdf,image/*" multiple className="hidden" onChange={(e) => { setSchemeFiles([...schemeFiles, ...Array.from(e.target.files || [])]); e.target.value = ""; }} />
                {schemeFiles.map((f, i) => <FileChip key={i} file={f} onRemove={() => setSchemeFiles(schemeFiles.filter((_, k) => k !== i))} />)}
              </div>
            </section>
            <section className="space-y-2 rounded-xl border p-4">
              <h3 className="text-sm font-black">2. Students' scripts</h3>
              <p className="text-xs text-muted-foreground">Combine all the scripts into one PDF (or upload several files or photos). Keep each student's pages together, in order.</p>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="outline" className="gap-2" onClick={() => scriptRef.current?.click()}><Upload className="h-4 w-4" /> Upload the scripts</Button>
                <input ref={scriptRef} type="file" accept="application/pdf,image/*" multiple className="hidden" onChange={(e) => { setScriptFiles([...scriptFiles, ...Array.from(e.target.files || [])]); e.target.value = ""; }} />
                {scriptFiles.map((f, i) => <FileChip key={i} file={f} onRemove={() => setScriptFiles(scriptFiles.filter((_, k) => k !== i))} />)}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-bold">The paper is out of
                  <Input className="mt-1" inputMode="decimal" value={paperTotal} onChange={(e) => setPaperTotal(e.target.value.replace(",", "."))} placeholder="for example 50" /></label>
                <label className="block text-xs font-bold">Pages in each student's script
                  <Input className="mt-1" inputMode="numeric" value={pagesPer} onChange={(e) => setPagesPer(e.target.value.replace(/\D/g, ""))} /></label>
              </div>
            </section>
            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => setStep("home")} disabled={!!busy}>Back</Button>
              <Button className="gap-2" onClick={submitSetup} disabled={!!busy}>{busy === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Check the cost</Button>
            </div>
          </div>
        )}

        {step === "estimate" && job && (
          <div className="space-y-4">
            <div className="rounded-xl border p-4">
              <p className="text-sm font-bold">{job.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{job.script_count} scripts · {job.page_count} pages in total · out of {fmt(job.paper_total)}</p>
              <p className="mt-3 text-3xl font-black text-primary">about {job.estimate_credits.toLocaleString()} credits</p>
              <p className="text-xs text-muted-foreground">This is an estimate. You are charged only for what the AI actually uses, and nothing if the marking fails. {job.unlimited ? "" : `Your balance: ${(job.balance ?? 0).toLocaleString()} credits.`}</p>
              {job.can_afford === false && <p className="mt-2 text-sm font-bold text-red-700">Your balance is lower than the estimate. Buy credits first, or mark fewer scripts.</p>}
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <Button variant="outline" onClick={cancelJob} disabled={!!busy}>Cancel</Button>
              <Button className="gap-2" onClick={authoriseMarking} disabled={!!busy || job.can_afford === false}>
                {busy === "start" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Authorise and start marking
              </Button>
            </div>
          </div>
        )}

        {step === "marking" && job && (
          <div className="space-y-3 py-6 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <p className="text-lg font-black">The AI is marking the scripts…</p>
            <p className="text-sm text-muted-foreground">{job.progress} of {job.script_count} scripts done. You can close this window; the marking continues and you will find it under "Earlier markings".</p>
          </div>
        )}

        {step === "review" && job && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">{job.title}: {(job.scripts || []).length} scripts, out of {fmt(job.paper_total)}. Check each one, correct anything, and approve.</p>
              <Button size="sm" variant="outline" onClick={async () => { const r = await aiMarkingService.approveAll(job.id); toast({ title: `${r.approved} approved`, description: r.left ? `${r.left} still need your attention.` : "All scripts approved." }); await refreshJob(); }}>
                <CheckCircle2 className="mr-1.5 h-4 w-4" /> Approve all that are ready
              </Button>
            </div>
            {unmatched > 0 && <p className="rounded-lg bg-amber-50 p-3 text-xs font-semibold text-amber-800">{unmatched} script(s) could not be matched to a student. Choose the student for each.</p>}
            <ul className="space-y-2">
              {(job.scripts || []).map((s) => (
                <ScriptCard key={s.id} script={s} students={students} paperTotal={job.paper_total} onChange={replaceScript}
                  onPdf={async () => downloadBlob(await aiMarkingService.pdf(`/scripts/${s.id}/pdf/`), `marked-script-${s.index + 1}.pdf`)} />
              ))}
            </ul>
            <section className="space-y-3 rounded-xl border bg-muted/30 p-4">
              <h3 className="text-sm font-black">When you have approved the scripts</h3>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {columns.length > 1 && (
                  <label className="flex items-center gap-2 font-semibold">Save into
                    <select className="h-10 rounded-lg border bg-background px-3" value={columnKey} onChange={(e) => setColumnKey(e.target.value)}>
                      {columns.map((c) => <option key={c.key} value={c.key}>{c.label} /{c.max}</option>)}
                    </select></label>
                )}
                <span className="text-muted-foreground">{approved.length} approved · marks are scaled to /{column?.max} ({column?.label})</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button className="gap-2" onClick={saveToRegister} disabled={!!busy || !approved.length}>{busy === "register" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Save marks to the register</Button>
                <Button variant="secondary" className="gap-2" onClick={publish} disabled={!!busy || !approved.length}>{busy === "publish" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />} Share marked papers with students</Button>
                <Button variant="outline" className="gap-2" onClick={downloadAll} disabled={!!busy}><Download className="h-4 w-4" /> Download all (PDF)</Button>
              </div>
            </section>
            <div className="flex justify-start"><Button variant="ghost" onClick={() => { setStep("home"); void loadHome(); }}>Back to the list</Button></div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function statusText(j: MarkingJob) {
  return j.status === "review" ? "ready for review" : j.status === "marking" ? `marking (${j.progress}/${j.script_count})` : j.status === "failed" ? "failed, nothing charged" : "waiting for authorisation";
}

function FileChip({ file, onRemove }: { file: File; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-semibold">
      <FileText className="h-3.5 w-3.5" />{file.name.length > 26 ? `${file.name.slice(0, 24)}…` : file.name}
      <button type="button" aria-label={`Remove ${file.name}`} onClick={onRemove}><Trash2 className="h-3.5 w-3.5 text-muted-foreground" /></button>
    </span>
  );
}

function ScriptCard({ script, students, paperTotal, onChange, onPdf }: { script: MarkedScript; students: SheetPerson[]; paperTotal: number; onChange: (s: MarkedScript) => void; onPdf: () => void }) {
  const [open, setOpen] = useState(false);
  const [qs, setQs] = useState<MarkQuestion[]>(script.questions);
  const [feedback, setFeedback] = useState(script.feedback);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => { setQs(script.questions); setFeedback(script.feedback); }, [script.id, script.total, script.status]); // eslint-disable-line react-hooks/exhaustive-deps
  const sum = qs.reduce((n, q) => n + (Number.isFinite(q.awarded) ? q.awarded : 0), 0);
  const dirty = JSON.stringify(qs) !== JSON.stringify(script.questions) || feedback !== script.feedback;

  const run = async (fn: () => Promise<MarkedScript>) => {
    setBusy(true); setMsg("");
    try { onChange(await fn()); } catch (e) { setMsg(err(e, "That did not work.")); }
    setBusy(false);
  };
  const save = () => run(() => aiMarkingService.updateScript(script.id, { questions: qs, feedback }));
  const approve = async () => {
    setBusy(true); setMsg("");
    try {
      if (dirty) onChange(await aiMarkingService.updateScript(script.id, { questions: qs, feedback }));
      onChange(await aiMarkingService.approveScript(script.id, script.status !== "approved"));
    } catch (e) { setMsg(err(e, "That did not work.")); }
    setBusy(false);
  };
  const setAwarded = (i: number, v: string) => setQs((cur) => cur.map((q, k) => (k === i ? { ...q, awarded: Math.min(Math.max(Number(v.replace(",", ".")) || 0, 0), q.max) } : q)));

  return (
    <li className={`rounded-xl border ${script.status === "approved" ? "border-emerald-300 bg-emerald-50/40" : ""}`}>
      <div className="flex flex-wrap items-center gap-2 p-3">
        <button type="button" className="flex min-w-[160px] flex-1 items-center gap-2 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
          <span><span className="block text-sm font-black">Script {script.index + 1}{script.failed ? " · not marked" : ""}</span>
            <span className="block text-xs text-muted-foreground">{script.detected_name ? `Read on the script: ${script.detected_name}` : "No name read"}{script.open_challenges ? ` · ${script.open_challenges} question(s) from the student` : ""}</span></span>
        </button>
        <select aria-label={`Student for script ${script.index + 1}`} value={script.student ?? ""} disabled={busy}
          onChange={(e) => run(() => aiMarkingService.updateScript(script.id, { student: e.target.value || null }))}
          className={`h-10 max-w-[220px] rounded-lg border bg-background px-2 text-sm font-semibold ${script.student ? "" : "border-amber-500"}`}>
          <option value="">Choose the student…</option>
          {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <span className="min-w-[64px] text-right text-lg font-black">{fmt(script.total)}<span className="text-xs font-semibold text-muted-foreground"> /{fmt(paperTotal)}</span></span>
        <Button size="sm" variant={script.status === "approved" ? "default" : "outline"} disabled={busy || script.failed} onClick={approve}>
          {script.status === "approved" ? "Approved" : "Approve"}
        </Button>
      </div>
      {open && (
        <div className="space-y-3 border-t p-3">
          {script.warning && <p className="rounded bg-amber-50 p-2 text-xs font-semibold text-amber-800">{script.warning}</p>}
          {qs.map((q, i) => (
            <div key={i} className="grid gap-2 rounded-lg border bg-white p-3 sm:grid-cols-[70px_1fr_90px]">
              <p className="text-sm font-black">Q{q.no}</p>
              <div className="space-y-1 text-xs">
                {q.student_answer ? <p><b>Student wrote:</b> {q.student_answer}</p> : null}
                <Textarea value={q.comment || ""} onChange={(e) => setQs((cur) => cur.map((x, k) => (k === i ? { ...x, comment: e.target.value } : x)))} className="min-h-[52px] text-xs" aria-label={`Comment for question ${q.no}`} />
                {q.correction ? <p className="text-emerald-800"><b>Correct answer:</b> {q.correction}</p> : null}
              </div>
              <label className="text-xs font-bold">Mark
                <div className="mt-1 flex items-center gap-1">
                  <input inputMode="decimal" value={String(q.awarded)} onChange={(e) => setAwarded(i, e.target.value)} className="h-9 w-16 rounded-md border px-2 text-right font-bold" aria-label={`Mark for question ${q.no}`} />
                  <span className="text-muted-foreground">/{fmt(q.max)}</span>
                </div></label>
            </div>
          ))}
          <label className="block text-xs font-bold">Feedback for the student
            <Textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} className="mt-1 min-h-[64px] text-sm" /></label>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold">Total: {fmt(sum)} / {fmt(paperTotal)}</span>
            <Button size="sm" disabled={busy || !dirty} onClick={save}>Save changes</Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={onPdf}><Download className="h-4 w-4" /> PDF</Button>
            {msg && <span className="text-xs font-semibold text-red-700">{msg}</span>}
          </div>
        </div>
      )}
    </li>
  );
}

function StudentQuestions({ items, onChanged }: { items: MarkingChallenge[]; onChanged: () => void }) {
  const { toast } = useToast();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  return (
    <section className="rounded-xl border border-amber-300 bg-amber-50/50 p-3">
      <h3 className="mb-2 text-sm font-black">Students asking about their marks ({items.length})</h3>
      <ul className="space-y-3">
        {items.map((c) => (
          <li key={c.id} className="rounded-lg border bg-white p-3 text-sm">
            <p className="font-bold">{c.student_name} · {c.job_title} · question {c.question_no || "(general)"}</p>
            {c.question ? <p className="text-xs text-muted-foreground">Mark given: {fmt(c.question.awarded)}/{fmt(c.question.max)}. {c.question.comment}</p> : null}
            <p className="mt-1">“{c.message}”</p>
            <Textarea className="mt-2 min-h-[56px] text-sm" placeholder="Your answer to the student" value={answers[c.id] || ""} onChange={(e) => setAnswers({ ...answers, [c.id]: e.target.value })} />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {c.question ? <label className="flex items-center gap-1 text-xs font-bold">New mark (optional)
                <input inputMode="decimal" className="h-9 w-16 rounded-md border px-2 text-right" value={marks[c.id] || ""} onChange={(e) => setMarks({ ...marks, [c.id]: e.target.value.replace(",", ".") })} />/{fmt(c.question.max)}</label> : null}
              <Button size="sm" disabled={busy === c.id || !(answers[c.id] || "").trim()} onClick={async () => {
                setBusy(c.id);
                try { await aiMarkingService.respond(c.id, answers[c.id], marks[c.id] ? Number(marks[c.id]) : null); toast({ title: "Answer sent to the student" }); onChanged(); }
                catch (e) { toast({ variant: "destructive", title: err(e, "Could not send the answer.") }); }
                setBusy("");
              }}>Send answer</Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
