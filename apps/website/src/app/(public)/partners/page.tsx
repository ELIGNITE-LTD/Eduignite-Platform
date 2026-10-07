"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Handshake, Loader2, Share2, TrendingUp, LineChart, Wallet } from "lucide-react";
import { getPartnerSession, loginPartner, registerPartner } from "@/lib/partner/client";

const BENEFITS = [
  { icon: Share2, title: "Refer schools", note: "Share your link; introduce schools to EduIgnite." },
  { icon: Wallet, title: "Earn commission", note: "Earn 20,000 XAF for every school that gets set up." },
  { icon: TrendingUp, title: "Invest", note: "Register your interest in backing EduIgnite's growth." },
  { icon: LineChart, title: "Monitor", note: "Track your referrals and earnings from one dashboard." },
];

export default function PartnersLandingPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("register");
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "", organization: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Already signed in as a partner → go straight to the dashboard.
  useEffect(() => {
    if (getPartnerSession()) router.replace("/partners/dashboard");
  }, [router]);

  const set = (k: keyof typeof form, v: string) => setForm((prev) => ({ ...prev, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.email.trim() || !form.password) {
      setError("Enter your email and password.");
      return;
    }
    if (mode === "register" && !form.name.trim()) {
      setError("Enter your name.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "register") {
        await registerPartner({
          name: form.name,
          email: form.email,
          password: form.password,
          phone: form.phone,
          organization: form.organization,
        });
      } else {
        await loginPartner(form.email, form.password);
      }
      router.replace("/partners/dashboard");
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const field =
    "w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-[#264D73] focus:outline-none focus:ring-2 focus:ring-[#264D73]/20";

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-[#EAF3FA] to-white">
      <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8 lg:py-20">
        {/* Left — the pitch */}
        <div>
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-bold text-[#264D73] hover:underline">
            <ArrowLeft className="h-4 w-4" /> Back to home
          </Link>
          <span className="mt-8 inline-flex items-center gap-2 rounded-full border border-[#67D0E4]/40 bg-[#67D0E4]/10 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-[#0E7490]">
            <Handshake className="h-3.5 w-3.5" /> Partner programme
          </span>
          <h1 className="mt-4 text-4xl font-black tracking-tight text-[#12314d] sm:text-5xl">
            Partner with EduIgnite
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
            Introduce schools to EduIgnite and earn for every one that joins, register your interest in investing,
            and track everything from your own partner dashboard.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {BENEFITS.map(({ icon: Icon, title, note }) => (
              <div key={title} className="rounded-2xl border border-slate-200 bg-white/80 p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#264D73]/8 text-[#264D73]">
                  <Icon className="h-5 w-5" />
                </span>
                <p className="mt-3 text-sm font-black text-[#12314d]">{title}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{note}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right — auth card */}
        <div className="lg:pl-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex rounded-xl bg-slate-100 p-1">
              {(["register", "login"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setMode(m); setError(""); }}
                  className={`flex-1 rounded-lg py-2 text-sm font-black transition-colors ${
                    mode === m ? "bg-white text-[#264D73] shadow-sm" : "text-slate-500 hover:text-[#264D73]"
                  }`}
                >
                  {m === "register" ? "Create account" : "Sign in"}
                </button>
              ))}
            </div>

            <form onSubmit={submit} className="mt-6 space-y-3">
              {mode === "register" && (
                <>
                  <input className={field} placeholder="Full name *" value={form.name} onChange={(e) => set("name", e.target.value)} />
                  <input className={field} placeholder="Organization (optional)" value={form.organization} onChange={(e) => set("organization", e.target.value)} />
                  <input className={field} placeholder="Phone (optional)" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
                </>
              )}
              <input className={field} type="email" placeholder="Email *" value={form.email} onChange={(e) => set("email", e.target.value)} />
              <input className={field} type="password" placeholder="Password *" value={form.password} onChange={(e) => set("password", e.target.value)} />

              {error && <p className="text-sm font-semibold text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={busy}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#264D73] px-5 py-3.5 text-sm font-black text-white transition-colors hover:bg-[#1c3c5c] disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Handshake className="h-4 w-4" />}
                {mode === "register" ? "Create partner account" : "Sign in to dashboard"}
              </button>
            </form>

            <p className="mt-4 text-center text-xs text-slate-500">
              {mode === "register" ? "Already a partner? " : "New here? "}
              <button
                type="button"
                onClick={() => { setMode(mode === "register" ? "login" : "register"); setError(""); }}
                className="font-bold text-[#264D73] hover:underline"
              >
                {mode === "register" ? "Sign in" : "Create an account"}
              </button>
            </p>
            <p className="mt-4 border-t border-slate-100 pt-4 text-center text-[11px] leading-relaxed text-slate-400">
              A partner account is separate from a school account. Investing is by expression of interest — no funds
              are collected here; the EduIgnite team follows up with you directly.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
