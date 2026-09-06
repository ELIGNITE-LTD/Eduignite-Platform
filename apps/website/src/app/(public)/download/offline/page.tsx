import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, Laptop, ShieldCheck, WifiOff, Lock, RefreshCw,
  School, Users, GraduationCap, CalendarDays, BookOpen, ClipboardCheck,
  NotebookPen, Archive, Wallet, Smartphone, QrCode, Server, CheckCircle2,
} from "lucide-react";
import { APPS, getAppWithLatestRelease } from "@/lib/public-site";

export const revalidate = 900;

export const metadata: Metadata = {
  title: "EduIgnite Offline — run your school with zero internet",
  description:
    "EduIgnite Offline is a Windows desktop app that runs a school's full day-to-day administration completely offline, free for the first year, with seamless migration to the cloud when you're ready.",
};

const MODULES = [
  { icon: School, title: "School Profile", desc: "Institutional data, academic years, active terms and localized settings." },
  { icon: Users, title: "Students", desc: "Registration, demographic profiles, historical records and automated promotion." },
  { icon: GraduationCap, title: "Teachers", desc: "Teacher registration, class-stream assignment and subject mappings." },
  { icon: CalendarDays, title: "Classes", desc: "Class structure, streams and active enrollment per stream." },
  { icon: BookOpen, title: "Subjects", desc: "Core curriculum subjects, class-subject requirements and teacher assignment." },
  { icon: ClipboardCheck, title: "Attendance", desc: "Daily attendance, history logs and automated attendance-rate reports." },
  { icon: NotebookPen, title: "Academic Records", desc: "CATs, exam grades, raw marks, averages, grade ranges and promotional eligibility." },
  { icon: Archive, title: "Report Cards", desc: "Automated end-of-term report cards, direct PDF generation and historical viewing." },
  { icon: Wallet, title: "Financial Management", desc: "Fee templates, payments, balances, receipts and local collection reports." },
];

const ACTIVATION_STEPS = [
  {
    title: "Desktop shows a QR challenge",
    desc: "The Offline Desktop app generates a short-lived, one-time QR code — a temporary cryptographic challenge, never a permanent secret.",
  },
  {
    title: "Companion app scans and contacts the server",
    desc: "Your school's technical admin scans the code with the EduIgnite Mobile app's Companion tools. The Companion app forwards the challenge to EduIgnite's licensing server over its own internet connection.",
  },
  {
    title: "Server issues a signed license, relayed back",
    desc: "The server verifies the request, signs a license tied to your School ID and that computer's hardware, and sends it back through the Companion app to the Desktop — unlocking full access.",
  },
];

