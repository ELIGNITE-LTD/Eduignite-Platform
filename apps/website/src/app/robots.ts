import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/**
 * Everything public is crawlable; the application itself is not. Paths are
 * prefixes, so "/dashboard" covers every dashboard page.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard",
          "/api",
          "/welcome",
          "/reset-password",
          "/forbidden",
          "/offline",
          // Report-card and student-card QR lookups name real students.
          "/verify",
          // Private Academy areas: the admin CMS, a learner's certificates,
          // sign-up flow and the lesson player.
          "/academy/admin",
          "/academy/certificates",
          "/academy/start",
          "/academy/reset-password",
          "/academy/courses/*/learn",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
