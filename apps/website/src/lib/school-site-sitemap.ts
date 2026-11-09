/**
 * Sitemap entries for each published school website: home, about, and the
 * events / gallery / blog lists and enrollment page only when they exist.
 * Login, previews and unpublished or blocked sites are never listed (the public
 * index only returns live sites, and each profile is re-checked here).
 */
import type { MetadataRoute } from "next";

import { fetchPublicSchool } from "@/lib/public-schools";
import { fetchSectionPresence } from "@/lib/school-site-content";
import { absoluteUrl } from "@/lib/seo";

type Entry = MetadataRoute.Sitemap[number];

async function entriesFor(slug: string, updatedAt: string | undefined, now: Date): Promise<Entry[]> {
  const school = await fetchPublicSchool(slug);
  // The index lists live sites only; if the profile cannot be re-read, keep the home page.
  if (!school) return [{ url: absoluteUrl(`/schools/${slug}`), lastModified: now, changeFrequency: "monthly" as const, priority: 0.5 }];
  if (!school.is_live || school.seo.noindex) return [];
  const parsed = updatedAt ? new Date(updatedAt) : now;
  const lastModified = Number.isNaN(parsed.getTime()) ? now : parsed;
  const presence = await fetchSectionPresence(slug);
  const paths: [string, number][] = [
    ["", 0.5],
    ["/about", 0.4],
    ...(presence.events ? [["/events", 0.4] as [string, number]] : []),
    ...(presence.gallery ? [["/gallery", 0.3] as [string, number]] : []),
    ...(presence.blog ? [["/blog", 0.4] as [string, number]] : []),
    ...(school.enrollment_enabled ? [["/enrollment", 0.5] as [string, number]] : []),
  ];
  return paths.map(([path, priority]) => ({
    url: absoluteUrl(`/schools/${slug}${path}`),
    lastModified,
    changeFrequency: "monthly" as const,
    priority,
  }));
}

export async function schoolSiteSitemap(schools: { slug: string; updated_at: string }[]): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const out: Entry[] = [];
  for (let i = 0; i < schools.length; i += 10) {
    const chunk = schools.slice(i, i + 10);
    const results = await Promise.all(chunk.map((s) => entriesFor(s.slug, s.updated_at, now).catch(() => [] as Entry[])));
    for (const r of results) out.push(...r);
  }
  return out;
}