export default async function OfflineDownloadPage() {
  const app = (await getAppWithLatestRelease("offline")) || APPS.find((a) => a.key === "offline")!;

  return (
    <>
      <section className="border-b border-slate-200 bg-gradient-to-b from-[#EAF3FA] to-white">
        <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
          <Link
            href="/download"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-[#264D73] hover:text-[#1c3c5c]"
          >
            <ArrowLeft className="h-4 w-4" /> All downloads
          </Link>

          <div className="mt-8 flex flex-col items-start gap-6 sm:flex-row sm:items-center">
            <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-[#264D73] text-white shadow-lg shadow-[#264D73]/20">
              <Laptop className="h-10 w-10" />
            </span>
            <div>
              <span className="rounded-full bg-[#67D0E4]/15 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-[#264D73]">
                {app.platform}
              </span>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-[#12314d] sm:text-4xl">{app.name}</h1>
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-600">{app.blurb}</p>
            </div>
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-medium text-slate-600">
            <span className="inline-flex items-center gap-1.5"><WifiOff className="h-4 w-4 text-[#264D73]" /> Zero internet required</span>
            <span className="inline-flex items-center gap-1.5"><Lock className="h-4 w-4 text-[#264D73]" /> Encrypted local database</span>
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-[#264D73]" /> Free for the first year</span>
          </div>
        </div>
      </section>

      {/* Download panel + install steps — same layout as the mobile/desktop pages */}
      <section className="bg-white py-14">
        <div className="mx-auto grid w-full max-w-5xl gap-8 px-4 sm:px-6 lg:grid-cols-5 lg:px-8">
          <div className="lg:col-span-3">
            <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
              <dl className="mb-6 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-[11px] font-black uppercase tracking-widest text-slate-400">Version</dt>
                  <dd className="mt-1 font-black text-[#264D73]">{app.version}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-black uppercase tracking-widest text-slate-400">Size</dt>
                  <dd className="mt-1 font-black text-[#264D73]">{app.size}</dd>
                </div>
                <div className="col-span-2 sm:col-span-2">
                  <dt className="text-[11px] font-black uppercase tracking-widest text-slate-400">Requires</dt>
                  <dd className="mt-1 font-semibold text-slate-700">{app.requirements}</dd>
                </div>
              </dl>

              <div className="rounded-2xl border border-[#264D73]/15 bg-[#EAF3FA] p-5">
                <p className="text-sm font-black text-[#264D73]">EduIgnite Offline is in the final stages of development</p>
                <p className="mt-1.5 text-xs font-medium text-slate-600">
                  The installer is not yet published. Request early access and we will let your school know the
                  moment it is ready to download.
                </p>
                <Link
                  href="/school-account-request"
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#264D73] px-6 py-3.5 text-sm font-black text-white shadow-lg shadow-[#264D73]/20 transition-colors hover:bg-[#1c3c5c] sm:w-auto"
                >
                  Request early access <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              <p className="mt-5 text-xs leading-relaxed text-slate-500">
                EduIgnite Offline is a separate product, not a replacement for the full cloud platform. Schools with
                reliable internet should use <Link href="/download/desktop" className="font-bold text-[#264D73] underline">EduIgnite Desktop</Link>{" "}
                or <Link href="/download/mobile" className="font-bold text-[#264D73] underline">EduIgnite Mobile</Link> instead.
              </p>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="rounded-3xl border border-slate-200 bg-[#F7F9FC] p-7">
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">How it works</p>
              <ol className="mt-4 space-y-4">
                {app.steps.map((step, i) => (
                  <li key={step} className="flex gap-3 text-sm leading-relaxed text-slate-700">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#264D73] text-[11px] font-black text-white">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
              <p className="mt-6 border-t border-slate-200 pt-5 text-xs leading-relaxed text-slate-500">
                Activation uses the EduIgnite Mobile app's Companion role — see how below.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Nine core offline modules */}
      <section className="bg-[#F7F9FC] py-16">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#67D0E4]">What runs locally</p>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-[#12314d] sm:text-3xl">
              Nine core modules, zero network calls
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              EduIgnite Offline focuses on what a school needs to run day to day — everything below works with the
              computer completely disconnected from the internet.
            </p>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {MODULES.map((m) => (
              <div key={m.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#264D73]/8 text-[#264D73]">
                  <m.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-base font-black text-[#12314d]">{m.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{m.desc}</p>
              </div>
            ))}
          </div>

          <p className="mx-auto mt-8 max-w-2xl text-center text-xs leading-relaxed text-slate-500">
            Collaborative and content-heavy features — online exams, online assignments, the digital library and
            connected learning — stay exclusive to the connected Full EduIgnite platform, and unlock immediately once
            a school migrates.
          </p>
        </div>
      </section>

      {/* QR-based activation */}
      <section className="bg-white py-16">
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#67D0E4]">Licensing, without a network</p>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-[#12314d] sm:text-3xl">
              QR-based activation with the Companion app
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              Because the Desktop app has no direct line to EduIgnite's servers, your school's technical admin bridges
              the gap using the EduIgnite Mobile app's Companion role and a QR code.
            </p>
          </div>

          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {ACTIVATION_STEPS.map((step, i) => (
              <div key={step.title} className="relative rounded-2xl border border-slate-200 bg-[#F7F9FC] p-6">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#264D73] text-sm font-black text-white">
                  {i + 1}
                </span>
                <span className="mt-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#67D0E4]/15 text-[#264D73]">
                  {i === 0 ? <Laptop className="h-5 w-5" /> : i === 1 ? <Smartphone className="h-5 w-5" /> : <Server className="h-5 w-5" />}
                </span>
                <h3 className="mt-4 text-base font-black text-[#12314d]">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{step.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 flex items-center justify-center gap-2 text-xs font-semibold text-slate-500">
            <QrCode className="h-4 w-4 text-[#264D73]" />
            Challenges expire after a few minutes and can only be used once — the same flow covers annual renewals.
          </div>
        </div>
      </section>

      {/* Migration to the cloud */}
      <section className="bg-[#12314d] py-16">
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#67D0E4]">Not a dead end</p>
              <h2 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-3xl">
                Seamless migration to the full cloud platform
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-white/70">
                When a school is ready for a stable internet connection, moving to the connected Full EduIgnite
                platform does not mean starting over. The school continues from exactly where it left off.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "Your School ID and every Student ID stay identical after migration.",
                  "Classes, subjects, marks, results and report cards keep their relationships intact.",
                  "Attendance history, academic records and financial ledgers move across in full — nothing is deleted or rebuilt.",
                ].map((item) => (
                  <li key={item} className="flex gap-2.5 text-sm leading-relaxed text-white/80">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#67D0E4]" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-7">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-[#67D0E4]">
                  <RefreshCw className="h-5 w-5" />
                </span>
                <p className="text-sm font-black text-white">One school, one continuous history</p>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-white/70">
                A school can start entirely offline, sync occasionally when a connection is available, or migrate
                fully to the cloud — at its own pace, without ever losing or fragmenting its records.
              </p>
              <Link
                href="/download"
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-black text-[#12314d] hover:bg-slate-100"
              >
                Compare all EduIgnite apps <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
