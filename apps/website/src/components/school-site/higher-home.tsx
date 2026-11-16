import Image from "next/image";
import Link from "next/link";

import { HomeEventsStrip, HomeGalleryPreview } from "@/components/school-site/home-previews";
import { ItemGrid } from "@/components/school-site/item-grid";
import { LeaderCard } from "@/components/school-site/leader-card";
import { resolveMediaUrl } from "@/lib/media";
import { pickText, type PublicLeader, type PublicSchool, type SchoolLang } from "@/lib/public-schools";
import { excerpt, schoolHref } from "@/lib/school-site";
import type { SiteItem } from "@/lib/school-site-content";
import type { SiteText } from "@/lib/school-site-higher";
import { AccreditationBadge, PaymentInstructions, WhatsAppButton } from "@/components/school-site/higher-extras";
import { ProgrammeCard } from "@/components/school-site/programme-card";
import { applyHref, groupByLevel, programmeHref, progText, type Department, type Programme } from "@/lib/school-site-programmes";
import { Reveal } from "@/components/school-site/reveal";
import { HomeContact, HomeFaculties, HomeFaq, HomeSteps, HomeWhy } from "@/components/school-site/higher-home-sections";

/**
 * Home page of a higher-education institution. Every block renders only from
 * real data: the stats strip, leadership, events, news, gallery and the
 * admissions band each disappear when the institution has nothing to show.
 * Programmes appear when the public programmes endpoint returns any.
 */

type Props = {
  school: PublicSchool;
  lang: SchoolLang;
  preview?: string;
  t: SiteText;
  leaders: PublicLeader[];
  /** Lecturers and other team members, shown after the leadership. */
  team?: PublicLeader[];
  posts: SiteItem[];
  /** Number of staff who opted in to the public directory (0 when disabled). */
  staffCount: number;
  /** Published programmes (empty when the endpoint has none, and then no section renders). */
  programmes?: Programme[];
  /** Public departments with their faculty, for the faculties block. */
  departments?: Department[];
};

const LINK = "text-sm font-semibold text-[var(--he-accent)] underline underline-offset-4";
const WRAP = "mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-10";

