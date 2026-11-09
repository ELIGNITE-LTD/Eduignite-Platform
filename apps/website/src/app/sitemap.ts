import type { MetadataRoute } from "next";
import { fetchPublicSchoolIndex } from "@/lib/public-schools";
import { fetchBlogPosts, fetchGallery } from "@/lib/public-site";
import { fetchCourses } from "@/app/academy/_lib/public-api";
import { fetchBlogIndex } from "@/lib/school-blog";
import { absoluteUrl } from "@/lib/seo";
import { fetchSchoolSiteContentUrls } from "@/lib/school-site-content";
import { schoolSiteSitemap } from "@/lib/school-site-sitemap";

export const revalidate = 3600;

type Entry = { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] };

/**
 * The public site's main sections. Dashboards, account pages, private
 * Academy areas, verification lookups and API routes are deliberately absent
 * (and disallowed in robots.ts).
 */
const SECTIONS: Entry[] = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  // The two pages written for the search "school management system in
  // Cameroon", one in each official language.
  { path: "/school-management-system-cameroon", priority: 0.95, changeFrequency: "monthly" },
  { path: "/logiciel-de-gestion-scolaire-cameroun", priority: 0.95, changeFrequency: "monthly" },
  { path: "/academy", priority: 0.9, changeFrequency: "weekly" },
  { path: "/blog", priority: 0.9, changeFrequency: "daily" },
  { path: "/testimonials", priority: 0.8, changeFrequency: "weekly" },
  { path: "/download", priority: 0.9, changeFrequency: "weekly" },
  { path: "/gallery", priority: 0.7, changeFrequency: "weekly" },
  { path: "/sample-documents", priority: 0.7, changeFrequency: "monthly" },
  { path: "/about", priority: 0.8, changeFrequency: "monthly" },
  { path: "/contact", priority: 0.8, changeFrequency: "monthly" },
  { path: "/download/mobile", priority: 0.8, changeFrequency: "weekly" },
  { path: "/download/desktop", priority: 0.8, changeFrequency: "weekly" },
  { path: "/download/offline", priority: 0.7, changeFrequency: "weekly" },
  { path: "/download/companion", priority: 0.7, changeFrequency: "weekly" },
  { path: "/academy/courses", priority: 0.8, changeFrequency: "weekly" },
  { path: "/academy/trainers", priority: 0.6, changeFrequency: "monthly" },
  { path: "/school-account-request", priority: 0.6, changeFrequency: "monthly" },
  { path: "/community", priority: 0.5, changeFrequency: "weekly" },
  { path: "/login", priority: 0.4, changeFrequency: "yearly" },
  { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
  { path: "/cookies", priority: 0.3, changeFrequency: "yearly" },
  { path: "/refunds", priority: 0.3, changeFrequency: "yearly" },
];

function dateOrNow(value: string | null | undefined, now: Date) {
  if (!value) return now;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? now : parsed;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  // Each list degrades to empty if the API cannot be reached, so the sitemap
  // always serves at least the main sections.
  const [posts, courses, schools, gallery] = await Promise.all([
    fetchBlogPosts().catch(() => []),
    fetchCourses().catch(() => []),
    fetchPublicSchoolIndex().catch(() => []),
    fetchGallery().catch(() => []),
  ]);

  const sections: MetadataRoute.Sitemap = SECTIONS.map((entry) => ({
    url: absoluteUrl(entry.path),
    lastModified: now,
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
  }));

  // The public blog API only returns published posts.
  const blogPages: MetadataRoute.Sitemap = posts
    .filter((post) => post.slug)
    .map((post) => ({
      url: absoluteUrl(`/blog/${post.slug}`),
      lastModified: dateOrNow(post.published_at, now),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    }));

  // The public Academy API only returns published courses.
  const coursePages: MetadataRoute.Sitemap = courses
    .filter((course) => course.slug)
    .map((course) => ({
      url: absoluteUrl(`/academy/courses/${course.slug}`),
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

  // Each school's public profile, so search engines can find it even though
  // no page on this site links to a list of schools.
  const schoolPages: MetadataRoute.Sitemap = await schoolSiteSitemap(schools);

  // Each gallery item now has a page of its own with the whole story on it.
  const galleryPages: MetadataRoute.Sitemap = gallery.map((item) => ({
    url: absoluteUrl(`/gallery/${item.id}`),
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.5,
  }));

  // Events and gallery pages of each published school site (separate block).
  const schoolContentPages = await fetchSchoolSiteContentUrls(schools.map((s) => s.slug)).catch(() => []);

  // --- School website blogs (apps/school_site_content): published articles of published sites only.
  const schoolPosts = await fetchBlogIndex().catch(() => []);
  const schoolBlogPages: MetadataRoute.Sitemap = [
    ...[...new Set(schoolPosts.map((p) => p.school))].map((school) => ({
      url: absoluteUrl(`/schools/${school}/blog`),
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
    ...schoolPosts.map((post) => ({
      url: absoluteUrl(`/schools/${post.school}/blog/${post.slug}`),
      lastModified: dateOrNow(post.updated_at || post.published_at, now),
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
  ];

  return [...sections, ...blogPages, ...coursePages, ...schoolPages, ...galleryPages, ...schoolBlogPages, ...schoolContentPages];
}
