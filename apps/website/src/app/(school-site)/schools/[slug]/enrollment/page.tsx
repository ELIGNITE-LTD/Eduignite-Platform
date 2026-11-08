import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EnrollmentForm } from "@/components/school-site/enrollment-form";
import { EmptyState, PageBanner, SchoolSite } from "@/components/school-site/school-shell";
import { FORM_TEXT, fetchAdmissionAvailability } from "@/lib/admissions";
import { DICT, schoolMetadata } from "@/lib/school-site";
import { loadSchool, type SchoolPageProps } from "@/lib/school-site-server";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: SchoolPageProps): Promise<Metadata> {
  const loaded = await loadSchool(props);
  if (!loaded || !loaded.school.enrollment_enabled) {
    return { title: "School not found", robots: { index: false, follow: false } };
  }
  return schoolMetadata({
    school: loaded.school, lang: loaded.lang, section: "enrollment", label: FORM_TEXT[loaded.lang].apply,
  });
}

/** The real admission form. Fields, classes and consent text come from the school's own configuration. */
export default async function EnrollmentPage(props: SchoolPageProps) {
  const loaded = await loadSchool(props);
  if (!loaded || !loaded.school.enrollment_enabled) notFound();
  const { school, lang, preview } = loaded;
  const t = FORM_TEXT[lang];
  const availability = await fetchAdmissionAvailability(school.slug, lang);
  const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB", { dateStyle: "long" }) : "");

  return (
    <SchoolSite
      school={school} lang={lang} active="enrollment" preview={preview}
      crumbs={[{ name: DICT[lang].enrollment, section: "enrollment" }]}
    >
      <PageBanner school={school} lang={lang} title={t.apply} preview={preview} />
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        {availability.kind === "open" ? (
          <div className="grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <aside aria-labelledby="join-title">
              <h2 id="join-title" className="text-2xl font-bold text-blue-950">{t.joinTitle}</h2>
              <p className="mt-3 text-slate-600">{t.heroLead}</p>
              {availability.config.intake_year ? (
                <p className="mt-3 text-sm font-semibold text-blue-900">{t.intake}: {availability.config.intake_year}</p>
              ) : null}
              <ul className="mt-6 space-y-3">
                {t.benefits.map((b) => (
                  <li key={b} className="flex gap-3 text-slate-700">
                    <span aria-hidden className="mt-1 inline-block h-5 w-5 shrink-0 rounded-full bg-green-100 text-center text-xs font-bold leading-5 text-green-800">&#10003;</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </aside>
            <EnrollmentForm slug={school.slug} lang={lang} config={availability.config} />
          </div>
        ) : availability.kind === "closed" ? (
          <EmptyState
            title={t.closedTitle}
            text={
              availability.reason === "not_yet_open" && availability.opens_on
                ? t.opens(fmt(availability.opens_on))
                : availability.closes_on ? t.closes(fmt(availability.closes_on)) : t.closedText
            }
          />
        ) : (
          <EmptyState title={t.unavailableTitle} text={t.unavailableText} />
        )}
      </div>
    </SchoolSite>
  );
}
