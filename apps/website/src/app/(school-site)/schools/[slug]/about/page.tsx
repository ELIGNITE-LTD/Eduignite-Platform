import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageBanner, SchoolSite } from "@/components/school-site/school-shell";
import { LeaderCard } from "@/components/school-site/leader-card";
import { buildLeadership, fetchPublicSchoolStaff, pickText, pickValues } from "@/lib/public-schools";
import { fetchConfiguredLeadership } from "@/lib/school-blog";
import { DICT, schoolMetadata } from "@/lib/school-site";
import { isHigherSchool, tFor } from "@/lib/school-site-higher";
import { loadSchool, type SchoolPageProps } from "@/lib/school-site-server";

export async function generateMetadata(props: SchoolPageProps): Promise<Metadata> {
  const loaded = await loadSchool(props);
  if (!loaded) return { title: "School not found", robots: { index: false, follow: false } };
  const { school, lang } = loaded;
  return schoolMetadata({
    school,
    lang,
    section: "about",
    label: DICT[lang].about,
    description: pickText(school.mission, lang) || pickText(school.vision, lang) || undefined,
  });
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-blue-950">{title}</h2>
      <div className="mt-3 leading-7 text-slate-700">{children}</div>
    </section>
  );
}

export default async function SchoolAboutPage(props: SchoolPageProps) {
  const loaded = await loadSchool(props);
  if (!loaded) notFound();
  const { school, lang, preview } = loaded;
  const t = tFor(school, lang);
  const higher = isHigherSchool(school);

  const directory = await fetchPublicSchoolStaff(school.slug);
  // The leadership the school configured wins; otherwise the list is derived from the principal and the opt-in directory.
  const configured = await fetchConfiguredLeadership(school.slug, lang);
  const { leaders, team } = buildLeadership(configured.length ? { ...school, leadership: configured } : school, directory.enabled ? directory.staff : []);
  const [top, ...others] = leaders;

  const description = pickText(school.description, lang);
  const motto = pickText(school.motto, lang);
  const vision = pickText(school.vision, lang);
  const mission = pickText(school.mission, lang);
  const history = pickText(school.history, lang);
  const values = pickValues(school.values, lang);
  const hasIdentity = description || motto || vision || mission || history || values.length > 0;

  const facts = [
    school.founded_year ? [t.founded, String(school.founded_year)] : null,
    school.school_type ? [t.schoolType, school.school_type] : null,
    school.subsystem ? [t.subsystem, school.subsystem] : null,
  ].filter(Boolean) as [string, string][];

  return (
    <SchoolSite school={school} lang={lang} active="about" preview={preview} crumbs={[{ name: t.about, section: "about" }]}>
      <PageBanner school={school} lang={lang} title={t.aboutUs} preview={preview} />

      <div className="mx-auto w-full max-w-6xl space-y-14 px-4 py-12 sm:px-6 lg:px-8">
        <section id="identity" className="scroll-mt-28" aria-labelledby="identity-h">
          <h2 id="identity-h" className="text-2xl font-bold text-blue-950">{t.identity}</h2>
          {hasIdentity ? (
            <div className="mt-6 space-y-6">
              {description ? <p className="max-w-3xl whitespace-pre-line leading-7 text-slate-700">{description}</p> : null}
              {facts.length > 0 ? (
                <dl className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
                  {facts.map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</dt>
                      <dd className="font-semibold text-blue-950">{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {motto ? (
                <p className="border-l-4 border-green-600 pl-4 text-lg italic text-blue-950">
                  <span className="sr-only">{t.motto}: </span>&ldquo;{motto}&rdquo;
                </p>
              ) : null}
              <div id="vision" className="grid scroll-mt-28 gap-4 md:grid-cols-3">
                {vision ? <Block title={t.vision}><p className="whitespace-pre-line">{vision}</p></Block> : null}
                {mission ? <Block title={t.mission}><p className="whitespace-pre-line">{mission}</p></Block> : null}
                {values.length > 0 ? (
                  <Block title={t.values}>
                    <ul className="list-disc space-y-1 pl-5">
                      {values.map((v) => <li key={v}>{v}</li>)}
                    </ul>
                  </Block>
                ) : null}
              </div>
              {history ? (
                <div id="history" className="scroll-mt-28"><Block title={t.history}><p className="whitespace-pre-line">{history}</p></Block></div>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 text-slate-600">{t.notShared}</p>
          )}
        </section>

        {leaders.length > 0 || team.length > 0 ? (
          <section id="leadership" className="scroll-mt-28" aria-labelledby="leadership-h">
            <h2 id="leadership-h" className="text-2xl font-bold text-blue-950">{t.leadershipStructure}</h2>
            {top ? (
              <ul className="mx-auto mt-6 max-w-xs">
                <LeaderCard person={top} fallbackTitle={top.order === -1 ? t.principal : undefined} large higher={higher} />
              </ul>
            ) : null}
            {others.length > 0 ? (
              <ul className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                {others.map((p, i) => <LeaderCard key={`${p.name}-${i}`} person={p} higher={higher} />)}
              </ul>
            ) : null}
            {team.length > 0 ? (
              <div className="mt-10">
                <h3 className="text-lg font-bold text-blue-950">{t.ourTeam}</h3>
                <p className="mt-1 text-sm text-slate-500">{t.teamNote}</p>
                <ul className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-5">
                  {team.map((p, i) => <LeaderCard key={`${p.name}-${i}`} person={p} higher={higher} />)}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </SchoolSite>
  );
}
