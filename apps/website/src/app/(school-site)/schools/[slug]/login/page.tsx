import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { GREEN_BUTTON, PageBanner, SchoolLogo, SchoolSite } from "@/components/school-site/school-shell";
import { DICT, schoolHref, schoolMetadata } from "@/lib/school-site";
import { loadSchool, type SchoolPageProps } from "@/lib/school-site-server";

export async function generateMetadata(props: SchoolPageProps): Promise<Metadata> {
  const loaded = await loadSchool(props);
  if (!loaded) return { title: "School not found", robots: { index: false, follow: false } };
  // A sign-in page has nothing to index.
  return schoolMetadata({ school: loaded.school, lang: loaded.lang, section: "login", label: DICT[loaded.lang].login, noIndex: true });
}

/**
 * School-branded entry to sign-in. It does not reimplement authentication: the
 * button hands over to the existing EduIgnite /login (which owns credentials,
 * activation and password reset), carrying the school's slug as context.
 */
export default async function SchoolLoginPage(props: SchoolPageProps) {
  const loaded = await loadSchool(props);
  if (!loaded) notFound();
  const { school, lang, preview } = loaded;
  const t = DICT[lang];
  const loginUrl = `/login?school=${encodeURIComponent(school.slug)}&next=${encodeURIComponent("/dashboard")}`;

  return (
    <SchoolSite school={school} lang={lang} active="login" preview={preview} crumbs={[{ name: t.login, section: "login" }]}>
      <PageBanner school={school} lang={lang} title={t.login} preview={preview} />
      <div className="mx-auto w-full max-w-md px-4 py-12 sm:px-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-md">
          <div className="flex justify-center"><SchoolLogo school={school} size={64} /></div>
          <p className="mt-3 font-bold text-blue-950">{school.name}</p>
          <h2 className="mt-6 text-xl font-bold text-blue-950">{t.loginTitle}</h2>
          <p className="mt-2 text-sm text-slate-600">{t.loginLead}</p>
          <Link href={loginUrl} className={`${GREEN_BUTTON} mt-6 w-full`}>{t.loginButton}</Link>
          <p className="mt-5 text-sm text-slate-600">{t.loginHelp}</p>
          <Link
            href={schoolHref(school, "", lang, preview)}
            className="mt-4 inline-block text-sm font-semibold text-blue-800 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
          >
            {t.backHome}
          </Link>
        </div>
      </div>
    </SchoolSite>
  );
}
