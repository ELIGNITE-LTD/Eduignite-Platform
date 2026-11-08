import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EmptyState, PageBanner, SchoolSite } from "@/components/school-site/school-shell";
import { DICT, schoolMetadata, type SchoolSection } from "@/lib/school-site";
import { loadSchool, type SchoolPageProps } from "@/lib/school-site-server";

/**
 * Honest placeholder for school-site sections whose backend does not exist yet
 * (Events, Gallery, Blog, Enrollment). It shows an empty state, never sample
 * content, and is kept out of search results until real content exists.
 * Replace a section's page.tsx with the real page when its API ships.
 */
type StubSection = Extract<SchoolSection, "events" | "gallery" | "blog" | "enrollment">;

const TEXT_KEY = { events: "eventsSoon", gallery: "gallerySoon", blog: "blogSoon", enrollment: "enrollmentSoon" } as const;

export async function stubMetadata(props: SchoolPageProps, section: StubSection): Promise<Metadata> {
  const loaded = await loadSchool(props);
  if (!loaded || (section === "enrollment" && !loaded.school.enrollment_enabled)) {
    return { title: "School not found", robots: { index: false, follow: false } };
  }
  return schoolMetadata({
    school: loaded.school, lang: loaded.lang, section, label: DICT[loaded.lang][section], noIndex: true,
  });
}

export async function StubPage({ props, section }: { props: SchoolPageProps; section: StubSection }) {
  const loaded = await loadSchool(props);
  if (!loaded) notFound();
  const { school, lang, preview } = loaded;
  if (section === "enrollment" && !school.enrollment_enabled) notFound();
  const t = DICT[lang];
  return (
    <SchoolSite school={school} lang={lang} active={section} preview={preview} crumbs={[{ name: t[section], section }]}>
      <PageBanner school={school} lang={lang} title={t[section]} preview={preview} />
      <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
        <EmptyState title={t.comingSoon} text={t[TEXT_KEY[section]]} />
      </div>
    </SchoolSite>
  );
}
