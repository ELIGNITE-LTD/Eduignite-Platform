"use client";

import { useCallback, useRef, useState } from "react";
import { CheckCircle2, Download, FileText, Loader2, RotateCcw } from "lucide-react";

type DownloadState = "idle" | "downloading" | "done" | "error";

export type AppDownloadProps = {
  appKey: "mobile" | "desktop";
  cta: string;
  /** Advertised size, e.g. "8.2 MB" — fallback total when the stream omits it. */
  size: string;
  guide: { href: string; name: string; size: string };
};

function parseSizeToBytes(size: string): number {
  const match = /([\d.]+)\s*(KB|MB|GB)/i.exec(size);
  if (!match) return 0;
  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  const factor = unit === "GB" ? 1024 ** 3 : unit === "MB" ? 1024 ** 2 : 1024;
  return Math.round(value * factor);
}

function humanBytes(bytes: number): string {
  if (!bytes) return "0 MB";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

export function AppDownload({ appKey, cta, size, guide }: AppDownloadProps) {
  const [state, setState] = useState<DownloadState>("idle");
  const [received, setReceived] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const percent = total > 0 ? Math.min(100, Math.round((received / total) * 100)) : 0;

  const start = useCallback(async () => {
    setState("downloading");
    setReceived(0);
    setError("");
    const fallbackTotal = parseSizeToBytes(size);
    setTotal(fallbackTotal);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`/api/download/${appKey}`, { signal: controller.signal });
      if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}).`);

      const lengthHeader = res.headers.get("Content-Length");
      const streamTotal = lengthHeader ? Number(lengthHeader) : fallbackTotal;
      if (streamTotal) setTotal(streamTotal);

      const filename =
        /filename="?([^"]+)"?/.exec(res.headers.get("Content-Disposition") || "")?.[1] ||
        (appKey === "mobile" ? "eduignite-mobile.apk" : "EduIgnite-Setup.exe");

      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          got += value.length;
          setReceived(got);
        }
      }

      const blob = new Blob(chunks as BlobPart[]);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setState("done");
    } catch (err: any) {
      if (err?.name === "AbortError") {
        setState("idle");
        return;
      }
      setError(err?.message || "Something went wrong. Please try again.");
      setState("error");
    } finally {
      abortRef.current = null;
    }
  }, [appKey, size]);

  return (
    <div className="space-y-5">
      {/* Primary action / progress */}
      {state === "idle" && (
        <button
          onClick={start}
          className="inline-flex w-full items-center justify-center gap-2.5 rounded-2xl bg-[#264D73] px-6 py-4 text-base font-black text-white shadow-lg shadow-[#264D73]/20 transition-colors hover:bg-[#1c3c5c]"
        >
          <Download className="h-5 w-5" /> {cta}
        </button>
      )}

      {state === "downloading" && (
        <div className="rounded-2xl border border-[#264D73]/15 bg-[#EAF3FA] p-5">
          <div className="flex items-center justify-between text-sm font-bold text-[#264D73]">
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Downloading…
            </span>
            <span className="tabular-nums">{percent}%</span>
          </div>
          <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-white">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#67D0E4] to-[#264D73] transition-[width] duration-150"
              style={{ width: `${percent || 3}%` }}
            />
          </div>
          <p className="mt-2 text-xs font-semibold text-slate-500 tabular-nums">
            {humanBytes(received)}{total ? ` of ${humanBytes(total)}` : ""}
          </p>
        </div>
      )}

      {state === "done" && (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-5">
          <p className="inline-flex items-center gap-2 text-sm font-black text-green-700">
            <CheckCircle2 className="h-5 w-5" /> Download complete
          </p>
          <p className="mt-1.5 text-xs font-medium text-green-800/80">
            If it didn’t open automatically, check your browser’s downloads. Now grab the setup guide below.
          </p>
          <button
            onClick={start}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-green-700 underline underline-offset-2 hover:text-green-800"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Download again
          </button>
        </div>
      )}

      {state === "error" && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
          <p className="text-sm font-black text-red-700">Download didn’t finish</p>
          <p className="mt-1 text-xs font-medium text-red-800/80">{error}</p>
          <button
            onClick={start}
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Try again
          </button>
        </div>
      )}

      {/* Setup guide prompt — always offered alongside the app */}
      <a
        href={guide.href}
        download
        className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 transition-colors hover:border-[#67D0E4] hover:bg-[#EAF3FA]/40"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#67D0E4]/15 text-[#264D73]">
          <FileText className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-black text-[#12314d]">Also download the setup guide</span>
          <span className="block text-xs font-medium text-slate-500">
            {guide.name} · PDF · {guide.size}
          </span>
        </span>
        <Download className="h-5 w-5 shrink-0 text-slate-400 transition-colors group-hover:text-[#264D73]" />
      </a>
    </div>
  );
}
