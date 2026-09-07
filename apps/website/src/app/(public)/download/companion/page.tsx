import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, QrCode, ShieldCheck, Smartphone, WifiOff,
  Laptop, Server, CheckCircle2,
} from "lucide-react";
import { APPS, getAppWithLatestRelease } from "@/lib/public-site";

export const revalidate = 900;

export const metadata: Metadata = {
  title: "EduIgnite Companion — activate EduIgnite Offline, without the full app",
  description:
    "EduIgnite Companion is a small standalone Android app for a school's technical admin: scan EduIgnite Offline's QR code to activate or renew its license, with no need to install the full EduIgnite Mobile app.",
};

const ACTIVATION_STEPS = [
  {
    title: "Desktop shows a QR challenge",
    desc: "The Offline Desktop app generates a short-lived, one-time QR code — a temporary cryptographic challenge, never a permanent secret.",
    icon: Laptop,
  },
  {
    title: "Companion scans and contacts the server",
    desc: "Your school's technical admin scans the code with EduIgnite Companion. The app forwards the challenge to EduIgnite's licensing server over its own internet connection.",
    icon: Smartphone,
  },
  {
    title: "Server issues a signed license, relayed back",
    desc: "The server verifies the request, signs a license tied to your School ID and that computer's hardware, and sends it back through Companion to the Desktop — unlocking full access.",
    icon: Server,
  },
];

export default async function CompanionDownloadPage() {
  const app = (await getAppWithLatestRelease("companion")) || APPS.find((a) => a.key === "companion")!;

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
              <QrCode className="h-10 w-10" />
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
            <span className="inline-flex items-center gap-1.5"><QrCode className="h-4 w-4 text-[#264D73]" /> One-tap QR activation</span>
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-[#264D73]" /> Nothing else to set up</span>
          </div>
        </div>
      </section>

      {/* Download panel + install steps — same "coming soon" honesty as EduIgnite Offline */}
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

              {app.isLive ? (
                <a
                  href={app.href}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#264D73] px-6 py-3.5 text-sm font-black text-white shadow-lg shadow-[#264D73]/20 transition-colors hover:bg-[#1c3c5c] sm:w-auto"
                >
                  Download for Android <ArrowRight className="h-4 w-4" />
                </a>
              ) : (
                <div className="rounded-2xl border border-[#264D73]/15 bg-[#EAF3FA] p-5">
                  <p className="text-sm font-black text-[#264D73]">EduIgnite Companion is being built alongside EduIgnite Offline</p>
                  <p className="mt-1.5 text-xs font-medium text-slate-600">
                    The app is not yet published. Until it is, your school's technical admin can activate or renew
                    EduIgnite Offline using the Companion tools already built into{" "}
                    <Link href="/download/mobile" className="font-bold text-[#264D73] underline">EduIgnite Mobile</Link>.
                  </p>
                  <Link
                    href="/school-account-request"
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#264D73] px-6 py-3.5 text-sm font-black text-white shadow-lg shadow-[#264D73]/20 transition-colors hover:bg-[#1c3c5c] sm:w-auto"
                  >
                    Request early access <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              )}

              <p className="mt-5 text-xs leading-relaxed text-slate-500">
                EduIgnite Companion is a separate, smaller app — not a replacement for{" "}
                <Link href="/download/mobile" className="font-bold text-[#264D73] underline">EduIgnite Mobile</Link>. If your
                technical admin already has the full Mobile app installed, they don't need Companion too: Mobile's
                built-in Companion tools do the exact same job.
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
                Only your school's technical admin needs this app — students, teachers and parents should download{" "}
                <Link href="/download/mobile" className="font-bold text-[#264D73] underline">EduIgnite Mobile</Link> instead.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Why a separate app exists */}
      <section className="bg-[#F7F9FC] py-16">
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#67D0E4]">Why a separate app</p>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-[#12314d] sm:text-3xl">
              One job, nothing extra to install
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              EduIgnite Mobile already includes Companion tools for scanning EduIgnite Offline's QR codes. EduIgnite
              Companion does the same single job, on its own — for schools whose technical admin isn't a student,
              teacher or parent, and would rather not install the full Mobile app just to activate a license.
            </p>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#264D73]/8 text-[#264D73]">
                <Smartphone className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-base font-black text-[#12314d]">Already have EduIgnite Mobile?</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                You do not need Companion as well. Open the Companion tools inside EduIgnite Mobile and scan the
                Offline Desktop app's QR code exactly the same way.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#264D73]/8 text-[#264D73]">
                <QrCode className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-base font-black text-[#12314d]">Only need to activate a license?</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                EduIgnite Companion is the lighter option — a technical admin who has no other reason to use EduIgnite
                Mobile can install just this instead.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* QR-based activation, mirrored from the Offline page */}
      <section className="bg-white py-16">
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#67D0E4]">Licensing, without a network</p>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-[#12314d] sm:text-3xl">
              QR-based activation and renewal
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              Because the Offline Desktop app has no direct line to EduIgnite's servers, your school's technical admin
              bridges the gap using Companion and a QR code.
            </p>
          </div>

          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {ACTIVATION_STEPS.map((step, i) => (
              <div key={step.title} className="relative rounded-2xl border border-slate-200 bg-[#F7F9FC] p-6">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#264D73] text-sm font-black text-white">
                  {i + 1}
                </span>
                <span className="mt-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#67D0E4]/15 text-[#264D73]">
                  <step.icon className="h-5 w-5" />
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

      {/* Cross-link back to the platform */}
      <section className="bg-[#12314d] py-16">
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#67D0E4]">Not a new platform</p>
              <h2 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-3xl">
                Just a smaller way to do one job
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-white/70">
                EduIgnite Companion does not replace any part of the platform — it only activates and renews
                EduIgnite Offline licenses. Everything else your school needs still lives in EduIgnite Mobile,
                Desktop or Web.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "Students, teachers and parents should use EduIgnite Mobile, not Companion.",
                  "Companion is only useful to schools running EduIgnite Offline.",
                  "Installing both apps is never required — Mobile's built-in Companion tools cover the same activation flow.",
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
                  <WifiOff className="h-5 w-5" />
                </span>
                <p className="text-sm font-black text-white">Built for schools with no reliable internet</p>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-white/70">
                Companion exists because EduIgnite Offline runs on a computer with no internet connection at all.
                Someone still needs a phone with internet, once a year, to keep the license current — that is the
                entire job this app does.
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
