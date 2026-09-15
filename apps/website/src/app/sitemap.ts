import type { MetadataRoute } from "next";
import { fetchPublicSchoolIndex } from "@/lib/public-schools";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const routes = [
    "",
    "/download",
    "/about",
    "/contact",
    "/school-account-request",
    "/community",
    "/welcome",
    "/login",
  ];

  const sitePages: MetadataRoute.Sitemap = routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: route === "" ? 1 : 0.8,
  }));

  // Each school's public profile, so search engines can find it even though
  // no page on this site links to a list of schools.
  const schoolPages: MetadataRoute.Sitemap = (await fetchPublicSchoolIndex()).map((school) => ({
    url: `${baseUrl}/school/${school.slug}`,
    lastModified: school.updated_at ? new Date(school.updated_at) : now,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [...sitePages, ...schoolPages];
}
