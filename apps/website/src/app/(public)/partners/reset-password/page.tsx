"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import { confirmPasswordReset, partnerError } from "@/lib/partner/client";

const field = "w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-[#264D73] focus:outline-none focus:ring-2 focus:ring-[#264D73]/20";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [uid, setUid] = useState("");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setUid(p.get("uid") || "");
    setToken(p.get("token") || "");
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) { setError("Passwords do not match."); return; }
    if (password.length < 8) { setError("Use at least 8 characters."); return; }
    setBusy(true);
    try {
      await confirmPasswordReset(uid, token, password, confirm);
      setDone(true);
      setTimeout(() => router.replace("/partners/login"), 1800);
    } catch (err: any) {
      setError(partnerError(err, "This reset link is invalid or has expired."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-gradient-to-b from-[#EAF3FA] to-white">
      <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          {done ? (
            <div className="text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
              <h1 className="mt-4 text-xl font-black text-[#12314d]">Password reset</h1>
              <p className="mt-2 text-sm text-slate-500">Redirecting you to sign in…</p>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-black text-[#12314d]">Choose a new password</h1>
              <form onSubmit={submit} className="mt-6 space-y-3">
                <input className={field} type="password" placeholder="New password (min 8 characters)" value={password} onChange={(e) => setPassword(e.target.value)} />
                <input className={field} type="password" placeholder="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
                <button type="submit" disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#264D73] px-5 py-3 text-sm font-black text-white hover:bg-[#1c3c5c] disabled:opacity-60">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Reset password
                </button>
              </form>
              <p className="mt-6 text-center text-xs text-slate-500">
                <Link href="/partners/login" className="font-bold text-[#264D73] hover:underline">Back to sign in</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
