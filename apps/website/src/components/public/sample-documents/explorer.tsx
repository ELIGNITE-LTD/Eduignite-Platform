"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Download, Eye, FileText, Loader2, Maximize2, Minimize2, ZoomIn, ZoomOut } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  SAMPLE_CATEGORIES,
  SAMPLE_DOCUMENTS,
  type SampleCategoryId,
  type SampleDocument,
  type SampleRender,
  type SampleVariant,
  type ThumbKind,
} from "@/lib/sample-documents/catalog";

/* ------------------------------------------------------------------ thumbnails */

function Thumb({ kind }: { kind: ThumbKind }) {
  const line = (y: number, w = 70) => <rect key={y} x="15" y={y} width={w} height="3" rx="1.5" fill="#CBD5E1" />;
  let body: ReactNode;
  switch (kind) {
    case "certificate":
      body = (
        <>
          <rect x="8" y="8" width="104" height="64" rx="3" fill="#fff" stroke="#C9A227" strokeWidth="2" />
          <rect x="13" y="13" width="94" height="54" rx="2" fill="none" stroke="#264D73" strokeWidth="1" />
          <rect x="35" y="24" width="50" height="4" rx="2" fill="#264D73" />
          <rect x="28" y="34" width="64" height="3" rx="1.5" fill="#CBD5E1" />
          <circle cx="60" cy="53" r="7" fill="#C9A227" />
        </>
      );
      break;
    case "card":
      body = (
        <>
          <rect x="10" y="12" width="64" height="42" rx="4" fill="#fff" stroke="#CBD5E1" />
          <rect x="10" y="12" width="64" height="10" rx="4" fill="#264D73" />
          <circle cx="26" cy="38" r="8" fill="#67D0E4" />
          <rect x="40" y="32" width="28" height="3" rx="1.5" fill="#CBD5E1" />
          <rect x="40" y="40" width="20" height="3" rx="1.5" fill="#CBD5E1" />
          <rect x="62" y="22" width="40" height="52" rx="4" fill="#fff" stroke="#CBD5E1" />
          <rect x="62" y="22" width="40" height="10" rx="4" fill="#0E7490" />
          <circle cx="82" cy="46" r="7" fill="#67D0E4" />
          <rect x="72" y="58" width="20" height="3" rx="1.5" fill="#CBD5E1" />
        </>
      );
      break;
    case "chart":
      body = (
        <>
          <rect x="22" y="10" width="76" height="60" rx="3" fill="#fff" stroke="#CBD5E1" />
          <rect x="30" y="16" width="40" height="4" rx="2" fill="#264D73" />
          {[0, 1, 2, 3, 4].map((i) => (
            <rect key={i} x={32 + i * 12} y={58 - (14 + ((i * 11) % 24))} width="8" height={14 + ((i * 11) % 24)} rx="1.5" fill={i % 2 ? "#67D0E4" : "#264D73"} />
          ))}
        </>
      );
      break;
    case "receipt":
      body = (
        <>
          <rect x="22" y="6" width="76" height="30" rx="3" fill="#fff" stroke="#CBD5E1" />
          <rect x="22" y="44" width="76" height="30" rx="3" fill="#fff" stroke="#CBD5E1" />
          <path d="M18 40h84" stroke="#94A3B8" strokeDasharray="3 3" />
          <rect x="30" y="12" width="40" height="4" rx="2" fill="#264D73" />
          <rect x="30" y="22" width="60" height="3" rx="1.5" fill="#CBD5E1" />
          <rect x="30" y="50" width="40" height="4" rx="2" fill="#264D73" />
          <rect x="30" y="60" width="60" height="3" rx="1.5" fill="#CBD5E1" />
        </>
      );
      break;
    default: {
      const rows = kind === "table" || kind === "attendance" || kind === "statement";
      body = (
        <>
          <rect x="22" y="6" width="76" height="68" rx="3" fill="#fff" stroke="#CBD5E1" />
          <rect x="22" y="6" width="76" height="12" rx="3" fill="#264D73" />
          {rows
            ? [0, 1, 2, 3, 4].map((i) => (
                <g key={i}>
                  <rect x="28" y={24 + i * 9} width="64" height="6" rx="1" fill={i % 2 ? "#F1F5F9" : "#E2E8F0"} />
                </g>
              ))
            : [26, 33, 40, 47, 54, 61].map((y) => line(y + 0, 50))}
          {kind === "transcript" || kind === "report" ? <circle cx="34" cy="12" r="3" fill="#67D0E4" /> : null}
        </>
      );
    }
  }
  return (
    <svg viewBox="0 0 120 80" className="h-full w-full" role="img" aria-label="">
      {body}
    </svg>
  );
}

