/**
 * Shared helpers for the public school websites at /schools/{slug}: language
 * resolution, URLs, interface text (English and French), metadata, JSON-LD.
 * Server-side only; nothing here ships to the browser.
 */
import type { Metadata } from "next";

import {
  SCHOOL_LANGS,
  absoluteImage,
  hasBothLanguages,
  pickText,
  schoolPlace,
  type PublicSchool,
  type SchoolLang,
} from "@/lib/public-schools";
import { SITE_URL } from "@/lib/seo";

export const LANG_COOKIE = "school_lang";

export type SchoolSection = "" | "about" | "events" | "gallery" | "blog" | "login" | "enrollment";

export function isLang(value: unknown): value is SchoolLang {
  return typeof value === "string" && (SCHOOL_LANGS as string[]).includes(value);
}

/** Query string first, then the remembered cookie, then the school's own default. */
export function resolveLang(
  queryLang: string | string[] | undefined,
  cookieLang: string | undefined,
  fallback: SchoolLang,
): SchoolLang {
  const q = Array.isArray(queryLang) ? queryLang[0] : queryLang;
  if (isLang(q)) return q;
  if (isLang(cookieLang)) return cookieLang;
  return fallback;
}

/** Path of a school page; the language and preview token ride along only when needed. */
export function schoolHref(
  school: Pick<PublicSchool, "slug" | "default_language">,
  section: SchoolSection,
  lang: SchoolLang,
  preview?: string,
): string {
  const base = `/schools/${school.slug}${section ? `/${section}` : ""}`;
  const params = new URLSearchParams();
  if (lang !== school.default_language) params.set("lang", lang);
  if (preview) params.set("preview", preview);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export function canonicalUrl(school: PublicSchool, section: SchoolSection, lang: SchoolLang): string {
  const base = `${SITE_URL}/schools/${school.slug}${section ? `/${section}` : ""}`;
  return lang === school.default_language ? base : `${base}?lang=${lang}`;
}

type Dict = {
  skip: string; home: string; about: string; events: string; gallery: string; blog: string;
  login: string; enrollment: string; menu: string; mainNav: string; language: string;
  discover: string; applyNow: string; learnMore: string; aboutUs: string; ourLeadership: string;
  leadershipStructure: string; ourTeam: string; teamNote: string; identity: string; motto: string;
  vision: string; mission: string; values: string; history: string; notShared: string;
  quickLinks: string; contact: string; footerRights: string; poweredBy: string; principal: string;
  loginTitle: string; loginLead: string; loginButton: string; loginHelp: string; backHome: string;
  comingSoon: string; eventsSoon: string; gallerySoon: string; blogSoon: string; enrollmentSoon: string;
  notFoundTitle: string; notFoundText: string; previewBanner: string; founded: string; location: string;
  schoolType: string; subsystem: string; visitUs: string; breadcrumb: string;
  upcomingEvents: string; galleryPreview: string; latestPosts: string; viewAll: string;
  enrollTitle: string; enrollText: string;
};

export const DICT: Record<SchoolLang, Dict> = {
  en: {
    skip: "Skip to main content", home: "Home", about: "About", events: "Events", gallery: "Gallery",
    blog: "Blog", login: "Login", enrollment: "Enrollment", menu: "Menu", mainNav: "Main navigation",
    language: "Language", discover: "Discover our school", applyNow: "Apply for admission",
    learnMore: "Learn more", aboutUs: "About our school", ourLeadership: "Our leadership",
    leadershipStructure: "Leadership", ourTeam: "Our team", teamNote: "Members of staff who chose to appear here.",
    identity: "Our identity", motto: "Motto", vision: "Our vision", mission: "Our mission",
    values: "Core values", history: "Our history", notShared: "This information has not been shared yet.",
    quickLinks: "Quick links", contact: "Contact", footerRights: "All rights reserved.",
    poweredBy: "Powered by", principal: "Principal", loginTitle: "Login to your account",
    loginLead: "Staff, students and parents sign in with the account the school gave them.",
    loginButton: "Continue to login",
    loginHelp: "No account yet? Please contact the school administration.", backHome: "Back to home",
    comingSoon: "Coming soon", eventsSoon: "This school has not published any events yet. Check back soon.",
    gallerySoon: "This school has not published a gallery yet. Check back soon.",
    blogSoon: "This school has not published any articles yet. Check back soon.",
    enrollmentSoon: "Online applications are being prepared for this school. Please contact the school directly in the meantime.",
    notFoundTitle: "School website not available",
    notFoundText: "This school website does not exist or has not been published yet.",
    previewBanner: "Preview: this site is not published and is hidden from search engines.",
    founded: "Founded", location: "Location", schoolType: "School type", subsystem: "Subsystem",
    visitUs: "Visit us", breadcrumb: "Breadcrumb",
    upcomingEvents: "Upcoming events", galleryPreview: "Life at our school", latestPosts: "Latest from the blog",
    viewAll: "View all", enrollTitle: "Join our school",
    enrollText: "Admissions are open online. Fill in the application form and the school will contact you.",
  },
  fr: {
    skip: "Aller au contenu principal", home: "Accueil", about: "À propos", events: "Événements",
    gallery: "Galerie", blog: "Blog", login: "Connexion", enrollment: "Inscription", menu: "Menu",
    mainNav: "Navigation principale", language: "Langue", discover: "Découvrir notre école",
    applyNow: "Demander une admission", learnMore: "En savoir plus", aboutUs: "À propos de notre école",
    ourLeadership: "Notre direction", leadershipStructure: "Direction", ourTeam: "Notre équipe",
    teamNote: "Membres du personnel qui ont choisi d'apparaître ici.", identity: "Notre identité",
    motto: "Devise", vision: "Notre vision", mission: "Notre mission", values: "Valeurs",
    history: "Notre histoire", notShared: "Cette information n'a pas encore été communiquée.",
    quickLinks: "Liens rapides", contact: "Contact", footerRights: "Tous droits réservés.",
    poweredBy: "Propulsé par", principal: "Directeur", loginTitle: "Connectez-vous à votre compte",
    loginLead: "Le personnel, les élèves et les parents se connectent avec le compte fourni par l'école.",
    loginButton: "Continuer vers la connexion",
    loginHelp: "Pas encore de compte ? Veuillez contacter l'administration de l'école.",
    backHome: "Retour à l'accueil", comingSoon: "Bientôt disponible",
    eventsSoon: "Cette école n'a pas encore publié d'événements. Revenez bientôt.",
    gallerySoon: "Cette école n'a pas encore publié de galerie. Revenez bientôt.",
    blogSoon: "Cette école n'a pas encore publié d'articles. Revenez bientôt.",
    enrollmentSoon: "Les demandes en ligne sont en préparation pour cette école. Contactez directement l'école en attendant.",
    notFoundTitle: "Site de l'école indisponible",
    notFoundText: "Le site de cette école n'existe pas ou n'a pas encore été publié.",
    previewBanner: "Aperçu : ce site n'est pas publié et reste caché aux moteurs de recherche.",
    founded: "Fondée en", location: "Lieu", schoolType: "Type d'école", subsystem: "Sous-système",
    visitUs: "Nous rendre visite", breadcrumb: "Fil d'Ariane",
    upcomingEvents: "Événements à venir", galleryPreview: "La vie de notre école", latestPosts: "Dernières actualités",
    viewAll: "Tout voir", enrollTitle: "Rejoignez notre école",
    enrollText: "Les inscriptions se font en ligne. Remplissez le formulaire et l'école vous contactera.",
  },
};

/** First two sentences or so, trimmed for descriptions and previews. */
export function excerpt(text: string, max = 158): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 3).trimEnd()}...` : flat;
}

export function schoolSummary(school: PublicSchool, lang: SchoolLang): string {
  const text = pickText(school.seo.description, lang) || pickText(school.description, lang) || pickText(school.motto, lang);
  if (text) return excerpt(text);
  const place = schoolPlace(school);
  return lang === "fr"
    ? `${school.name} est une ecole${place ? ` a ${place}` : ""}, Cameroun.`
    : `${school.name} is a school${place ? ` in ${place}` : ""}, Cameroon.`;
}

type MetaInput = {
  school: PublicSchool;
  lang: SchoolLang;
  section: SchoolSection;
  /** Section label for the title, e.g. "About". Empty for the home page. */
  label?: string;
  description?: string;
  /** Pages with nothing to index (login, stubs) */
  noIndex?: boolean;
};

export function schoolMetadata({ school, lang, section, label, description, noIndex }: MetaInput): Metadata {
  const place = school.city_village || school.location;
  const seoTitle = pickText(school.seo.title, lang);
  const title = section === ""
    ? seoTitle || (place ? `${school.name}, ${place}` : school.name)
    : `${label || section} | ${school.name}`;
  const desc = description || schoolSummary(school, lang);
  const url = canonicalUrl(school, section, lang);
  const image = absoluteImage(school.seo.image) || absoluteImage(school.banner) || absoluteImage(school.logo);
  const bilingual = hasBothLanguages(school);
  // A language the school wrote nothing for would only duplicate the default page.
  const canonical = bilingual ? url : canonicalUrl(school, section, school.default_language);
  const hide = noIndex || !school.is_live || school.seo.noindex;

  return {
    title: { absolute: title },
    description: desc,
    alternates: {
      canonical,
      languages: bilingual
        ? {
            en: canonicalUrl(school, section, "en"),
            fr: canonicalUrl(school, section, "fr"),
            "x-default": canonicalUrl(school, section, school.default_language),
          }
        : undefined,
    },
    openGraph: {
      type: "website",
      url: canonical,
      title,
      description: desc,
      siteName: school.name,
      locale: lang === "fr" ? "fr_CM" : "en_CM",
      images: image ? [{ url: image, alt: school.name }] : undefined,
    },
    twitter: { card: image ? "summary_large_image" : "summary", title, description: desc },
    robots: hide ? { index: false, follow: false } : { index: true, follow: true },
  };
}

/** Schema.org School plus breadcrumbs. Only describes what the page visibly shows. */
export function schoolJsonLd(school: PublicSchool, lang: SchoolLang, crumbs: { name: string; section: SchoolSection }[]) {
  const url = canonicalUrl(school, "", lang);
  return [
    {
      "@context": "https://schema.org",
      "@type": "School",
      name: school.name,
      alternateName: school.short_name || undefined,
      description: schoolSummary(school, lang),
      url,
      inLanguage: lang,
      logo: absoluteImage(school.logo) || undefined,
      image: absoluteImage(school.banner) || absoluteImage(school.logo) || undefined,
      telephone: school.phone || undefined,
      email: school.email || undefined,
      foundingDate: school.founded_year ? String(school.founded_year) : undefined,
      address: {
        "@type": "PostalAddress",
        streetAddress: school.address || undefined,
        addressLocality: school.city_village || school.location || undefined,
        addressRegion: school.region || undefined,
        postalCode: school.postal_code || undefined,
        addressCountry: "CM",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: crumbs.map((crumb, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: crumb.name,
        item: canonicalUrl(school, crumb.section, lang),
      })),
    },
  ];
}
