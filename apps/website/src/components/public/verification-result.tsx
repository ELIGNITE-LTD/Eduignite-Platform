"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";

import type { VerifyState } from "@/lib/public-verify";

export interface VerificationRow {
  label: string;
  value: string | number | null | undefined;
}

interface VerificationResultProps {
  /** e.g. "Report card", "Student ID card", "Fee receipt" */
  documentType: string;
  loading: boolean;
  state?: VerifyState;
  /** Message from the server or the page (shown for anything but "valid"). */
  detail?: string;
  rows?: VerificationRow[];
}

const COPY: Record<VerifyState, { title: string; tone: string; Icon: typeof CheckCircle2 }> = {
  valid: { title: "Valid", tone: "border-green-200 bg-green-50 text-green-800", Icon: CheckCircle2 },
  revoked: { title: "Revoked", tone: "border-amber-200 bg-amber-50 text-amber-800", Icon: AlertTriangle },
  not_valid: { title: "Not valid", tone: "border-red-200 bg-red-50 text-red-800", Icon: XCircle },
  unavailable: { title: "Could not check", tone: "border-slate-200 bg-slate-50 text-slate-700", Icon: AlertTriangle },
};

/** Public, login-free result card shared by every /verify/** page. */
export function VerificationResult({ documentType, loading, state, detail, rows = [] }: VerificationResultProps) {
  const copy = state ? COPY[state] : null;
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto flex max-w-xl flex-col gap-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-white shadow-lg">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-black text-primary">EduIgnite verification</h1>
          <p className="mt-2 text-sm text-muted-foreground">{documentType}</p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-xl">
          {loading || !copy ? (
            <div className="flex h-44 flex-col items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-semibold">Checking...</p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className={`flex items-center gap-3 rounded-2xl border p-4 ${copy.tone}`} role="status">
                <copy.Icon className="h-7 w-7 shrink-0" />
                <div>
                  <p className="text-lg font-black">{copy.title}</p>
                  {detail ? <p className="text-sm">{detail}</p> : null}
                </div>
              </div>
              {rows.length > 0 ? (
                <dl className="grid gap-3 text-sm">
                  {rows
                    .filter((row) => row.value !== undefined && row.value !== null && row.value !== "")
                    .map((row) => (
                      <div key={row.label} className="flex items-start justify-between gap-4 border-b border-slate-100 pb-2">
                        <dt className="text-muted-foreground">{row.label}</dt>
                        <dd className="text-right font-semibold text-slate-900">{String(row.value)}</dd>
                      </div>
                    ))}
                </dl>
              ) : null}
              {state !== "valid" ? (
                <p className="text-sm text-muted-foreground">
                  If this document should be valid, please contact the school administration.
                </p>
              ) : null}
            </div>
          )}
        </div>

        <Link href="/" className="rounded-xl border border-slate-200 bg-white py-3 text-center text-sm font-semibold text-primary">
          Go to EduIgnite
        </Link>
      </div>
    </main>
  );
}