/* ------------------------------------------------------------------ rendering */

const CATEGORY_TINT: Record<SampleCategoryId, string> = {
  academic: "from-[#EAF3FA] to-[#DCEBF6]",
  financial: "from-[#ECFAF3] to-[#DCF3E8]",
  administrative: "from-[#F3EEFB] to-[#E7DFF6]",
};

type RenderState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; render: SampleRender };

function useSampleRender(variant: SampleVariant): RenderState {
  const [state, setState] = useState<RenderState>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    variant
      .build()
      .then((render) => alive && setState({ status: "ready", render }))
      .catch((error) => {
        console.error("Sample document failed to render", error);
        if (alive) setState({ status: "error", message: "This sample could not be generated in your browser." });
      });
    return () => {
      alive = false;
    };
  }, [variant]);
  return state;
}

function useWidth(ref: React.RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

/** A stamp over the live preview of a React-rendered card (HTML and PDF samples carry their own mark). */
function SampleStamp() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center overflow-hidden" aria-hidden>
      <div className="-rotate-[30deg] select-none text-center font-black leading-none text-red-600/20">
        <div className="text-7xl tracking-widest">SAMPLE</div>
        <div className="mt-1 text-[10px] tracking-wider">FICTIONAL DATA - NOT A REAL RECORD</div>
      </div>
    </div>
  );
}

function HtmlPreview({ render, zoom }: { render: Extract<SampleRender, { kind: "html" }>; zoom: number }) {
  const box = useRef<HTMLDivElement>(null);
  const available = useWidth(box);
  const natural = render.landscape ? 1180 : 820;
  const [height, setHeight] = useState(render.landscape ? 860 : 1160);
  const scale = available ? (available / natural) * zoom : 0;
  const srcDoc = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#eef1f4">${render.html}</body></html>`;

  return (
    <div ref={box} className="w-full overflow-auto rounded-xl bg-[#eef1f4]" style={{ maxHeight: "100%" }}>
      <div style={{ width: natural * scale, height: height * scale, margin: scale * natural < available ? "0 auto" : 0 }}>
        <iframe
          title="Sample document preview"
          srcDoc={srcDoc}
          sandbox="allow-same-origin"
          style={{ width: natural, height, border: 0, transform: `scale(${scale || 0.01})`, transformOrigin: "0 0", background: "#eef1f4" }}
          onLoad={(e) => {
            const d = e.currentTarget.contentDocument;
            if (d) setHeight(Math.max(d.documentElement.scrollHeight, d.body.scrollHeight));
          }}
        />
      </div>
    </div>
  );
}

function PdfPreview({ blob, fileName }: { blob: Blob; fileName: string }) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return (
    <div className="flex h-full flex-col gap-2">
      <iframe title="Sample PDF preview" src={`${url}#toolbar=1&view=FitH`} className="h-[62vh] min-h-[420px] w-full flex-1 rounded-xl border-0 bg-white" />
      <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <FileText className="h-4 w-4 text-[#264D73]/50" aria-hidden />
        Preview blank on your device?
        <a href={url} target="_blank" rel="noreferrer" className="font-bold text-[#264D73] underline">
          Open the PDF in a new tab
        </a>
        or use Download PDF.
      </p>
    </div>
  );
}

