"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, ShieldCheck, XCircle } from "lucide-react";
import { BASE_URL } from "@/lib/api/client";
import { buildCameroonReportCardHtml } from "@/lib/cameroon-report-card";

export default function ReportCardVerificationPage() {
  const params = useParams<{ admissionNumber: string; academicYear: string; key: string }>();
  const [html, setHtml] = useState<string>("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    function candidateBases(): string[] {
      const bases: string[] = [];
      if (typeof window !== "undefined") {
        const { origin, hostname } = window.location;
        if (hostname !== "localhost" && hostname !== "127.0.0.1") {
          bases.push(`${origin}/api/v1`);
          const root = hostname.replace(/^www\./, "").replace(/^(admin|dashboard|app)\./, "");
          bases.push(`https://api.${root}/api/v1`);
        }
      }
      if (BASE_URL) bases.push(BASE_URL);
      return Array.from(new Set(bases));
    }

    async function verify() {
      const adm = encodeURIComponent(params.admissionNumber);
      const year = encodeURIComponent(params.academicYear);
      const key = encodeURIComponent(params.key);
      const school = new URLSearchParams(window.location.search).get("school");
      const query = school ? `?school=${encodeURIComponent(school)}` : "";
      const path = `/grades/grades/verify-report-card/${adm}/${year}/${key}/${query}`;
      let lastError = "You appear to be offline. Please check your connection and scan again.";
      let sawApiAnswer = false;

      for (const base of candidateBases()) {
        try {
          const res = await fetch(`${base}${path}`, { cache: "no-store" });
          const isJson = (res.headers.get("content-type") || "").includes("application/json");
          if (!isJson) continue;
          const payload = await res.json();
          sawApiAnswer = true;
          if (res.ok && payload?.valid !== false) {
            if (alive) {
              setHtml(buildCameroonReportCardHtml(payload, { qrCode: payload.qr_code }));
              setLoading(false);
            }
            return;
          }
          lastError = payload?.detail || "This report card could not be verified.";
          break;
        } catch {
          /* try next base */
        }
      }
      if (alive) {
        setError(sawApiAnswer ? lastError : lastError);
        setLoading(false);
      }
    }

    void verify();
    return () => {
      alive = false;
    };
  }, [params.admissionNumber, params.academicYear, params.key]);

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#17385a] text-white shadow-lg">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-black text-[#17385a]">EduIgnite Report Card Verification</h1>
          <p className="mt-1 text-sm text-slate-500">Official verification — this is the authentic report card on record.</p>
        </div>

        {loading ? (
          <div className="flex h-56 flex-col items-center justify-center gap-3 text-slate-500">
            <Loader2 className="h-8 w-8 animate-spin text-[#17385a]" />
            <p className="text-sm font-semibold">Verifying report card…</p>
          </div>
        ) : error ? (
          <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl bg-white p-8 text-center shadow-xl">
            <XCircle className="h-12 w-12 text-red-500" />
            <p className="font-bold text-[#17385a]">{error}</p>
            <p className="text-sm text-slate-500">If this card should be valid, please contact the school administration.</p>
          </div>
        ) : (
          <div dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </div>
    </main>
  );
}
