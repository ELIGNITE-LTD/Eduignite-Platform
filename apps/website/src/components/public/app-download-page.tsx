import Link from "next/link";
import { ArrowLeft, Monitor, ShieldCheck, Smartphone, WifiOff } from "lucide-react";
import { getAppWithLatestRelease, SETUP_GUIDE, type PublicApp } from "@/lib/public-site";
import { AppDownload } from "@/components/public/app-download";

const ICONS = { mobile: Smartphone, desktop: Monitor } as const;

function formatReleaseDate(iso?: string) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * A dedicated, focused download page for a single app (mobile or desktop):
 * the app front and centre, a real progress bar while it downloads, the setup
 * steps, and a prompt to grab the account-setup PDF guide.
 */
export async function AppDownloadPage({ appKey }: { appKey: "mobile" | "desktop" }) {
  const app: PublicApp | null = await getAppWithLatestRelease(appKey);
  if (!app) {
    return (
      <section className="mx-auto max-w-2xl px-4 py-24 text-center">
        <h1 className="text-2xl font-black text-[#12314d]">This download is unavailable</h1>
        <Link href="/download" className="mt-4 inline-block font-bold text-[#264D73] underline">
          Back to downloads
        </Link>
      </section>
    );
  }

  const Icon = ICONS[appKey];
  const releasedOn = formatReleaseDate(app.publishedAt);

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
              <Icon className="h-10 w-10" />
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
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-[#264D73]" /> Official build</span>
            <span className="inline-flex items-center gap-1.5"><WifiOff className="h-4 w-4 text-[#264D73]" /> Works offline</span>
          </div>
        </div>
      </section>

      <section className="bg-white py-14">
        <div className="mx-auto grid w-full max-w-5xl gap-8 px-4 sm:px-6 lg:grid-cols-5 lg:px-8">
          {/* Download panel */}
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
                <div>
                  <dt className="text-[11px] font-black uppercase tracking-widest text-slate-400">Requires</dt>
                  <dd className="mt-1 font-semibold text-slate-700">{app.requirements}</dd>
                </div>
                {releasedOn && (
                  <div>
                    <dt className="text-[11px] font-black uppercase tracking-widest text-slate-400">Updated</dt>
                    <dd className="mt-1 font-semibold text-slate-700">{releasedOn}</dd>
                  </div>
                )}
              </dl>

              <AppDownload
                appKey={appKey}
                cta={app.cta}
                size={app.size}
                guide={{ href: SETUP_GUIDE.href, name: SETUP_GUIDE.name, size: SETUP_GUIDE.size }}
              />
            </div>
          </div>

          {/* Install steps */}
          <div className="lg:col-span-2">
            <div className="rounded-3xl border border-slate-200 bg-[#F7F9FC] p-7">
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">How to install</p>
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
                {SETUP_GUIDE.blurb}
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
