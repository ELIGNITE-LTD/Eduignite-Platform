"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";

/** The "[Verify a Certificate]" public action — a small ID lookup form that
 * sends the visitor to the actual verification result page. */
export function VerifyLookupForm({ className }: { className?: string }) {
  const router = useRouter();
  const [id, setId] = useState("");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = id.trim();
    if (!trimmed) return;
    router.push(`/academy/verify/${encodeURIComponent(trimmed)}`);
  }

  return (
    <form onSubmit={onSubmit} className={className}>
      <label htmlFor="verify-id" className="mb-2 block text-xs font-black uppercase tracking-widest text-white/70">
        Verify a certificate
      </label>
      <div className="flex flex-wrap gap-2 sm:flex-nowrap">
        <input
          id="verify-id"
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="EDU-2026-000123"
          className="min-w-0 flex-1 rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-semibold text-white placeholder:text-white/40 outline-none focus:border-[#67D0E4] focus:ring-2 focus:ring-[#67D0E4]/30"
        />
        <button
          type="submit"
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-[#264D73] transition-colors hover:bg-slate-100"
        >
          <ShieldCheck className="h-4 w-4" /> Verify
        </button>
      </div>
    </form>
  );
}
