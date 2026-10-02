import Link from "next/link";
import {
  ArrowRight, Download, LogIn, QrCode, Wallet, WifiOff, Languages, ShieldCheck,
  GraduationCap, Users, School, NotebookPen, CheckCircle2,
} from "lucide-react";
import { CountUp, Reveal } from "./motion";
import type { PlatformStats } from "@/lib/public-site";

/**
 * The landing hero.
 *
 * This is the first thing a head teacher sees, so it has one job: say what
 * EduIgnite is, show it is trusted, and offer exactly two next steps.
 *
 * Two rules govern what may appear here:
 *
 * 1. Nothing about any particular school, student or record. This is a public
 *    marketing page — a mocked-up report card with names, marks and positions
 *    reads as though real school data were on display, which is the opposite
 *    of the trust this platform sells. The panel therefore describes platform
 *    capabilities only.
 * 2. The only live figure shown is how many schools are on the platform.
 *
 * Visually the background is layered — an aurora wash, a grid masked to an
 * ellipse, and film grain — so nothing ends on a hard rectangular edge.
 */

/** Film grain — an inline SVG turbulence, so it costs no request. */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")";

const FADE_MASK =
  "radial-gradient(ellipse 80% 70% at 50% 40%, #000 45%, transparent 100%)";

/** What the platform does — general, and true of every school on it. */
const CAPABILITIES = [
  { icon: NotebookPen, title: "Report cards", note: "Marks, transcripts & records" },
  { icon: Wallet, title: "Fee receipts", note: "Issued automatically" },
  { icon: QrCode, title: "Authentication", note: "QR-verified documents" },
  { icon: ShieldCheck, title: "Security", note: "Role-based access" },
  { icon: Languages, title: "Bilingual", note: "English & French" },
  { icon: WifiOff, title: "Offline ready", note: "Keeps working without data" },
];

const PROOF = [
  { icon: WifiOff, label: "Works offline" },
  { icon: Languages, label: "English & French" },
  { icon: QrCode, label: "QR-verified documents" },
  { icon: ShieldCheck, label: "Role-based security" },
];

