import Link from "next/link";
import { Download, Smartphone, Monitor, Globe, ShieldCheck, WifiOff, HelpCircle, ArrowRight, Laptop, QrCode, Wifi, PlugZap } from "lucide-react";
import { getAppsWithLatestReleases, type PublicApp } from "@/lib/public-site";

const APP_ICONS: Record<string, any> = { mobile: Smartphone, desktop: Monitor, web: Globe, offline: Laptop, companion: QrCode };

// Two different journeys, not one flat catalog: the always-online apps a
// school uses day to day, versus the two halves of the fully-offline
// setup (the desktop app that runs the school + the phone app that
// activates/renews its license). Grouping is purely presentational here —
// `public-site.ts`'s `APPS` array and its ordering are untouched.
const ONLINE_APP_KEYS: PublicApp["key"][] = ["mobile", "desktop", "web"];
const OFFLINE_APP_KEYS: PublicApp["key"][] = ["offline", "companion"];

// Release details are resolved on the server and shared across visitors, so
// the advertised build is correct on first paint.
export const revalidate = 900;

function formatReleaseDate(iso?: string) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function AppCard({ app }: { app: PublicApp & { publishedAt?: string } }) {
  const Icon = APP_ICONS[app.key];
  const isWeb = app.key === "web";
  const releasedOn = formatReleaseDate(app.publishedAt);

  return (
    <div className="flex flex-col rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#264D73]/8 text-[#264D73]">
          <Icon className="h-6 w-6" />
        </span>
        <span className="rounded-full bg-[#67D0E4]/15 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-[#264D73]">
          {app.platform}
        </span>
      </div>

      <h3 className="mt-5 text-xl font-black text-[#12314d]">{app.name}</h3>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">{app.blurb}</p>

      <dl className="mt-5 space-y-1.5 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Version</dt>
          <dd className="font-bold text-[#264D73]">{app.version}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Size</dt>
          <dd className="font-bold text-[#264D73]">{app.size}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Requires</dt>
          <dd className="text-right font-semibold text-slate-700">{app.requirements}</dd>
        </div>
        {releasedOn && (
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Updated</dt>
            <dd className="font-semibold text-slate-700">{releasedOn}</dd>
          </div>
        )}
      </dl>

      {isWeb ? (
        <Link
          href={app.href}
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-[#264D73] px-4 py-3.5 text-sm font-bold text-white transition-colors hover:bg-[#1c3c5c]"
        >
          {app.cta} <ArrowRight className="h-4 w-4" />
        </Link>
      ) : (
        <Link
          href={`/download/${app.key}`}
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-[#264D73] px-4 py-3.5 text-sm font-bold text-white transition-colors hover:bg-[#1c3c5c]"
        >
          <Download className="h-4 w-4" /> {app.cta}
        </Link>
      )}

      <div className="mt-6 border-t border-slate-100 pt-5">
        <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">How to install</p>
        <ol className="mt-3 space-y-2">
          {app.steps.map((step, i) => (
            <li key={step} className="flex gap-2.5 text-sm leading-relaxed text-slate-600">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#264D73]/8 text-[11px] font-black text-[#264D73]">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export default async function DownloadPage() {
  const apps = await getAppsWithLatestReleases();
  const onlineApps = ONLINE_APP_KEYS.map((key) => apps.find((app) => app.key === key)).filter(
    (app): app is (typeof apps)[number] => Boolean(app)
  );
  const offlineApps = OFFLINE_APP_KEYS.map((key) => apps.find((app) => app.key === key)).filter(
    (app): app is (typeof apps)[number] => Boolean(app)
  );

  return (
    <>
      <section className="border-b border-slate-200 bg-gradient-to-b from-[#EAF3FA] to-white">
        <div className="mx-auto w-full max-w-7xl px-4 py-16 text-center sm:px-6 lg:px-8 lg:py-20">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#67D0E4]">Downloads</p>
          <h1 className="mx-auto mt-3 max-w-3xl text-4xl font-black tracking-tight text-[#12314d] sm:text-5xl">
            Get EduIgnite on your devices
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-slate-600">
            Download the Windows app for the school office and the Android app for staff, students and parents — or
            simply open EduIgnite in your browser. Everything is free to download; you sign in with the account your
            school gives you.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-medium text-slate-600">
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-[#264D73]" /> Official builds</span>
            <span className="inline-flex items-center gap-1.5"><WifiOff className="h-4 w-4 text-[#264D73]" /> Works offline</span>
          </div>
        </div>
      </section>

      <section id="apps" className="scroll-mt-24 bg-white py-16">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.2em] text-[#67D0E4]">
              <Wifi className="h-3.5 w-3.5" /> Everyday use
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-[#12314d] sm:text-3xl">For your school's daily use</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">
              The always-online apps your school uses day to day — the phone app for staff, students and parents, the
              desktop app for the office, or simply the browser.
            </p>
          </div>

          <div className="mt-8 grid w-full gap-6 lg:grid-cols-3">
            {onlineApps.map((app) => (
              <AppCard key={app.key} app={app} />
            ))}
          </div>
        </div>
      </section>

      <section className="scroll-mt-24 bg-[#F7F9FC] py-16">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.2em] text-[#67D0E4]">
              <PlugZap className="h-3.5 w-3.5" /> Zero-internet setup
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-[#12314d] sm:text-3xl">For running fully offline</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">
              Two apps, one setup: <strong className="text-[#264D73]">EduIgnite Offline</strong> is the Windows desktop
              app that runs your whole school with zero internet, and{" "}
              <strong className="text-[#264D73]">EduIgnite Companion</strong> is the small Android app your admin uses
              to scan its QR code and activate or renew its license. Install both — the desktop app on the office
              computer, the Companion app on your admin's phone.
            </p>
          </div>

          <div className="mt-8 grid w-full gap-6 md:grid-cols-2">
            {offlineApps.map((app) => (
              <AppCard key={app.key} app={app} />
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="scroll-mt-24 bg-[#F7F9FC] py-16">
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-[#67D0E4]" />
            <h2 className="text-2xl font-black tracking-tight text-[#12314d]">Common questions</h2>
          </div>
          <div className="mt-7 space-y-4">
            {[
              {
                q: "Do I need an account to download?",
                a: "No. The apps are free to download. You need an account from your school to sign in and use them.",
              },
              {
                q: "How do I get an account?",
                a: "Your school administrator creates accounts for staff, students and parents. If your school is not yet on EduIgnite, use “Request a school account”.",
              },
              {
                q: "Windows says the installer is not recognised — is it safe?",
                a: "Yes. That warning appears for new publishers. Choose “More info”, then “Run anyway” to continue.",
              },
              {
                q: "Does it work without internet?",
                a: "Yes. The apps keep working offline and sync automatically once you are back online.",
              },
            ].map((item) => (
              <div key={item.q} className="rounded-2xl border border-slate-200 bg-white p-6">
                <p className="text-base font-black text-[#264D73]">{item.q}</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.a}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 rounded-2xl bg-[#12314d] px-7 py-8 text-center">
            <p className="text-lg font-black text-white">Not on EduIgnite yet?</p>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-white/70">
              Request an account for your school and we will set you up.
            </p>
            <Link
              href="/school-account-request"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-[#264D73] hover:bg-slate-50"
            >
              Request a school account <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