export function HigherHome({ school, lang, preview, t, leaders, team = [], posts, staffCount, programmes = [], departments = [] }: Props) {
  const pt = progText(lang);
  const href = (s: Parameters<typeof schoolHref>[1]) => schoolHref(school, s, lang, preview);
  const banner = resolveMediaUrl(school.banner);
  const heroTitle = pickText(school.hero_title, lang) || school.name;
  const heroSubtitle = pickText(school.hero_subtitle, lang) || pickText(school.motto, lang);
  const description = pickText(school.description, lang);
  const motto = pickText(school.motto, lang);
  const place = [school.city_village || school.location, school.region].filter(Boolean).join(", ");
  const year = new Date().getFullYear();

  // Only facts the institution actually published.
  const stats: { value: string; label: string }[] = [
    ...(school.founded_year ? [{ value: String(school.founded_year), label: t.establishedLabel }] : []),
    ...(school.founded_year && school.founded_year <= year && year - school.founded_year >= 1
      ? [{ value: String(year - school.founded_year), label: t.yearsLabel }]
      : []),
    ...(staffCount > 0 ? [{ value: String(staffCount), label: t.staffLabel }] : []),
    ...(school.region ? [{ value: school.region, label: t.regionLabel }] : []),
  ];

  return (
    <>
      <section className="relative isolate flex min-h-[78svh] items-end overflow-hidden he-grad lg:min-h-[86svh]">
        {banner ? <Image src={banner} alt="" fill priority unoptimized sizes="100vw" className="he-kenburns -z-10 object-cover" /> : null}
        {banner ? <div className="absolute inset-0 -z-10 bg-[#0a111c]/60" aria-hidden /> : null}
        <div className={`${WRAP} pb-14 pt-32 sm:pb-20 lg:pb-24`}>
          {place ? <p className="he-rise text-base text-[var(--he-brass)]">{place}</p> : null}
          <h1 className="he-display he-rise he-rise-2 mt-4 max-w-5xl text-5xl font-normal leading-[1.02] tracking-tight text-white sm:text-7xl lg:text-[5.5rem]">
            {heroTitle}
          </h1>
          {heroSubtitle ? <p className="he-serif he-rise he-rise-3 mt-6 max-w-2xl text-xl leading-relaxed text-[#e3e8f0] sm:text-2xl">{heroSubtitle}</p> : null}
          <div className="he-rise he-rise-3 mt-10 flex flex-wrap gap-4">
            <WhatsAppButton school={school} lang={lang} className="" />
            {school.enrollment_enabled ? (
              <Link href={href("enrollment")} className="he-btn he-btn-brass">
                {t.applyNow}
              </Link>
            ) : null}
            <Link href={href("about")} className="he-btn he-btn-ghost">
              {t.discover}
            </Link>
          </div>
          <div className="he-rise he-rise-3 mt-6"><AccreditationBadge school={school} lang={lang} tone="dark" /></div>
        </div>
      </section>

      {stats.length >= 2 ? (
        <section aria-label={t.atAGlance} className="border-b border-[var(--he-line)] bg-[var(--he-surface)]">
          <dl className={`${WRAP} grid grid-cols-2 gap-y-8 py-10 sm:py-12 ${stats.length >= 4 ? "lg:grid-cols-4" : stats.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
            {stats.map((s, i) => (
              <div key={s.label} className={`px-2 sm:px-6 ${i > 0 ? "lg:border-l lg:border-[var(--he-line)]" : ""}`}>
                <dd className="he-serif text-4xl font-medium leading-none text-[var(--he-text)] sm:text-5xl">{s.value}</dd>
                <dt className="mt-3 text-sm text-[var(--he-muted)]">{s.label}</dt>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {description ? (
        <section className="py-20 sm:py-28" aria-labelledby="home-about">
          <div className={`${WRAP} grid gap-10 lg:grid-cols-12`}>
            <div className="lg:col-span-4">
              <h2 id="home-about" className="text-4xl font-medium leading-tight text-[var(--he-text)] sm:text-5xl">{t.aboutUs}</h2>
              <div className="mt-6 h-px w-16 bg-[var(--he-accent)]" aria-hidden />
            </div>
            <div className="lg:col-span-8">
              <p className="he-serif max-w-3xl whitespace-pre-line text-xl leading-9 text-[var(--he-text)] sm:text-2xl sm:leading-[1.7]">{excerpt(description, 520)}</p>
              {motto && heroSubtitle !== motto ? (
                <p className="he-serif mt-8 border-l-2 border-[var(--he-accent)] pl-5 text-xl italic text-[var(--he-muted)]">
                  <span className="sr-only">{t.motto}: </span>&ldquo;{motto}&rdquo;
                </p>
              ) : null}
              <Link href={href("about")} className={`${LINK} mt-8 inline-block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--he-accent)]`}>{t.learnMore}</Link>
            </div>
          </div>
        </section>
      ) : null}

      {programmes.length > 0 ? <HomeWhy lang={lang} programmes={programmes} departments={departments} /> : null}

      <HomeFaculties lang={lang} departments={departments} programmes={programmes} href={href} />

      {programmes.length > 0 ? (
        <section className="bg-[var(--he-paper)] py-20 sm:py-28" aria-labelledby="home-programmes">
          <Reveal className={WRAP}>
            <div className="mb-12 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 id="home-programmes" className="text-4xl font-medium leading-tight text-[var(--he-text)] sm:text-5xl">{pt.programmes}</h2>
                <p className="he-serif mt-3 max-w-2xl text-lg text-[var(--he-muted)]">{pt.programmesLead}</p>
              </div>
              <Link href={href("programmes")} className={`${LINK} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--he-accent)]`}>{pt.viewAll}</Link>
            </div>
            <div className="space-y-14">
              {groupByLevel(programmes).map((group) => (
                <div key={group.key} role="group" aria-labelledby={`home-prog-${group.key}`}>
                  <div className="mb-5 flex items-baseline justify-between gap-4 border-b border-[var(--he-line)] pb-3">
                    <h3 id={`home-prog-${group.key}`} className="he-serif text-2xl font-medium text-[var(--he-text)]">
                      {group.label} <span className="text-base font-normal text-[var(--he-muted)]">({group.programmes.length})</span>
                    </h3>
                    {group.programmes.length > 3 ? (
                      <Link href={programmeHref(href("programmes"), { level: group.key })} className={`${LINK} shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--he-accent)]`}>
                        {pt.allProgrammes}
                      </Link>
                    ) : null}
                  </div>
                  <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {group.programmes.slice(0, 3).map((p) => (
                      <ProgrammeCard key={p.id} programme={p} pt={pt} href={`${href("programmes")}#programme-${encodeURIComponent(p.id)}`} applyHref={school.enrollment_enabled ? applyHref(href("enrollment"), p.id) : undefined} applyLabel={lang === "fr" ? "Candidater" : "Apply now"} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Reveal>
        </section>
      ) : null}

      <HomeSteps lang={lang} href={href} enrollmentEnabled={Boolean(school.enrollment_enabled)} />

      {leaders.length > 0 ? (
        <section className="bg-[var(--he-paper)] py-20 sm:py-28" aria-labelledby="home-leadership">
          <Reveal className={WRAP}>
            <div className="mb-12 flex flex-wrap items-end justify-between gap-4">
              <h2 id="home-leadership" className="text-4xl font-medium leading-tight text-[var(--he-text)] sm:text-5xl">{t.ourLeadership}</h2>
              <Link href={href("about")} className={`${LINK} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--he-accent)]`}>{t.learnMore}</Link>
            </div>
            <ul className="grid grid-cols-2 gap-x-6 gap-y-12 lg:grid-cols-4 lg:gap-x-8">
              {leaders.slice(0, 4).map((person, i) => (
                <LeaderCard key={`${person.name}-${i}`} person={person} fallbackTitle={person.order === -1 ? t.principal : undefined} higher />
              ))}
            </ul>
          </Reveal>
        </section>
      ) : null}

      {team.length > 0 ? (
        <section className="py-20 sm:py-28" aria-labelledby="home-team">
          <Reveal className={WRAP}>
            <div className="mb-12 flex flex-wrap items-end justify-between gap-4">
              <h2 id="home-team" className="text-4xl font-medium leading-tight text-[var(--he-text)] sm:text-5xl">{lang === "fr" ? "Nos enseignants" : "Our lecturers"}</h2>
              <Link href={href("about")} className={`${LINK} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--he-accent)]`}>{t.learnMore}</Link>
            </div>
            <ul className="grid grid-cols-2 gap-x-6 gap-y-12 lg:grid-cols-4 lg:gap-x-8">
              {team.slice(0, 8).map((person, i) => <LeaderCard key={`${person.name}-${i}`} person={person} higher />)}
            </ul>
          </Reveal>
        </section>
      ) : null}

      <HomeEventsStrip school={school} lang={lang} preview={preview} />

      {posts.length > 0 ? (
        <section className="py-20 sm:py-28" aria-labelledby="home-blog">
          <Reveal className={WRAP}>
            <div className="mb-12 flex flex-wrap items-end justify-between gap-4">
              <h2 id="home-blog" className="text-4xl font-medium leading-tight text-[var(--he-text)] sm:text-5xl">{t.latestPosts}</h2>
              <Link href={href("blog")} className={`${LINK} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--he-accent)]`}>{t.allNews}</Link>
            </div>
            <ItemGrid items={posts} lang={lang} higher />
          </Reveal>
        </section>
      ) : null}

      <HomeGalleryPreview school={school} lang={lang} preview={preview} />

      {school.enrollment_enabled ? (
        <section className="relative isolate overflow-hidden he-grad py-20 sm:py-28" aria-labelledby="home-enroll">
          <div className={`${WRAP} grid items-end gap-10 lg:grid-cols-12`}>
            <div className="lg:col-span-8">
              <h2 id="home-enroll" className="he-display text-4xl font-normal leading-[1.08] text-white sm:text-6xl">{t.admissionsHeading}</h2>
              <p className="he-serif mt-5 max-w-2xl text-xl leading-relaxed text-[#c3cbd8]">{t.enrollText}</p>
              <div className="mt-8 max-w-2xl"><PaymentInstructions school={school} lang={lang} tone="dark" /></div>
            </div>
            <div className="flex flex-col gap-4 lg:col-span-4 lg:items-end">
              <WhatsAppButton school={school} lang={lang} className="he-btn-lg" />
              <Link href={href("enrollment")} className="he-btn he-btn-brass he-btn-lg">
                {t.applyNow}
              </Link>
            </div>
          </div>
        </section>
      ) : null}
      <HomeContact school={school} lang={lang} href={href} />

      <HomeFaq lang={lang} />
    </>
  );
}
