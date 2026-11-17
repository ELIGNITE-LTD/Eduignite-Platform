"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Download, FileCheck2, Loader2, MessageCircleQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { downloadBlob } from "@/lib/browser-download";
import { aiMarkingService, type MyMarkedPaper } from "@/lib/api/services/ai-marking.service";

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));

/** The student's marked papers: score, what they wrote, the mark and comment for each answer, the correction, and a way to ask. */
export default function MarkedPapersPage() {
  const { toast } = useToast();
  const [papers, setPapers] = useState<MyMarkedPaper[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<string>("");
  const [asking, setAsking] = useState<string>("");   // paper|question being asked about
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setPapers(await aiMarkingService.mine()); setFailed(false); } catch { setFailed(true); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const send = async (paper: MyMarkedPaper, no: string) => {
    setBusy(true);
    try {
      await aiMarkingService.challenge(paper.id, no, text);
      toast({ title: "Your question was sent", description: "Your teacher will look at this answer again." });
      setAsking(""); setText(""); await load();
    } catch (e: any) {
      toast({ variant: "destructive", title: e?.response?.data?.detail || "Could not send your question." });
    }
    setBusy(false);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-20">
      <header className="rounded-3xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5 sm:p-7">
        <h1 className="flex items-center gap-2 text-2xl font-black text-primary sm:text-3xl"><FileCheck2 className="h-7 w-7" /> My marked papers</h1>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">See your score, what you got right, your mistakes and the correct answers. If you think an answer was marked wrongly, ask your teacher to look again.</p>
      </header>
      {papers === null && !failed ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div> : null}
      {failed ? <p className="rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">Could not load your papers. Check your connection and try again.</p> : null}
      {papers && papers.length === 0 ? <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">No marked papers yet. When your teacher shares a marked exam, it appears here.</p> : null}
      <ul className="space-y-3">
        {(papers ?? []).map((p) => (
          <li key={p.id} className="rounded-2xl border bg-card shadow-sm">
            <div className="flex flex-wrap items-center gap-3 p-4">
              <button type="button" className="flex min-w-[180px] flex-1 items-center gap-2 text-left" aria-expanded={open === p.id} onClick={() => setOpen(open === p.id ? "" : p.id)}>
                <ChevronDown className={`h-5 w-5 transition-transform ${open === p.id ? "rotate-180" : ""}`} />
                <span><span className="block text-base font-black">{p.title}</span>
                  <span className="block text-xs text-muted-foreground">{p.published_at ? new Date(p.published_at).toLocaleDateString() : ""}</span></span>
              </button>
              <span className="text-2xl font-black text-primary">{fmt(p.total)}<span className="text-sm font-semibold text-muted-foreground"> / {fmt(p.paper_total)}</span></span>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={async () => downloadBlob(await aiMarkingService.pdf(`/my/${p.id}/pdf/`), `${p.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`)}><Download className="h-4 w-4" /> PDF</Button>
            </div>
            {open === p.id && (
              <div className="space-y-3 border-t p-4">
                {p.feedback ? <p className="rounded-xl bg-primary/5 p-3 text-sm"><b>Feedback:</b> {p.feedback}</p> : null}
                {p.questions.map((q) => {
                  const mine = p.challenges.filter((c) => c.question_no === q.no);
                  const key = `${p.id}|${q.no}`;
                  const lost = q.awarded < q.max;
                  return (
                    <div key={q.no} className={`rounded-xl border p-3 text-sm ${lost ? "border-amber-200 bg-amber-50/40" : "border-emerald-200 bg-emerald-50/40"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-black">Question {q.no}</p>
                        <p className="font-black">{fmt(q.awarded)} / {fmt(q.max)}</p>
                      </div>
                      {q.student_answer ? <p className="mt-1 text-xs"><b>You wrote:</b> {q.student_answer}</p> : null}
                      {q.comment ? <p className="mt-1 text-xs">{q.comment}</p> : null}
                      {q.correction ? <p className="mt-1 text-xs text-emerald-800"><b>Correct answer:</b> {q.correction}</p> : null}
                      {mine.map((c) => (
                        <p key={c.id} className="mt-2 rounded-lg bg-white p-2 text-xs"><b>Your question:</b> {c.message}{c.status === "resolved" ? <><br /><b>Teacher:</b> {c.response}{c.new_awarded !== null ? ` (new mark ${fmt(c.new_awarded)})` : ""}</> : <><br /><i>Waiting for your teacher.</i></>}</p>
                      ))}
                      {asking === key ? (
                        <div className="mt-2 space-y-2">
                          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Tell your teacher what you think is wrong" className="min-h-[70px] text-sm" />
                          <div className="flex gap-2">
                            <Button size="sm" disabled={busy || text.trim().length < 5} onClick={() => send(p, q.no)}>Send to my teacher</Button>
                            <Button size="sm" variant="ghost" onClick={() => { setAsking(""); setText(""); }}>Cancel</Button>
                          </div>
                        </div>
                      ) : !mine.some((c) => c.status === "open") ? (
                        <Button size="sm" variant="ghost" className="mt-1 h-8 gap-1.5 px-2 text-xs" onClick={() => { setAsking(key); setText(""); }}><MessageCircleQuestion className="h-4 w-4" /> I think this was marked wrongly</Button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
