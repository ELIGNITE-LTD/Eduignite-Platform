/**
 * Defensive reads of a school's published Events, Gallery and Blog for the
 * public site shell and Home previews. Endpoint: /schools/public/{slug}/{kind}/.
 *
 * Until the endpoint exists (404) or while the school has published nothing,
 * the result is an empty list, and the site hides that nav entry and Home
 * section instead of showing a placeholder. Server-side only.
 */
import type { SchoolLang } from "@/lib/public-schools";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export type ContentKind = "events" | "gallery" | "blog";

export type SiteItem = {
  id: string;
  title: string;
  excerpt: string;
  image: string | null;
  date: string | null;
};

type Raw = Record<string, unknown>;

function text(value: unknown, lang: SchoolLang): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") {
    const o = value as Raw;
    const pick = o[lang] ?? o.default ?? o.en ?? o.fr;
    return typeof pick === "string" ? pick.trim() : "";
  }
  return "";
}

function field(raw: Raw, keys: string[], lang: SchoolLang): string {
  for (const key of keys) {
    const v = text(raw[`${key}_${lang}`], lang) || text(raw[key], lang);
    if (v) return v;
  }
  return "";
}

function normalize(raw: Raw, lang: SchoolLang, index: number): SiteItem | null {
  const title = field(raw, ["title", "name", "caption"], lang);
  const image = field(raw, ["image", "cover_image", "cover", "thumbnail", "photo", "url"], lang);
  if (!title && !image) return null;
  return {
    id: String(raw.id ?? raw.slug ?? index),
    title,
    excerpt: field(raw, ["excerpt", "summary", "description"], lang),
    image: image || null,
    date: field(raw, ["start_date", "starts_at", "date", "published_at", "created_at"], lang) || null,
  };
}

/** Published items of one kind, newest first as the API orders them. Empty on 404, errors or no content. */
export async function fetchSiteItems(slug: string, kind: ContentKind, lang: SchoolLang, limit = 12): Promise<SiteItem[]> {
  try {
    const res = await fetch(`${API_BASE}/schools/public/${encodeURIComponent(slug)}/${kind}/`, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    const data = await res.json();
    const rows: unknown = Array.isArray(data) ? data : (data as Raw)?.results ?? (data as Raw)?.[kind] ?? (data as Raw)?.items;
    if (!Array.isArray(rows)) return [];
    return rows
      .map((row, i) => (row && typeof row === "object" ? normalize(row as Raw, lang, i) : null))
      .filter((item): item is SiteItem => item !== null)
      .slice(0, limit);
  } catch {
    return [];
  }
}

export type SectionPresence = { events: boolean; gallery: boolean; blog: boolean };

/** Which optional sections have published content (drives navigation and sitemap). */
export async function fetchSectionPresence(slug: string): Promise<SectionPresence> {
  const [events, gallery, blog] = await Promise.all([
    fetchSiteItems(slug, "events", "en", 1),
    fetchSiteItems(slug, "gallery", "en", 1),
    fetchSiteItems(slug, "blog", "en", 1),
  ]);
  return { events: events.length > 0, gallery: gallery.length > 0, blog: blog.length > 0 };
}
