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
  /** hreflang alternates, e.g. { "en-CM": "/a", "fr-CM": "/b" }. */
  languages?: Record<string, string>;
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
  languages,
}: PageMetadataInput): Metadata {
  const images = image ? [{ url: image, alt: imageAlt || title }] : [DEFAULT_OG_IMAGE];
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: path, ...(languages ? { languages } : {}) },
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
    areaServed: { "@type": "Country", name: "Cameroon" },
    knowsLanguage: ["en", "fr"],
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
    inLanguage: ["en", "fr"],
    publisher: { "@id": ORGANIZATION_ID },
    // /schools?q= is a real, server-rendered search of published school sites.
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/schools?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

/**
 * What EduIgnite is, in the vocabulary Google uses for software.
 *
 * Without this the site described an organisation and some web pages, and
 * left a search engine to infer from prose that the thing being described is
 * a school management system people can use in Cameroon, on these platforms,
 * in these languages. This says it outright.
 *
 * No price and no rating: neither is shown on the site, and structured data
 * that claims more than the page does is a manual action waiting to happen.
 */
export function softwareApplicationSchema() {
  return {
    "@type": "SoftwareApplication",
    "@id": `${SITE_URL}/#software`,
    name: SITE.name,
    alternateName: "EduIgnite School Management System",
    applicationCategory: "EducationalApplication",
    applicationSubCategory: "School Management System",
    operatingSystem: "Web, Android, Windows",
    browserRequirements: "Requires a modern browser such as Chrome, Edge, Firefox or Safari",
    url: `${SITE_URL}/`,
    description:
      "All-in-one school management system for nursery, primary and secondary schools in Cameroon, in " +
      "English and French: admissions, attendance, marks, report cards with QR verification, fees and " +
      "mobile money, timetable, parent portal, messaging, and a public website for every school. " +
      "Higher education is coming soon.",
    inLanguage: ["en", "fr"],
    areaServed: { "@type": "Country", name: "Cameroon" },
    audience: {
      "@type": "EducationalAudience",
      audienceType: "Nursery (maternelle), primary (primaire) and secondary (secondaire) schools in Cameroon",
    },
    publisher: { "@id": ORGANIZATION_ID },
    image: absoluteUrl("/icons/eduignite-icon-512.png"),
    featureList: [
      "Nursery and primary school management: class-teacher registers, one-screen marks, conduct, health records, certificates",
      "Secondary school management: sequences, terms, coefficients, subject teachers, class masters, exams",
      "Public website for every school with news, events, gallery and online enrollment",
      "School directory of published school websites",
      "Student records and admissions",
      "Attendance registers",
      "Marks, report cards and transcripts",
      "School fees, receipts and mobile money payments",
      "Timetable and academic calendar",
      "Parent, teacher and student messaging",
      "Digital library",
      "QR-verified student ID cards and documents",
      "Works on phone, tablet and computer in any modern browser, plus Android and Windows apps",
      "Saved changes made offline sync automatically when the connection returns",
      "English and French throughout",
      "Nursery, primary and secondary school support",
    ],
  };
}

/**
 * Questions a page actually answers, in the form Google can show directly.
 *
 * Only pass questions that appear on the page as visible text. A FAQ block in
 * the markup and a different one in the structured data is exactly what the
 * spam guidelines are about.
 */
export function faqSchema(items: { question: string; answer: string }[]) {
  return {
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
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
