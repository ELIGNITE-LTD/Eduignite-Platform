import Link from "next/link";
import { ArrowLeft, Monitor, ShieldCheck, Smartphone, WifiOff } from "lucide-react";
import { getAppWithLatestRelease, SETUP_GUIDE, type PublicApp } from "@/lib/public-site";
import { AppDownload } from "@/components/public/app-download";
import { JsonLd } from "@/components/public/json-ld";
import { formatBytes } from "@/lib/releases";
import { SITE_URL } from "@/lib/seo";

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
  const release = app.release;
  const older = app.olderReleases ?? [];
  const isAndroid = appKey === "mobile";

  // Only real, published data goes into structured data: no release, no version or download URL.
  const softwareSchema = release
    ? {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: app.name,
        applicationCategory: "EducationalApplication",
        operatingSystem: isAndroid ? "Android 7.0+" : "Windows 10, Windows 11",
        softwareVersion: release.version,
        downloadUrl: `${SITE_URL}/download/${appKey}`,
        fileSize: formatBytes(release.sizeBytes) ?? undefined,
        dateModified: release.builtAt ?? undefined,
      }
    : null;

  return (
    <>
      {softwareSchema && <JsonLd data={softwareSchema} />}
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
                  <dt className="text-[11px] font-black uppercase tracking-widest text-slate-500">Version</dt>
                  <dd className="mt-1 font-black text-[#264D73]">{app.version}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-black uppercase tracking-widest text-slate-500">Size</dt>
                  <dd className="mt-1 font-black text-[#264D73]">{app.size}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-black uppercase tracking-widest text-slate-500">Requires</dt>
                  <dd className="mt-1 font-semibold text-slate-700">{app.requirements}</dd>
                </div>
                {releasedOn && (
                  <div>
                    <dt className="text-[11px] font-black uppercase tracking-widest text-slate-500">Updated</dt>
                    <dd className="mt-1 font-semibold text-slate-700">{releasedOn}</dd>
                  </div>
                )}
              </dl>

              {!release && (
                <p className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                  Latest build coming soon. The download below is the last published version.
                </p>
              )}
              {release?.sha256 && (
                <p className="mb-5 break-all text-xs text-slate-500">
                  <span className="font-black uppercase tracking-widest">SHA-256</span>{" "}
                  <code className="font-mono text-[11px] text-slate-700">{release.sha256}</code>
                </p>
              )}

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
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">How to install</p>
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

      <section className="bg-[#F7F9FC] py-12">
        <div className="mx-auto grid w-full max-w-5xl gap-8 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
          <div className="rounded-3xl border border-slate-200 bg-white p-7">
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">
              What&apos;s new{release ? ` in ${release.version}` : ""}
            </p>
            {release && release.notes.length > 0 ? (
              <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-700">
                {release.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-slate-600">Release notes appear here with the next published build.</p>
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-7 text-sm leading-relaxed text-slate-700">
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Good to know</p>
              {isAndroid ? (
                <ul className="mt-4 list-disc space-y-2 pl-5">
                  <li>Needs Android 7.0 or newer. Installed from this page, so Android will ask you to allow installs from your browser once.</li>
                  <li>The app is signed by EduIgnite. Check the SHA-256 above if you want to verify the file.</li>
                  <li>
                    iPhone and iPad: there is no App Store app. Open EduIgnite in Safari and use Share, then &ldquo;Add to Home
                    Screen&rdquo;.
                  </li>
                </ul>
              ) : (
                <ul className="mt-4 list-disc space-y-2 pl-5">
                  <li>Needs Windows 10 or 11 (64-bit).</li>
                  <li>
                    The installer is not yet code-signed, so Windows SmartScreen may show &ldquo;Windows protected your PC&rdquo;.
                    Choose &ldquo;More info&rdquo;, then &ldquo;Run anyway&rdquo;. Compare the SHA-256 above if you want to verify the file.
                  </li>
                  <li>Once installed, the app updates itself.</li>
                </ul>
              )}
            </div>

            {older.length > 0 && (
              <div className="rounded-3xl border border-slate-200 bg-white p-7">
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Older versions</p>
                <ul className="mt-4 space-y-2 text-sm">
                  {older.map((o) => (
                    <li key={o.version} className="flex flex-wrap items-center justify-between gap-2">
                      <a href={o.url} className="font-bold text-[#264D73] underline">
                        {o.version}
                      </a>
                      <span className="text-xs text-slate-500">
                        {[formatReleaseDate(o.builtAt ?? undefined), formatBytes(o.sizeBytes)].filter(Boolean).join(" · ")}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
