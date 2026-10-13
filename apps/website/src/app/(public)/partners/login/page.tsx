"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Handshake, Loader2 } from "lucide-react";
import { getPartnerSession, loginPartner, requestPasswordReset, partnerError } from "@/lib/partner/client";

const field = "w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-[#264D73] focus:outline-none focus:ring-2 focus:ring-[#264D73]/20";

export default function PartnerLoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (getPartnerSession()) router.replace("/partner-portal");
  }, [router]);

  const doLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await loginPartner(email, password);
      router.replace("/partner-portal");
    } catch (err: any) {
      setError(partnerError(err, "The email address or password is incorrect."));
    } finally {
      setBusy(false);
    }
  };

  const doForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await requestPasswordReset(email);
      setNote(res.detail);
    } catch {
      setNote("If a partner account uses this email, a reset link has been sent.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-gradient-to-b from-[#EAF3FA] to-white">
      <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
        <Link href="/partners" className="inline-flex items-center gap-1.5 text-sm font-bold text-[#264D73] hover:underline">
          <ArrowLeft className="h-4 w-4" /> Partner programme
        </Link>
        <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#264D73]/8 text-[#264D73]"><Handshake className="h-5 w-5" /></span>
          <h1 className="mt-4 text-2xl font-black text-[#12314d]">{mode === "login" ? "Partner sign in" : "Reset your password"}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {mode === "login" ? "Access your partner portal." : "We'll email you a secure reset link."}
          </p>

          {mode === "login" ? (
            <form onSubmit={doLogin} className="mt-6 space-y-3">
              <input className={field} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <input className={field} type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
              {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
              <button type="submit" disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#264D73] px-5 py-3 text-sm font-black text-white hover:bg-[#1c3c5c] disabled:opacity-60">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Sign in
              </button>
              <button type="button" onClick={() => { setMode("forgot"); setError(""); setNote(""); }} className="mt-1 w-full text-center text-xs font-bold text-[#264D73] hover:underline">
                Forgot password?
              </button>
            </form>
          ) : (
            <form onSubmit={doForgot} className="mt-6 space-y-3">
              <input className={field} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
              {note && <p className="text-sm font-semibold text-[#0E7490]">{note}</p>}
              <button type="submit" disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#264D73] px-5 py-3 text-sm font-black text-white hover:bg-[#1c3c5c] disabled:opacity-60">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Send reset link
              </button>
              <button type="button" onClick={() => { setMode("login"); setNote(""); }} className="mt-1 w-full text-center text-xs font-bold text-[#264D73] hover:underline">
                Back to sign in
              </button>
            </form>
          )}
          <p className="mt-6 border-t border-slate-100 pt-4 text-center text-xs text-slate-500">
            Not a partner yet?{" "}
            <Link href="/partners/apply" className="font-bold text-[#264D73] hover:underline">Apply to become one</Link>
          </p>
        </div>
      </div>
    </section>
  );
}
