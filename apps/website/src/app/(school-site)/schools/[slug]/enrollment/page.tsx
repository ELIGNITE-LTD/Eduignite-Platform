import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EnrollmentForm } from "@/components/school-site/enrollment-form";
import { AccreditationBadge, PaymentInstructions, WhatsAppButton } from "@/components/school-site/higher-extras";
import { isHigherSchool } from "@/lib/school-site-higher";
import { EmptyState, PageBanner, SchoolSite } from "@/components/school-site/school-shell";
import { FORM_TEXT, fetchAdmissionAvailability, formText } from "@/lib/admissions";
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
  const wanted = (await props.searchParams).programme;
  const initialProgramme = typeof wanted === "string" ? wanted : undefined;
  const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB", { dateStyle: "long" }) : "");

  return (
    <SchoolSite
      school={school} lang={lang} active="enrollment" preview={preview}
      crumbs={[{ name: DICT[lang].enrollment, section: "enrollment" }]}
    >
      <PageBanner school={school} lang={lang} title={isHigherSchool(school) ? formText(lang, "higher").apply : t.apply} preview={preview} />
      {isHigherSchool(school) ? (
        <div className="mx-auto w-full max-w-6xl space-y-4 px-4 pt-10 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center gap-3">
            <WhatsAppButton school={school} lang={lang} className="he-btn-sm" />
            <AccreditationBadge school={school} lang={lang} />
          </div>
          <PaymentInstructions school={school} lang={lang} />
        </div>
      ) : null}
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        {availability.kind === "open" ? (
          <div className="grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <aside aria-labelledby="join-title">
              <h2 id="join-title" className="text-2xl font-bold text-blue-950">{isHigherSchool(school) ? (lang === "fr" ? "Rejoignez-nous" : "Join us") : t.joinTitle}</h2>
              <p className="mt-3 text-slate-600">{isHigherSchool(school) ? (lang === "fr" ? "Choisissez votre filière et remplissez le formulaire. Le service des admissions vous contacte après étude de votre dossier." : "Choose your programme and fill in the form. The admissions office contacts you after reviewing your application.") : t.heroLead}</p>
              {availability.config.intake_year ? (
                <p className="mt-3 text-sm font-semibold text-blue-900">{t.intake}: {availability.config.intake_year}</p>
              ) : null}
              <ul className="mt-6 space-y-3">
                {(isHigherSchool(school) ? (lang === "fr" ? ["Candidature simple, entièrement en ligne", "Un numéro de référence pour suivre votre dossier", "Réponse du service des admissions", "Un matricule vous est remis à l'admission"] : ["A simple, fully online application", "A reference number to follow your file", "A reply from the admissions office", "You receive a matricule once admitted"]) : t.benefits).map((b) => (
                  <li key={b} className="flex gap-3 text-slate-700">
                    <span aria-hidden className="mt-1 inline-block h-5 w-5 shrink-0 rounded-full bg-green-100 text-center text-xs font-bold leading-5 text-green-800">&#10003;</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </aside>
            <EnrollmentForm slug={school.slug} lang={lang} config={availability.config} initialProgramme={initialProgramme} />
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
