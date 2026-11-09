import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ItemGrid } from "@/components/school-site/item-grid";
import { PageBanner, SchoolSite } from "@/components/school-site/school-shell";
import { DICT, schoolMetadata, type SchoolSection } from "@/lib/school-site";
import { fetchSiteItems } from "@/lib/school-site-content";
import { loadSchool, type SchoolPageProps } from "@/lib/school-site-server";

/**
 * Generic page for the school-site sections Events, Gallery and Blog. It lists
 * what the school has published (read defensively from the public API) and
 * answers 404 when there is nothing, so no "coming soon" page is ever served
 * or indexed. The nav hides the entry in the same case. The dedicated section
 * pages replace this file's usage when they ship.
 */
type Section = Extract<SchoolSection, "events" | "gallery" | "blog">;

export async function stubMetadata(props: SchoolPageProps, section: Section): Promise<Metadata> {
  const loaded = await loadSchool(props);
  if (!loaded) return { title: "School not found", robots: { index: false, follow: false } };
  const items = await fetchSiteItems(loaded.school.slug, section, loaded.lang, 1);
  if (items.length === 0) return { title: "School not found", robots: { index: false, follow: false } };
  return schoolMetadata({ school: loaded.school, lang: loaded.lang, section, label: DICT[loaded.lang][section] });
}

export async function StubPage({ props, section }: { props: SchoolPageProps; section: Section }) {
  const loaded = await loadSchool(props);
  if (!loaded) notFound();
  const { school, lang, preview } = loaded;
  const items = await fetchSiteItems(school.slug, section, lang, 48);
  if (items.length === 0) notFound();
  const t = DICT[lang];
  return (
    <SchoolSite school={school} lang={lang} active={section} preview={preview} crumbs={[{ name: t[section], section }]}>
      <PageBanner school={school} lang={lang} title={t[section]} preview={preview} />
      <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
        <ItemGrid items={items} lang={lang} />
      </div>
    </SchoolSite>
  );
}