export function Hero({ stats }: { stats: PlatformStats | null }) {
  const schools = stats?.schools ?? 0;
  const hasSchools = schools > 0;

  return (
    <section className="relative isolate overflow-hidden">
      {/* ---- Background stack ---- */}
      <div
        className="absolute inset-0 -z-30"
        style={{ background: "linear-gradient(180deg, #E8F2FA 0%, #F3F9FD 48%, #FBFCFE 100%)" }}
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-0 -z-20 overflow-hidden" aria-hidden>
        <div className="absolute -left-48 -top-56 h-[38rem] w-[38rem] rounded-full bg-[#67D0E4]/30 blur-[110px]" />
        <div className="absolute -right-40 -top-24 h-[32rem] w-[32rem] rounded-full bg-[#264D73]/14 blur-[110px]" />
        <div className="absolute bottom-[-14rem] left-1/3 h-[30rem] w-[30rem] rounded-full bg-[#8FD9E8]/20 blur-[110px]" />
      </div>
      <div
        className="pointer-events-none absolute inset-0 -z-20"
        aria-hidden
        style={{
          backgroundImage:
            "linear-gradient(#264D73 1px, transparent 1px), linear-gradient(90deg, #264D73 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          opacity: 0.05,
          WebkitMaskImage: FADE_MASK,
          maskImage: FADE_MASK,
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.16] mix-blend-soft-light"
        aria-hidden
        style={{ backgroundImage: GRAIN }}
      />

      <div className="relative mx-auto grid w-full max-w-7xl items-center gap-14 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[1.06fr_0.94fr] lg:gap-12 lg:px-8 lg:pb-28 lg:pt-20">
        {/* ================= Left: the promise ================= */}
        <div>
          <Reveal>
            {/* The one live figure the public site shows. */}
            <Link
              href="/about"
              className="group inline-flex items-center gap-2.5 rounded-full border border-[#264D73]/12 bg-white/80 py-1.5 pl-2 pr-4 text-[13px] font-semibold text-[#264D73] shadow-[0_1px_2px_rgba(18,49,77,0.04),0_8px_24px_-12px_rgba(18,49,77,0.25)] backdrop-blur transition-colors hover:border-[#67D0E4]/50"
            >
              <span className="relative flex h-6 w-6 items-center justify-center rounded-full bg-[#67D0E4]/20">
                <span className="absolute inline-flex h-2 w-2 motion-safe:animate-ping rounded-full bg-[#22B8CF] opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#22B8CF]" />
              </span>
              {hasSchools ? (
                <>
                  <span className="font-black tabular-nums">{schools}</span>
                  {schools === 1 ? "school uses EduIgnite" : "schools use EduIgnite"}
                </>
              ) : (
                "Built for Cameroon schools"
              )}
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>

            <h1 className="mt-7 font-display text-[3.1rem] font-normal leading-[0.98] tracking-[-0.02em] text-[#0B1F33] sm:text-[4.2rem] lg:text-[4.9rem]">
              The school management
              <br className="hidden sm:block" /> system built for{" "}
              <span className="relative whitespace-nowrap italic">
                <span className="bg-gradient-to-br from-[#264D73] via-[#2f6d99] to-[#1A7F9C] bg-clip-text text-transparent">
                  Cameroon
                </span>
                <svg
                  className="absolute -bottom-2 left-0 h-[0.42em] w-full text-[#67D0E4]"
                  viewBox="0 0 200 16"
                  preserveAspectRatio="none"
                  fill="none"
                  aria-hidden
                >
                  <path
                    d="M2 11c38-6 78-8 120-6 26 1 50 4 76 7"
                    stroke="currentColor"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    opacity="0.55"
                  />
                </svg>
              </span>
            </h1>

            <p className="mt-7 max-w-xl text-[1.0625rem] leading-[1.75] text-slate-600 sm:text-lg">
              Run your entire school from one place: admissions, attendance, marks, report cards,
              fees and family messaging for students, teachers, parents and staff, on web,
              desktop and mobile. Built for how schools across Cameroon actually work.
            </p>

            {/* ---- Two next steps, no more ---- */}
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                href="/school-account-request"
                className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-[#12314d] px-7 py-4 text-[15px] font-bold text-white shadow-[0_1px_2px_rgba(18,49,77,0.2),0_16px_32px_-12px_rgba(18,49,77,0.55)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_1px_2px_rgba(18,49,77,0.2),0_22px_44px_-14px_rgba(18,49,77,0.6)] active:translate-y-0"
              >
                <span
                  className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full"
                  aria-hidden
                />
                Request a school account
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link
                href="/download"
                className="inline-flex items-center gap-2 rounded-full border border-[#264D73]/15 bg-white/80 px-7 py-4 text-[15px] font-bold text-[#264D73] backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:border-[#264D73]/30 hover:bg-white"
              >
                <Download className="h-4 w-4" /> Download the apps
              </Link>
            </div>

            <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-slate-500">
              Already have an account?
              <Link href="/login" className="inline-flex items-center gap-1 font-bold text-[#264D73] hover:underline">
                <LogIn className="h-3.5 w-3.5" /> Sign in
              </Link>
            </p>

            {/* ---- Proof strip ---- */}
            <div className="mt-10 border-t border-[#264D73]/10 pt-7">
              <div className="flex flex-wrap gap-x-7 gap-y-3">
                {PROOF.map(({ icon: Icon, label }) => (
                  <span key={label} className="inline-flex items-center gap-2 text-[13px] font-semibold text-slate-600">
                    <Icon className="h-4 w-4 text-[#264D73]" strokeWidth={1.9} />
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </Reveal>
        </div>

        {/* ============ Right: what the platform provides ============ */}
        <Reveal delay={140}>
          <div className="relative mx-auto w-full max-w-[30rem] lg:max-w-none">
            <div
              className="absolute -inset-8 -z-10 rounded-[3rem] bg-gradient-to-tr from-[#67D0E4]/25 via-transparent to-[#264D73]/15 blur-2xl"
              aria-hidden
            />

            <div className="relative rounded-[1.75rem] border border-white/70 bg-white/85 p-6 shadow-[0_2px_4px_rgba(18,49,77,0.04),0_32px_64px_-24px_rgba(18,49,77,0.35)] backdrop-blur-xl sm:p-7">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#0E7490]">
                    The platform
                  </p>
                  <p className="mt-1.5 font-serif text-xl font-bold text-[#12314d]">
                    Built into every school account
                  </p>
                </div>
                <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#12314d] text-white sm:flex">
                  <School className="h-5 w-5" strokeWidth={1.9} />
                </span>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3">
                {CAPABILITIES.map(({ icon: Icon, title, note }) => (
                  <div
                    key={title}
                    className="rounded-xl border border-slate-200/70 bg-white/80 p-4 transition-colors hover:border-[#67D0E4]/50"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#67D0E4]/15 text-[#264D73]">
                      <Icon className="h-[18px] w-[18px]" strokeWidth={1.9} />
                    </span>
                    <p className="mt-3 text-[13px] font-black leading-tight text-[#12314d]">{title}</p>
                    <p className="mt-1 text-[11px] leading-snug text-slate-500">{note}</p>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-5">
                <p className="text-[11px] font-semibold text-slate-500">
                  One account on web, desktop and mobile
                </p>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-[#264D73]">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#22B8CF]" /> Included
                </span>
              </div>
            </div>

            {/* The one live figure, as a floating badge. */}
            {hasSchools && (
              <div className="absolute -bottom-6 -right-3 hidden rounded-2xl border border-white/70 bg-[#12314d] px-5 py-3.5 text-white shadow-[0_2px_4px_rgba(18,49,77,0.2),0_24px_48px_-18px_rgba(18,49,77,0.6)] sm:block">
                <p className="font-serif text-3xl font-bold leading-none tabular-nums">
                  <CountUp value={schools} />
                </p>
                <p className="mt-1 text-[11px] font-semibold text-white/60">
                  {schools === 1 ? "school on EduIgnite" : "schools on EduIgnite"}
                </p>
              </div>
            )}
          </div>
        </Reveal>
      </div>

      {/* ---- Who it is for — closes the hero, opens the page ---- */}
      <div className="relative mx-auto w-full max-w-7xl px-4 pb-14 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center gap-5 border-t border-[#264D73]/10 pt-8 sm:flex-row sm:justify-center sm:gap-8">
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">
            One platform for
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-3">
            {[
              { icon: GraduationCap, label: "Students" },
              { icon: NotebookPen, label: "Teachers" },
              { icon: Users, label: "Parents" },
              { icon: School, label: "Administration" },
            ].map(({ icon: Icon, label }) => (
              <span key={label} className="inline-flex items-center gap-2 text-sm font-bold text-[#264D73]">
                <Icon className="h-[18px] w-[18px] text-[#67D0E4]" strokeWidth={2} />
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
