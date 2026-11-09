/** Interface text and link helpers of the blog pages (kept apart so the shared school-site dictionary stays untouched). */
import type { SchoolLang } from "@/lib/public-schools";

export const BLOG_TEXT: Record<SchoolLang, {
  title: string; lead: string; empty: string; allCategories: string; categories: string; readMore: string;
  minRead: (n: number) => string; by: string; previous: string; next: string; pagination: string;
  page: (n: number, total: number) => string; backToBlog: string; published: string; noPostsInCategory: string;
  preview: string; prevPage: string; nextPage: string;
}> = {
  en: {
    title: "News & Blog", lead: "Stories, announcements and news from our school.",
    empty: "This school has not published any articles yet. Check back soon.",
    allCategories: "All", categories: "Filter by category", readMore: "Read article",
    minRead: (n) => `${n} min read`, by: "By", previous: "Previous article", next: "Next article",
    pagination: "Pagination", page: (n, total) => `Page ${n} of ${total}`, backToBlog: "All articles",
    published: "Published", noPostsInCategory: "No article in this category yet.",
    preview: "Preview of an unpublished article. It is hidden from search engines.",
    prevPage: "Previous page", nextPage: "Next page",
  },
  fr: {
    title: "Actualités et blog", lead: "Articles, annonces et nouvelles de notre école.",
    empty: "Cette école n'a pas encore publié d'articles. Revenez bientôt.",
    allCategories: "Tous", categories: "Filtrer par catégorie", readMore: "Lire l'article",
    minRead: (n) => `${n} min de lecture`, by: "Par", previous: "Article précédent", next: "Article suivant",
    pagination: "Pagination", page: (n, total) => `Page ${n} sur ${total}`, backToBlog: "Tous les articles",
    published: "Publié le", noPostsInCategory: "Aucun article dans cette catégorie pour l'instant.",
    preview: "Aperçu d'un article non publié. Il est caché aux moteurs de recherche.",
    prevPage: "Page précédente", nextPage: "Page suivante",
  },
};

/** Path to a blog page of a school, keeping language, site-preview token and filters. */
export function blogHref(
  school: { slug: string; default_language: SchoolLang },
  lang: SchoolLang,
  options: { preview?: string; postSlug?: string; page?: number; category?: string; postPreview?: string } = {},
): string {
  const base = `/schools/${school.slug}/blog${options.postSlug ? `/${options.postSlug}` : ""}`;
  const params = new URLSearchParams();
  if (lang !== school.default_language) params.set("lang", lang);
  if (options.preview) params.set("preview", options.preview);
  if (options.postPreview) params.set("post_preview", options.postPreview);
  if (options.category) params.set("category", options.category);
  if (options.page && options.page > 1) params.set("page", String(options.page));
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/** Dates as the visitor's language writes them. */
export function formatPostDate(value: string | null | undefined, lang: SchoolLang): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString(lang === "fr" ? "fr-CM" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
}
