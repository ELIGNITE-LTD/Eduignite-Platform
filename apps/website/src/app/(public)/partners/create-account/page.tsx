"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Loader2, Lock, ShieldCheck } from "lucide-react";
import { checkAccountToken, createAccount, partnerError } from "@/lib/partner/client";

const field = "w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-[#264D73] focus:outline-none focus:ring-2 focus:ring-[#264D73]/20";

export default function CreateAccountPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [checking, setChecking] = useState(true);
  const [valid, setValid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token") || "";
    setToken(t);
    if (!t) { setChecking(false); return; }
    checkAccountToken(t)
      .then((r) => { setEmail(r.email); setValid(true); })
      .catch(() => setValid(false))
      .finally(() => setChecking(false));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) { setError("Passwords do not match."); return; }
    if (password.length < 8) { setError("Use at least 8 characters."); return; }
    setBusy(true);
    try {
      await createAccount(token, password, confirm);
      router.replace("/partner-portal");
    } catch (err: any) {
      setError(partnerError(err, "We could not create your account."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-gradient-to-b from-[#EAF3FA] to-white">
      <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          {checking ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-[#264D73]/50" /></div>
          ) : !valid ? (
            <div className="text-center">
              <ShieldCheck className="mx-auto h-10 w-10 text-slate-300" />
              <h1 className="mt-4 text-xl font-black text-[#12314d]">This link is invalid or expired</h1>
              <p className="mt-2 text-sm text-slate-500">Account-creation links expire after 7 days. Please contact EduIgnite if you need a new one.</p>
              <Link href="/partners" className="mt-6 inline-block text-sm font-bold text-[#264D73] hover:underline">Back to partner programme</Link>
            </div>
          ) : (
            <>
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-green-100 text-green-700"><CheckCircle2 className="h-5 w-5" /></span>
              <h1 className="mt-4 text-2xl font-black text-[#12314d]">Create your Partner account</h1>
              <p className="mt-1 text-sm text-slate-500">Your application was approved. Set a password to finish.</p>

              <form onSubmit={submit} className="mt-6 space-y-3">
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-slate-600">Email (approved — cannot be changed)</label>
                  <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    <Lock className="h-4 w-4 text-slate-400" /> {email}
                  </div>
                </div>
                <input className={field} type="password" placeholder="Password (min 8 characters)" value={password} onChange={(e) => setPassword(e.target.value)} />
                <input className={field} type="password" placeholder="Confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
                <button type="submit" disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#264D73] px-5 py-3 text-sm font-black text-white hover:bg-[#1c3c5c] disabled:opacity-60">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create Partner Account
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
