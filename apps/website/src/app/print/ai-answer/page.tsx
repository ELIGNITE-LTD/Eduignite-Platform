"use client";

/**
 * One EduIgnite AI answer, laid out for printing to PDF.
 *
 * The chat bots cannot draw charts or typeset mathematics, so the server
 * opens this page in a headless browser and prints it. It uses the same
 * `AiAnswer` component as the assistant in the apps, so a chart in the PDF is
 * exactly the chart a student would see in the app.
 *
 * The answer arrives by a one-time token (`?t=`), never in the address
 * itself. The page marks itself ready only once every chart has drawn, so
 * the PDF is never taken of a half-drawn page.
 */

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { AiAnswer } from "@/components/ai/ai-answer";
import { BASE_URL } from "@/lib/api/client";

type Payload = { question: string; answer: string; asked_by?: string; language?: string; created_at?: string };

function chartsDrawn(root: HTMLElement): boolean {
  // Data charts draw into a sized container once they know their width;
  // diagrams replace their placeholder with an SVG.
  const emptyCharts = root.querySelectorAll(".recharts-responsive-container:empty").length;
  const pendingDiagrams = root.querySelectorAll("[data-diagram-pending='true']").length;
  return emptyCharts === 0 && pendingDiagrams === 0;
}

function PrintAnswer() {
  const params = useSearchParams();
  const token = params.get("t") || "";
  const [payload, setPayload] = useState<Payload | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token) {
      setFailed(true);
      return;
    }
    fetch(`${BASE_URL}/bots/render/${encodeURIComponent(token)}/`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then(setPayload)
      .catch(() => setFailed(true));
  }, [token]);

  useEffect(() => {
    if (!payload) return;
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      const root = rootRef.current;
      // Ready when everything has drawn, or after 8 seconds regardless, so a
      // chart that cannot draw does not hold the whole document back.
      if ((root && chartsDrawn(root) && tries >= 3) || tries >= 40) {
        window.clearInterval(timer);
        // One more frame for the last paint.
        window.requestAnimationFrame(() => setReady(true));
      }
    }, 200);
    return () => window.clearInterval(timer);
  }, [payload]);

  const french = payload?.language === "fr";
  const date = payload?.created_at ? new Date(payload.created_at) : new Date();

  return (
    <div
      className="min-h-screen bg-white text-foreground"
      data-render-ready={ready ? "true" : "false"}
      data-render-error={failed ? "true" : "false"}
    >
      <style>{`
        @page { size: A4; margin: 0; }
        @media print { #nprogress, [data-toaster] { display: none !important; } }
        body { background: #ffffff !important; }
        /* A chart, diagram or table cut in two by a page break cannot be read. */
        figure, .ai-diagram, table, pre, blockquote { break-inside: avoid; page-break-inside: avoid; }
        h1, h2, h3, h4 { break-after: avoid; page-break-after: avoid; }
      `}</style>
      {failed ? (
        <p className="p-10 text-center text-sm text-muted-foreground">This answer is no longer available.</p>
      ) : !payload ? null : (
        <div className="mx-auto max-w-[720px] px-2 py-4">
          <header className="flex items-center justify-between border-b-2 border-primary pb-3">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/eduignite-icon-512.png" alt="" className="h-10 w-10 object-contain" />
              <div>
                <p className="text-lg font-black leading-tight text-primary">EduIgnite AI</p>
                <p className="text-[11px] text-muted-foreground">eduignite.online</p>
              </div>
            </div>
            <div className="text-right text-[11px] text-muted-foreground">
              {payload.asked_by ? <p className="font-bold text-foreground">{payload.asked_by}</p> : null}
              <p>{date.toLocaleDateString(french ? "fr-FR" : "en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
            </div>
          </header>

          {payload.question ? (
            <section className="mt-5 rounded-xl border-l-4 border-primary bg-primary/5 px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-primary/70">
                {french ? "Question" : "Question"}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-[15px] font-medium">{payload.question}</p>
            </section>
          ) : null}

          <main ref={rootRef} className="mt-6 text-[14.5px] leading-[1.7]">
            <AiAnswer content={payload.answer} />
          </main>

          <footer className="mt-10 border-t pt-3 text-center text-[10px] text-muted-foreground">
            {french
              ? "Réponse générée par EduIgnite AI. Vérifiez toujours avec votre enseignant."
              : "Answer generated by EduIgnite AI. Always check with your teacher."}
          </footer>
        </div>
      )}
    </div>
  );
}

export default function PrintAnswerPage() {
  return (
    <Suspense fallback={null}>
      <PrintAnswer />
    </Suspense>
  );
}
