"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Check, Copy, Handshake, LineChart, Loader2, LogOut, Share2, TrendingUp, Wallet,
} from "lucide-react";
import {
  clearPartnerSession, createInvestment, getPartnerSession, getReferralStats,
  listInvestments, type InvestmentInterest, type PartnerSession, type ReferralStats,
} from "@/lib/partner/client";

function money(n: number, currency = "XAF") {
  return `${Number(n || 0).toLocaleString()} ${currency}`;
}

export default function PartnerDashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<PartnerSession | null>(null);
  const [referral, setReferral] = useState<ReferralStats | null>(null);
  const [investments, setInvestments] = useState<InvestmentInterest[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [investBusy, setInvestBusy] = useState(false);
  const [investNote, setInvestNote] = useState("");

  const load = useCallback(async () => {
    try {
      const [ref, inv] = await Promise.all([getReferralStats(), listInvestments()]);
      setReferral(ref);
      setInvestments(inv);
    } catch (err: any) {
      if (err?.response?.status === 401) {
        clearPartnerSession();
        router.replace("/partners");
        return;
      }
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const s = getPartnerSession();
    if (!s) {
      router.replace("/partners");
      return;
    }
    setSession(s);
    load();
  }, [router, load]);

  const copyLink = async () => {
    if (!referral?.link) return;
    try {
      await navigator.clipboard.writeText(referral.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  };

  const logout = () => {
    clearPartnerSession();
    router.replace("/partners");
  };

  const submitInterest = async (e: React.FormEvent) => {
    e.preventDefault();
    setInvestNote("");
    const value = Number(amount);
    if (!value || value <= 0) {
      setInvestNote("Enter an amount greater than zero.");
      return;
    }
    setInvestBusy(true);
    try {
      const created = await createInvestment(value, message);
      setInvestments((prev) => [created, ...prev]);
      setAmount("");
      setMessage("");
      setInvestNote("Thank you — your interest is recorded. The EduIgnite team will contact you.");
    } catch (err: any) {
      setInvestNote(err?.message || "Could not record your interest.");
    } finally {
      setInvestBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#264D73]/50" />
      </div>
    );
  }

  const waText = referral
    ? `Join EduIgnite — the school management system built for Cameroon. Request your school account here: ${referral.link}`
    : "";

  return (
    <section className="bg-gradient-to-b from-[#EAF3FA] to-white">
      <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#67D0E4]/40 bg-[#67D0E4]/10 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-[#0E7490]">
              <Handshake className="h-3.5 w-3.5" /> Partner dashboard
            </span>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-[#12314d] sm:text-3xl">
              Welcome{session?.user?.name ? `, ${session.user.name.split(" ")[0]}` : ""}
            </h1>
          </div>
          <button
            onClick={logout}
            className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 hover:border-slate-300 hover:text-[#264D73]"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>

        {/* Earnings stat row */}
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <StatCard tone="primary" icon={<Wallet className="h-5 w-5" />} label="Earned" value={money(referral?.earned ?? 0, referral?.currency)} note="For schools set up" />
          <StatCard tone="cyan" icon={<TrendingUp className="h-5 w-5" />} label="In progress" value={money(referral?.in_progress_value ?? 0, referral?.currency)} note={`${referral?.in_progress ?? 0} introduction(s) working through`} />
          <StatCard tone="slate" icon={<LineChart className="h-5 w-5" />} label="Schools referred" value={String(referral?.total ?? 0)} note={`${referral?.processed ?? 0} set up · ${referral?.pending ?? 0} awaiting`} />
        </div>

        {/* Referral link */}
        <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-[#264D73]" />
            <h2 className="text-lg font-black text-[#12314d]">Your referral link</h2>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Share this link. When a school you introduce is set up on EduIgnite, you earn{" "}
            <span className="font-black text-[#264D73]">{money(referral?.reward_per_school ?? 0, referral?.currency)}</span>.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              readOnly
              value={referral?.link ?? ""}
              className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-mono text-slate-700"
            />
            <div className="flex gap-2">
              <button
                onClick={copyLink}
                className="inline-flex items-center gap-2 rounded-xl bg-[#264D73] px-4 py-3 text-sm font-bold text-white hover:bg-[#1c3c5c]"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy"}
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(waText)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-green-500 px-4 py-3 text-sm font-bold text-green-600 hover:bg-green-50"
              >
                Share
              </a>
            </div>
          </div>
          <p className="mt-3 text-[11px] font-mono uppercase tracking-widest text-slate-400">Code: {referral?.code}</p>
        </div>

        {/* Invest */}
        <div className="mt-6 grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-[#264D73]" />
              <h2 className="text-lg font-black text-[#12314d]">Invest in EduIgnite</h2>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              Register your interest in investing. No money is collected here — the EduIgnite team will reach out to
              discuss and arrange it with you directly.
            </p>
            <form onSubmit={submitInterest} className="mt-4 space-y-3">
              <input
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Amount you're considering (XAF)"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-[#264D73] focus:outline-none focus:ring-2 focus:ring-[#264D73]/20"
              />
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Anything you'd like to add (optional)"
                className="w-full min-h-24 rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-[#264D73] focus:outline-none focus:ring-2 focus:ring-[#264D73]/20"
              />
              {investNote && <p className="text-sm font-semibold text-[#0E7490]">{investNote}</p>}
              <button
                type="submit"
                disabled={investBusy}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#264D73] px-5 py-3 text-sm font-black text-white hover:bg-[#1c3c5c] disabled:opacity-60"
              >
                {investBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
                Register interest
              </button>
            </form>
          </div>

          <div className="lg:col-span-2 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-black text-[#12314d]">Your interests</h2>
            <div className="mt-4 space-y-3">
              {investments.length === 0 ? (
                <p className="text-sm text-slate-500">No investment interests yet.</p>
              ) : (
                investments.map((i) => (
                  <div key={i.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-black text-[#264D73]">{money(Number(i.amount), i.currency)}</span>
                      <span className="rounded-full bg-[#264D73]/10 px-2 py-0.5 text-[10px] font-black uppercase text-[#264D73]">{i.status}</span>
                    </div>
                    {i.message && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{i.message}</p>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Monitor breakdown */}
        <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-black text-[#12314d]">Referral monitor</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Mini label="Total referred" value={referral?.total ?? 0} />
            <Mini label="Awaiting contact" value={referral?.pending ?? 0} />
            <Mini label="In conversation" value={referral?.contacted ?? 0} />
            <Mini label="Set up (paid)" value={referral?.processed ?? 0} tone="green" />
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Earnings for {referral?.year} are paid after {referral?.paid_after}. A referral counts once the school is
            actually set up on EduIgnite.
          </p>
        </div>

        <p className="mt-8 text-center text-xs text-slate-400">
          <Link href="/" className="font-bold text-[#264D73] hover:underline">Back to eduignite.online</Link>
        </p>
      </div>
    </section>
  );
}

function StatCard({ icon, label, value, note, tone }: { icon: React.ReactNode; label: string; value: string; note: string; tone: "primary" | "cyan" | "slate" }) {
  const tones: Record<string, string> = {
    primary: "bg-[#264D73] text-white",
    cyan: "bg-[#67D0E4]/15 text-[#0E7490]",
    slate: "bg-slate-100 text-slate-700",
  };
  const isDark = tone === "primary";
  return (
    <div className={`rounded-3xl p-5 shadow-sm ${isDark ? "bg-[#12314d] text-white" : "border border-slate-200 bg-white"}`}>
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${isDark ? "bg-white/10 text-white" : tones[tone]}`}>{icon}</span>
      <p className={`mt-3 text-2xl font-black ${isDark ? "text-white" : "text-[#12314d]"}`}>{value}</p>
      <p className={`mt-1 text-[11px] font-black uppercase tracking-widest ${isDark ? "text-white/60" : "text-slate-400"}`}>{label}</p>
      <p className={`mt-1 text-xs ${isDark ? "text-white/70" : "text-slate-500"}`}>{note}</p>
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: number; tone?: "green" }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 text-center">
      <p className={`text-2xl font-black ${tone === "green" ? "text-green-600" : "text-[#264D73]"}`}>{value}</p>
      <p className="mt-1 text-[11px] font-semibold text-slate-500">{label}</p>
    </div>
  );
}
