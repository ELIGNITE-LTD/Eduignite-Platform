import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { GREEN_BUTTON, SchoolSite } from "@/components/school-site/school-shell";
import { ItemGrid } from "@/components/school-site/item-grid";
import { LeaderCard } from "@/components/school-site/leader-card";
import { HomeEventsStrip, HomeGalleryPreview } from "@/components/school-site/home-previews";
import { resolveMediaUrl } from "@/lib/media";
import { fetchConfiguredLeadership } from "@/lib/school-blog";
import { buildLeadership, fetchPublicSchoolStaff, pickText } from "@/lib/public-schools";
import { DICT, excerpt, schoolHref, schoolMetadata } from "@/lib/school-site";
import { isHigherSchool, tFor } from "@/lib/school-site-higher";
import { HigherHome } from "@/components/school-site/higher-home";
import { fetchSiteItems } from "@/lib/school-site-content";
import { loadSchool, type SchoolPageProps } from "@/lib/school-site-server";

/**
 * Home page of a school's own website. Every section appears only when the
 * school has the data for it: no samples, no placeholders. Events, gallery and
 * blog previews join when their public APIs exist (see the EmptyState pages).
 */

export async function generateMetadata(props: SchoolPageProps): Promise<Metadata> {
  const loaded = await loadSchool(props);
  if (!loaded) return { title: "School not found", robots: { index: false, follow: false } };
  return schoolMetadata({ school: loaded.school, lang: loaded.lang, section: "" });
}

export default async function SchoolHomePage(props: SchoolPageProps) {
  const loaded = await loadSchool(props);
  if (!loaded) notFound();
  const { school, lang, preview } = loaded;
  const t = tFor(school, lang);

  const [directory, configured, posts] = await Promise.all([
    fetchPublicSchoolStaff(school.slug),
    fetchConfiguredLeadership(school.slug, lang),
    fetchSiteItems(school.slug, "blog", lang, 3),
  ]);
  const { leaders } = buildLeadership(configured.length ? { ...school, leadership: configured } : school, directory.enabled ? directory.staff : []);
  const banner = resolveMediaUrl(school.banner);
  const heroTitle = pickText(school.hero_title, lang) || school.name;
  const heroSubtitle = pickText(school.hero_subtitle, lang) || pickText(school.motto, lang);
  const description = pickText(school.description, lang);
  const href = (s: Parameters<typeof schoolHref>[1]) => schoolHref(school, s, lang, preview);

  if (isHigherSchool(school)) {
    return (
      <SchoolSite school={school} lang={lang} active="" preview={preview}>
        <HigherHome
          school={school} lang={lang} preview={preview} t={t} leaders={leaders} posts={posts}
          staffCount={directory.enabled ? directory.staff.length : 0}
        />
      </SchoolSite>
    );
  }

  return (
    <SchoolSite school={school} lang={lang} active="" preview={preview}>
      <section className="relative isolate overflow-hidden bg-blue-900">
        {banner ? (
          <Image src={banner} alt="" fill priority unoptimized sizes="100vw" className="-z-10 object-cover opacity-35" />
        ) : null}
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-28">
          <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl">{heroTitle}</h1>
          {heroSubtitle ? <p className="mt-4 max-w-2xl text-lg italic text-blue-50">{heroSubtitle}</p> : null}
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={href("about")} className={GREEN_BUTTON}>{t.discover}</Link>
            {school.enrollment_enabled ? (
              <Link href={href("enrollment")} className={`${GREEN_BUTTON} !bg-white !text-blue-900 hover:!bg-blue-50`}>{t.applyNow}</Link>
            ) : null}
          </div>
        </div>
      </section>

      {description ? (
        <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-blue-950">{t.aboutUs}</h2>
          <p className="mt-4 max-w-3xl whitespace-pre-line leading-7 text-slate-700">{excerpt(description, 520)}</p>
          <Link href={href("about")} className={`${GREEN_BUTTON} mt-6`}>{t.learnMore}</Link>
        </section>
      ) : null}

      {leaders.length > 0 ? (
        <section className="bg-slate-50 py-14" aria-labelledby="home-leadership">
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="flex items-end justify-between gap-4">
              <h2 id="home-leadership" className="text-2xl font-bold text-blue-950">{t.ourLeadership}</h2>
              <Link href={href("about")} className="text-sm font-semibold text-green-800 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700">
                {t.learnMore}
              </Link>
            </div>
            <ul className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
              {leaders.slice(0, 4).map((person, i) => (
                <LeaderCard key={`${person.name}-${i}`} person={person} fallbackTitle={person.order === -1 ? t.principal : undefined} />
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <HomeEventsStrip school={school} lang={lang} preview={preview} />
      <HomeGalleryPreview school={school} lang={lang} preview={preview} />
      {[
        { id: "home-blog", title: t.latestPosts, items: posts, section: "blog" as const },
      ].map((block, i) =>
        block.items.length > 0 ? (
          <section key={block.id} className={`py-14 ${i % 2 === 0 ? "" : "bg-slate-50"}`} aria-labelledby={block.id}>
            <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
              <div className="mb-6 flex items-end justify-between gap-4">
                <h2 id={block.id} className="text-2xl font-bold text-blue-950">{block.title}</h2>
                <Link href={href(block.section)} className="text-sm font-semibold text-green-800 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700">
                  {t.viewAll}
                </Link>
              </div>
              <ItemGrid items={block.items} lang={lang} />
            </div>
          </section>
        ) : null,
      )}

      {school.enrollment_enabled ? (
        <section className="bg-blue-900 py-14" aria-labelledby="home-enroll">
          <div className="mx-auto w-full max-w-6xl px-4 text-center sm:px-6 lg:px-8">
            <h2 id="home-enroll" className="text-2xl font-bold text-white">{t.enrollTitle}</h2>
            <p className="mx-auto mt-3 max-w-2xl text-blue-50">{t.enrollText}</p>
            <Link href={href("enrollment")} className={`${GREEN_BUTTON} mt-6`}>{t.applyNow}</Link>
          </div>
        </section>
      ) : null}
    </SchoolSite>
  );
}