function CardPreview({ render, zoom, exportRef }: { render: Extract<SampleRender, { kind: "card" }>; zoom: number; exportRef: React.RefObject<HTMLDivElement | null> }) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const available = useWidth(box);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const update = () => setSize({ w: el.offsetWidth, h: el.offsetHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [render]);
  // Sides sit next to each other when they fit, one above the other otherwise (the card's own lg breakpoint decides).
  const scale = size.w && available ? Math.min(1, (available - 16) / size.w) * zoom : 1;

  return (
    <>
      <div ref={box} className="w-full overflow-auto rounded-xl bg-[#eef1f4] p-2">
        <div className="relative mx-auto" style={{ width: size.w * scale, height: size.h * scale }}>
          <div ref={inner} className="absolute left-0 top-0 w-max" style={{ transform: `scale(${scale})`, transformOrigin: "0 0" }}>
            {render.node}
          </div>
          <SampleStamp />
        </div>
      </div>
      {/* Unscaled copy off-screen: the PDF export captures the real card DOM. */}
      <div ref={exportRef} aria-hidden className="pointer-events-none fixed -left-[10000px] top-0 w-max bg-white p-4">
        <div className="flex flex-row gap-8">{render.node}</div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ viewer */

function Viewer({ doc, fullscreen, onToggleFullscreen }: { doc: SampleDocument; fullscreen: boolean; onToggleFullscreen: () => void }) {
  const [variantId, setVariantId] = useState(doc.variants[0].id);
  const variant = doc.variants.find((v) => v.id === variantId) ?? doc.variants[0];
  const state = useSampleRender(variant);
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => setZoom(1), [variantId]);

  const download = useCallback(async () => {
    if (state.status !== "ready") return;
    setBusy(true);
    setError("");
    try {
      const render = state.render;
      if (render.kind === "pdf") {
        const { downloadBlob } = await import("@/lib/browser-download");
        downloadBlob(render.blob, `${variant.fileName}.pdf`);
      } else if (render.kind === "html") {
        const { downloadHtmlPagesPdf } = await import("@/lib/browser-download");
        await downloadHtmlPagesPdf([render.html], variant.fileName, { landscape: render.landscape });
      } else {
        const root = exportRef.current;
        if (!root) throw new Error("Card not ready");
        const [{ buildIdCardsPdf }, { addPdfWatermark }] = await Promise.all([import("@/lib/id-card-pdf"), import("@/lib/sample-documents/watermark")]);
        const pdf = addPdfWatermark(await buildIdCardsPdf(root));
        pdf.save(`${variant.fileName}.pdf`);
      }
    } catch (e) {
      console.error(e);
      setError("The PDF could not be created in this browser.");
    } finally {
      setBusy(false);
    }
  }, [state, variant]);

  const zoomable = state.status === "ready" && state.render.kind !== "pdf";

  return (
    <div className={cn("flex min-h-0 flex-col gap-3", fullscreen && "h-full")}>
      <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>SAMPLE - fictional data. This is not a real school, student or staff record.</span>
      </div>

      {doc.variants.length > 1 && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Sample versions">
          {doc.variants.map((v) => (
            <button
              key={v.id}
              role="tab"
              aria-selected={v.id === variant.id}
              onClick={() => setVariantId(v.id)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-bold transition-colors",
                v.id === variant.id ? "border-[#264D73] bg-[#264D73] text-white" : "border-slate-200 bg-white text-slate-600 hover:border-[#264D73]/40 hover:text-[#264D73]",
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}
      <p className="text-sm text-slate-600">{variant.description}</p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={download}
          disabled={state.status !== "ready" || busy}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#264D73] px-3.5 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#1c3c5c] disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download PDF
        </button>
        {zoomable && (
          <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white">
            <button aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} className="p-2 text-slate-600 hover:text-[#264D73]">
              <ZoomOut className="h-4 w-4" />
            </button>
            <button onClick={() => setZoom(1)} className="min-w-[3.25rem] px-1 text-xs font-bold text-slate-600" aria-label="Reset zoom">
              {Math.round(zoom * 100)}%
            </button>
            <button aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))} className="p-2 text-slate-600 hover:text-[#264D73]">
              <ZoomIn className="h-4 w-4" />
            </button>
          </div>
        )}
        <button
          onClick={onToggleFullscreen}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:text-[#264D73]"
        >
          {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />} {fullscreen ? "Exit full screen" : "Full screen"}
        </button>
      </div>
      {error && <p className="text-sm font-semibold text-red-600">{error}</p>}

      <div className="relative min-h-[320px] flex-1 overflow-auto">
        {state.status === "loading" && (
          <div className="flex h-64 items-center justify-center gap-2 text-sm font-semibold text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Generating sample...
          </div>
        )}
        {state.status === "error" && <p className="p-6 text-center text-sm font-semibold text-red-600">{state.message}</p>}
        {state.status === "ready" && state.render.kind === "html" && <HtmlPreview render={state.render} zoom={zoom} />}
        {state.status === "ready" && state.render.kind === "pdf" && <PdfPreview blob={state.render.blob} fileName={variant.fileName} />}
        {state.status === "ready" && state.render.kind === "card" && <CardPreview render={state.render} zoom={zoom} exportRef={exportRef} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ page body */

export function SampleDocumentsExplorer() {
  const [filter, setFilter] = useState<SampleCategoryId | "all">("all");
  const [open, setOpen] = useState<SampleDocument | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  const docs = SAMPLE_DOCUMENTS.filter((d) => filter === "all" || d.category === filter);

  return (
    <div>
      <div className="mx-auto flex max-w-3xl items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" role="note">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <p>
          <b>Sample documents only.</b> Every document on this page uses fictional data for a made-up &ldquo;Demo International School&rdquo;. No real
          school, student or staff records are shown, and each preview and download is marked SAMPLE.
        </p>
      </div>

      <div className="mt-8 flex flex-wrap justify-center gap-2" role="tablist" aria-label="Document categories">
        {[{ id: "all" as const, label: "All documents", blurb: "" }, ...SAMPLE_CATEGORIES].map((c) => {
          const count = c.id === "all" ? SAMPLE_DOCUMENTS.length : SAMPLE_DOCUMENTS.filter((d) => d.category === c.id).length;
          return (
            <button
              key={c.id}
              role="tab"
              aria-selected={filter === c.id}
              onClick={() => setFilter(c.id)}
              className={cn(
                "rounded-full border px-4 py-2 text-sm font-bold transition-colors",
                filter === c.id ? "border-[#264D73] bg-[#264D73] text-white" : "border-slate-200 bg-white text-slate-600 hover:border-[#264D73]/40 hover:text-[#264D73]",
              )}
            >
              {c.label} <span className="opacity-70">({count})</span>
            </button>
          );
        })}
      </div>
      {filter !== "all" && <p className="mt-3 text-center text-sm text-slate-500">{SAMPLE_CATEGORIES.find((c) => c.id === filter)?.blurb}</p>}

      <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {docs.map((doc) => (
          <li key={doc.id} className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(18,49,77,0.04)] transition-shadow hover:shadow-lg">
            <div className={cn("relative h-40 bg-gradient-to-br p-4", CATEGORY_TINT[doc.category])}>
              <Thumb kind={doc.thumb} />
              <span className="absolute right-3 top-3 rounded-full bg-red-600/90 px-2 py-0.5 text-[10px] font-black tracking-widest text-white">SAMPLE</span>
            </div>
            <div className="flex flex-1 flex-col p-5">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#0E7490]">{SAMPLE_CATEGORIES.find((c) => c.id === doc.category)?.label}</p>
              <h3 className="mt-1 font-serif text-xl font-bold text-[#12314d]">{doc.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">{doc.description}</p>
              <p className="mt-3 text-xs text-slate-500">
                {doc.variants.length} sample{doc.variants.length === 1 ? "" : "s"}
              </p>
              <button
                onClick={() => {
                  setFullscreen(false);
                  setOpen(doc);
                }}
                className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-[#264D73] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#1c3c5c]"
              >
                <Eye className="h-4 w-4" /> Preview
              </button>
            </div>
          </li>
        ))}
      </ul>

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent
          className={cn(
            "flex flex-col",
            fullscreen ? "h-[100dvh] max-h-[100dvh] w-screen max-w-none rounded-none sm:rounded-none" : "h-[92dvh] max-w-5xl",
          )}
        >
          {open && (
            <>
              <DialogTitle className="pr-8 font-serif text-xl text-[#12314d]">{open.title}</DialogTitle>
              <DialogDescription className="sr-only">Sample {open.title} with fictional data</DialogDescription>
              <Viewer doc={open} fullscreen={fullscreen} onToggleFullscreen={() => setFullscreen((f) => !f)} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
