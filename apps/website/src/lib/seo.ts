/**
 * Search metadata and Schema.org structured data for the public site.
 *
 * Every public page builds its metadata with `pageMetadata` so it gets its own
 * title, description, canonical URL and Open Graph card — pages that skipped
 * this used to inherit the root layout's canonical ("/") and so told search
 * engines they were copies of the homepage.
 *
 * Structured data only describes what the page visibly shows: no ratings, no
 * reviews, no invented organisations.
 */
import type { Metadata } from "next";

import { SITE } from "@/lib/public-site";

/**
 * The site's public origin. The fallback is the production domain, so a
 * missing NEXT_PUBLIC_APP_URL can never put localhost into canonical URLs,
 * the sitemap or robots.txt.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://eduignite.online").replace(/\/+$/, "");

export const DEFAULT_OG_IMAGE = { url: "/icon.png", width: 512, height: 512, alt: `${SITE.name} logo` };

export function absoluteUrl(path = "/") {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

type PageMetadataInput = {
  /** The full title, used as-is (the root template is not appended). */
  title: string;
  description: string;
  /** Path of the page's canonical URL, e.g. "/academy". */
  path: string;
  image?: string | null;
  imageAlt?: string;
  type?: "website" | "article";
  publishedTime?: string;
  authors?: string[];
  noIndex?: boolean;
};

export function pageMetadata({
  title,
  description,
  path,
  image,
  imageAlt,
  type = "website",
  publishedTime,
  authors,
  noIndex = false,
}: PageMetadataInput): Metadata {
  const images = image ? [{ url: image, alt: imageAlt || title }] : [DEFAULT_OG_IMAGE];
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      siteName: SITE.name,
      locale: "en_US",
      type,
      images,
      ...(type === "article" ? { publishedTime, authors } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: images.map((item) => item.url),
    },
    ...(noIndex ? { robots: { index: false, follow: true } } : {}),
  };
}

/** Trim prose to a meta-description length on a word boundary. */
export function toDescription(text: string | null | undefined, fallback: string, max = 158) {
  const clean = `${text ?? ""}`.replace(/\s+/g, " ").trim();
  if (!clean) return fallback;
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 80)).replace(/[,;:.\s]+$/, "")}…`;
}

// ── Schema.org ──────────────────────────────────────────────────────────────

const ORGANIZATION_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;

export function organizationSchema() {
  return {
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: SITE.name,
    url: `${SITE_URL}/`,
    logo: { "@type": "ImageObject", url: absoluteUrl("/icons/eduignite-icon-512.png"), width: 512, height: 512 },
    description: SITE.description,
    email: SITE.email,
    address: { "@type": "PostalAddress", addressLocality: "Bamenda", addressCountry: "CM" },
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: SITE.email,
        url: absoluteUrl("/contact"),
        availableLanguage: ["English", "French"],
      },
    ],
  };
}

export function websiteSchema() {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: SITE.name,
    url: `${SITE_URL}/`,
    description: SITE.description,
    inLanguage: "en",
    publisher: { "@id": ORGANIZATION_ID },
  };
}

export type Crumb = { name: string; path: string };

export function breadcrumbSchema(crumbs: Crumb[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}

type WebPageInput = {
  name: string;
  description: string;
  path: string;
  /** e.g. "AboutPage", "ContactPage", "CollectionPage". */
  type?: string;
  crumbs?: Crumb[];
};

export function webPageSchema({ name, description, path, type = "WebPage", crumbs }: WebPageInput) {
  return {
    "@type": type,
    "@id": `${absoluteUrl(path)}#webpage`,
    url: absoluteUrl(path),
    name,
    description,
    inLanguage: "en",
    isPartOf: { "@id": WEBSITE_ID },
    publisher: { "@id": ORGANIZATION_ID },
    ...(crumbs?.length ? { breadcrumb: breadcrumbSchema(crumbs) } : {}),
  };
}

type ArticleInput = {
  title: string;
  description: string;
  path: string;
  image?: string | null;
  author?: string | null;
  publishedAt?: string | null;
  modifiedAt?: string | null;
};

export function articleSchema({ title, description, path, image, author, publishedAt, modifiedAt }: ArticleInput) {
  return {
    "@type": "Article",
    "@id": `${absoluteUrl(path)}#article`,
    headline: title.slice(0, 110),
    description,
    url: absoluteUrl(path),
    mainEntityOfPage: absoluteUrl(path),
    image: [image ? absoluteUrl(image) : absoluteUrl(DEFAULT_OG_IMAGE.url)],
    ...(publishedAt ? { datePublished: publishedAt } : {}),
    ...(modifiedAt || publishedAt ? { dateModified: modifiedAt || publishedAt } : {}),
    // Only the byline the page itself shows — a display name, nothing more.
    ...(author ? { author: { "@type": "Person", name: author } } : { author: { "@id": ORGANIZATION_ID } }),
    publisher: { "@id": ORGANIZATION_ID },
    isPartOf: { "@id": WEBSITE_ID },
  };
}

/** Wrap one or more schema nodes into a single JSON-LD graph. */
export function schemaGraph(...nodes: Record<string, unknown>[]) {
  return { "@context": "https://schema.org", "@graph": nodes };
}
