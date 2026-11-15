import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProgrammeCard } from "@/components/school-site/programme-card";
import { PageBanner, SchoolSite } from "@/components/school-site/school-shell";
import { schoolHref, schoolMetadata } from "@/lib/school-site";
import { isHigherSchool, tFor } from "@/lib/school-site-higher";
import {
  fetchPublicProgrammes, groupByLevel, levelKey, programmesJsonLd, progText,
} from "@/lib/school-site-programmes";
import { loadSchool, type SchoolPageProps } from "@/lib/school-site-server";

/**
 * Programmes of a higher-education institution, built only from the public
 * programmes endpoint. Filters are plain GET parameters (department, level),
 * so the page works without JavaScript and every filtered view is linkable.
 * Non-higher schools and institutions with no published programmes get a 404.
 */

export async function generateMetadata(props: SchoolPageProps): Promise<Metadata> {
  const loaded = await loadSchool(props);
  if (!loaded || !isHigherSchool(loaded.school)) return { title: "Not found", robots: { index: false, follow: false } };
  const { school, lang } = loaded;
  const pt = progText(lang);
  const programmes = await fetchPublicProgrammes(school.slug);
  if (programmes.length === 0) return { title: "Not found", robots: { index: false, follow: false } };
  const levels = groupByLevel(programmes).map((g) => g.label).slice(0, 5).join(", ");
  const description = lang === "fr"
    ? `${programmes.length} programmes à ${school.name} : ${levels}. Durée, crédits et départements.`
    : `${programmes.length} programmes at ${school.name}: ${levels}. Duration, credits and departments.`;
  return schoolMetadata({ school, lang, section: "programmes", label: pt.programmes, description });
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function ProgrammesPage(props: SchoolPageProps) {
  const loaded = await loadSchool(props);
  if (!loaded || !isHigherSchool(loaded.school)) notFound();
  const { school, lang, preview } = loaded;
  const programmes = await fetchPublicProgrammes(school.slug);
  if (programmes.length === 0) notFound();

  const query = await props.searchParams;
  const t = tFor(school, lang);
  const pt = progText(lang);

  const departments = [...new Set(programmes.map((p) => p.department_name).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const levels = groupByLevel(programmes);
  const wantedDept = one(query.department);
  const wantedLevel = levelKey(one(query.level));
  const dept = departments.includes(wantedDept) ? wantedDept : "";
  const level = levels.some((g) => g.key === wantedLevel) ? wantedLevel : "";

  const filtered = programmes.filter((p) =>
    (!dept || p.department_name === dept) && (!level || levelKey(p.award_level || p.award_level_label) === level));
  const groups = groupByLevel(filtered);
  const base = schoolHref(school, "programmes", lang, preview);
  const jsonLd = programmesJsonLd(school, lang, programmes);
  const select = "mt-1.5 block h-11 w-full border border-[var(--he-line)] bg-[var(--he-surface)] px-3 text-[15px] text-[var(--he-text)]";

  return (
    <SchoolSite school={school} lang={lang} active="programmes" preview={preview} crumbs={[{ name: pt.programmes, section: "programmes" }]}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <PageBanner school={school} lang={lang} title={pt.programmes} preview={preview} />
      <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-10">
        <p className="he-serif max-w-3xl text-xl leading-relaxed text-[var(--he-muted)]">{pt.programmesLead}</p>

        <form method="get" action={`/schools/${school.slug}/programmes`} aria-label={pt.filters} className="mt-10 grid gap-4 border-y border-[var(--he-line)] py-6 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
          {lang !== school.default_language ? <input type="hidden" name="lang" value={lang} /> : null}
          {preview ? <input type="hidden" name="preview" value={preview} /> : null}
          {departments.length > 0 ? (
            <div>
              <label htmlFor="f-department" className="text-sm font-semibold text-[var(--he-text)]">{pt.department}</label>
              <select id="f-department" name="department" defaultValue={dept} className={select}>
                <option value="">{pt.allDepartments}</option>
                {departments.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          ) : null}
          <div>
            <label htmlFor="f-level" className="text-sm font-semibold text-[var(--he-text)]">{pt.level}</label>
            <select id="f-level" name="level" defaultValue={level} className={select}>
              <option value="">{pt.allLevels}</option>
              {levels.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-4">
            <button type="submit" className="h-11 bg-[var(--he-btn-bg)] px-6 text-sm font-semibold text-[var(--he-btn-fg)] transition-opacity hover:opacity-90" style={{ borderRadius: 2 }}>
              {pt.apply}
            </button>
            {dept || level ? <Link href={base} className="text-sm font-semibold text-[var(--he-accent)] underline underline-offset-4">{pt.reset}</Link> : null}
          </div>
        </form>

        <p role="status" aria-live="polite" className="mt-6 text-sm text-[var(--he-muted)]">
          {filtered.length} / {programmes.length} {pt.shown}
        </p>

        {filtered.length === 0 ? (
          <p className="mt-10 text-lg text-[var(--he-muted)]">{pt.noMatch}</p>
        ) : (
          <div className="mt-10 space-y-14">
            {groups.map((g) => (
              <section key={g.key} aria-labelledby={`lvl-${g.key}`}>
                <h2 id={`lvl-${g.key}`} className="mb-5 border-b border-[var(--he-line)] pb-3 text-3xl font-medium text-[var(--he-text)]">
                  {g.label} <span className="text-lg font-normal text-[var(--he-muted)]">({g.programmes.length})</span>
                </h2>
                <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {g.programmes.map((p) => <ProgrammeCard key={p.id} programme={p} pt={pt} />)}
                </ul>
              </section>
            ))}
          </div>
        )}
        {school.enrollment_enabled ? (
          <div className="mt-16">
            <Link href={schoolHref(school, "enrollment", lang, preview)} className="inline-block bg-[var(--he-btn-bg)] px-8 py-4 text-base font-semibold text-[var(--he-btn-fg)]" style={{ borderRadius: 2 }}>
              {t.applyNow}
            </Link>
          </div>
        ) : null}
      </div>
    </SchoolSite>
  );
}
