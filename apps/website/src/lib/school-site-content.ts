/**
 * Public events and gallery of a school website: server-side fetchers, types,
 * date helpers and interface text (English and French). Data comes only from
 * /api/v1/schools/public/<slug>/events|gallery, which returns published items of
 * published sites; nothing here invents content.
 */
import { resolveMediaUrl } from "@/lib/media";
import type { SchoolLang } from "@/lib/public-schools";
import { SITE_URL } from "@/lib/seo";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
const REVALIDATE_SECONDS = 300;

/** Cameroon local time: events are shown in Douala time wherever the reader is. */
export const SCHOOL_TZ = "Africa/Douala";

export type EventBucket = "upcoming" | "ongoing" | "past";
export const EVENT_BUCKETS: EventBucket[] = ["upcoming", "ongoing", "past"];

export type SiteEventCard = {
  slug: string;
  title: string;
  description: string;
  start_at: string;
  end_at: string | null;
  location: string;
  category: string;
  cover: string | null;
  bucket: EventBucket;
  updated_at: string;
};

export type Paged<T> = { count: number; page: number; page_size: number; num_pages: number; results: T[] };
export type EventList = Paged<SiteEventCard> & { when: string; counts: Record<EventBucket, number> };

export type GalleryImage = {
  id: string;
  url: string;
  thumb: string;
  width: number;
  height: number;
  caption: string;
  alt: string;
};
export type GalleryAlbum = {
  id: string;
  title: string;
  category: string;
  cover: string | null;
  media_count: number;
  updated_at: string;
  media?: GalleryImage[];
};
export type GalleryList = Paged<GalleryAlbum> & { category: string; category_counts: Record<string, number> };
export type AlbumDetail = Paged<GalleryImage> & { album: GalleryAlbum };

type FetchOptions = { slug: string; lang: SchoolLang; preview?: string };

async function getJson<T>(path: string, params: Record<string, string | number | undefined>, o: FetchOptions): Promise<T | null> {
  const query = new URLSearchParams({ lang: o.lang });
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== "") query.set(key, String(value));
  if (o.preview) query.set("preview", o.preview);
  try {
    const res = await fetch(
      `${API_BASE}/schools/public/${encodeURIComponent(o.slug)}/${path}?${query.toString()}`,
      o.preview ? { cache: "no-store" } : { next: { revalidate: REVALIDATE_SECONDS } },
    );
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

const img = (value?: string | null) => (value ? resolveMediaUrl(value) || null : null);

export async function fetchSiteEvents(
  o: FetchOptions & { when?: EventBucket | "all"; page?: number; pageSize?: number },
): Promise<EventList | null> {
  const data = await getJson<EventList>("events/", { when: o.when ?? "upcoming", page: o.page, page_size: o.pageSize }, o);
  return data ? { ...data, results: data.results.map((e) => ({ ...e, cover: img(e.cover) })) } : null;
}

export async function fetchSiteEvent(o: FetchOptions & { eventSlug: string }): Promise<SiteEventCard | null> {
  const data = await getJson<SiteEventCard>(`events/${encodeURIComponent(o.eventSlug)}/`, {}, o);
  return data ? { ...data, cover: img(data.cover) } : null;
}

export async function fetchSiteGallery(
  o: FetchOptions & { category?: string; page?: number; pageSize?: number },
): Promise<GalleryList | null> {
  const data = await getJson<GalleryList>("gallery/", { category: o.category, page: o.page, page_size: o.pageSize }, o);
  if (!data) return null;
  return {
    ...data,
    results: data.results.map((a) => ({
      ...a,
      cover: img(a.cover),
      media: a.media?.map((m) => ({ ...m, url: img(m.url) ?? "", thumb: img(m.thumb) ?? "" })),
    })),
  };
}

export async function fetchSiteAlbum(
  o: FetchOptions & { albumId: string; page?: number; pageSize?: number },
): Promise<AlbumDetail | null> {
  const data = await getJson<AlbumDetail>(`gallery/${encodeURIComponent(o.albumId)}/`, { page: o.page, page_size: o.pageSize }, o);
  if (!data) return null;
  return {
    ...data,
    album: { ...data.album, cover: img(data.album.cover) },
    results: data.results.map((m) => ({ ...m, url: img(m.url) ?? "", thumb: img(m.thumb) ?? "" })),
  };
}

/** Sitemap entries for published events and galleries of published school sites (one API call). */
export async function fetchSchoolSiteContentUrls(
  knownSlugs: string[],
): Promise<{ url: string; lastModified: Date; changeFrequency: "weekly" | "monthly"; priority: number }[]> {
  try {
    const res = await fetch(`${API_BASE}/schools/public-content/index/`, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      events: { school: string; slug: string; updated_at: string }[];
      galleries: { school: string; updated_at: string }[];
    };
    const origin = SITE_URL.replace(/\/$/, "");
    const known = new Set(knownSlugs);
    const entry = (path: string, when: string, changeFrequency: "weekly" | "monthly", priority: number) => ({
      url: `${origin}${path}`, lastModified: new Date(when), changeFrequency, priority,
    });
    return [
      ...data.events.filter((e) => known.has(e.school)).map((e) =>
        entry(`/schools/${e.school}/events/${encodeURIComponent(e.slug)}`, e.updated_at, "monthly", 0.4)),
      ...data.galleries.filter((g) => known.has(g.school)).map((g) =>
        entry(`/schools/${g.school}/gallery`, g.updated_at, "weekly", 0.4)),
    ];
  } catch {
    return [];
  }
}

export function pickPositive(value: string | string[] | undefined, fallback = 1): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

// ---- dates (Douala time) ------------------------------------------------------

const locale = (lang: SchoolLang) => (lang === "fr" ? "fr-CM" : "en-CM");

function parts(iso: string, lang: SchoolLang, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locale(lang), { timeZone: SCHOOL_TZ, ...options }).format(new Date(iso));
}

export const badgeDay = (iso: string, lang: SchoolLang) => parts(iso, lang, { day: "2-digit" });
export const badgeMonth = (iso: string, lang: SchoolLang) => parts(iso, lang, { month: "short" }).replace(".", "");
export const longDate = (iso: string, lang: SchoolLang) => parts(iso, lang, { dateStyle: "full" });
export const timeOnly = (iso: string, lang: SchoolLang) => parts(iso, lang, { timeStyle: "short" });

const dayKey = (iso: string) => parts(iso, "en", { year: "numeric", month: "2-digit", day: "2-digit" });

/** "Saturday, 20 June 2026, 09:00" or "20 June, 09:00 to 21 June, 17:00" in Douala time. */
export function dateRange(start: string, end: string | null, lang: SchoolLang): string {
  const sTime = timeOnly(start, lang);
  if (!end || dayKey(start) === dayKey(end)) {
    const endTime = end ? ` – ${timeOnly(end, lang)}` : "";
    return `${longDate(start, lang)}, ${sTime}${endTime}`;
  }
  return `${longDate(start, lang)}, ${sTime} → ${longDate(end, lang)}, ${timeOnly(end, lang)}`;
}

// ---- text ----------------------------------------------------------------------

export const CONTENT_TEXT = {
  en: {
    upcoming: "Upcoming", ongoing: "Ongoing", past: "Past", eventsTitle: "School events",
    eventsLead: "What is happening at our school.", noUpcoming: "No upcoming events right now.",
    noOngoing: "No events are taking place right now.", noPast: "No past events to show.",
    noEvents: "This school has not published any events yet. Check back soon.",
    viewEvent: "View details", backToEvents: "Back to events", when: "When", where: "Where", category: "Category",
    allEvents: "All events", upcomingEvents: "Upcoming events", eventStatus: "Event status",
    galleryTitle: "Photo gallery", galleryLead: "Moments from life at our school.", all: "All",
    noGallery: "This school has not published any photos yet. Check back soon.",
    noGalleryCategory: "No albums in this category yet.", viewAlbum: "View all photos", photos: "photos", photo: "photo",
    backToGallery: "Back to gallery", galleryPreview: "From our gallery", seeGallery: "See the full gallery",
    close: "Close", previous: "Previous", next: "Next", image: "Image", of: "of", enlarge: "Enlarge photo",
    pagination: "Pagination", page: "Page", prevPage: "Previous page", nextPage: "Next page",
    viewAllEvents: "All events", categories: "Gallery categories", eventTabs: "Event periods",
    cat: {
      academic: "Academic", cultural: "Cultural", sports: "Sports", ceremony: "Ceremony", meeting: "Meeting",
      holiday: "Holiday", other: "Other", campus: "Campus", classrooms: "Classrooms", labs: "Labs", events: "Events",
    } as Record<string, string>,
  },
  fr: {
    upcoming: "À venir", ongoing: "En cours", past: "Passés", eventsTitle: "Événements de l'école",
    eventsLead: "Ce qui se passe dans notre école.", noUpcoming: "Aucun événement à venir pour le moment.",
    noOngoing: "Aucun événement n'est en cours actuellement.", noPast: "Aucun événement passé à afficher.",
    noEvents: "Cette école n'a pas encore publié d'événements. Revenez bientôt.",
    viewEvent: "Voir les détails", backToEvents: "Retour aux événements", when: "Quand", where: "Où", category: "Catégorie",
    allEvents: "Tous les événements", upcomingEvents: "Événements à venir", eventStatus: "Statut de l'événement",
    galleryTitle: "Galerie photo", galleryLead: "Des moments de la vie de notre école.", all: "Tout",
    noGallery: "Cette école n'a pas encore publié de photos. Revenez bientôt.",
    noGalleryCategory: "Aucun album dans cette catégorie pour le moment.", viewAlbum: "Voir toutes les photos", photos: "photos", photo: "photo",
    backToGallery: "Retour à la galerie", galleryPreview: "Notre galerie", seeGallery: "Voir toute la galerie",
    close: "Fermer", previous: "Précédente", next: "Suivante", image: "Image", of: "sur", enlarge: "Agrandir la photo",
    pagination: "Pagination", page: "Page", prevPage: "Page précédente", nextPage: "Page suivante",
    viewAllEvents: "Tous les événements", categories: "Catégories de la galerie", eventTabs: "Périodes des événements",
    cat: {
      academic: "Académique", cultural: "Culturel", sports: "Sport", ceremony: "Cérémonie", meeting: "Réunion",
      holiday: "Vacances", other: "Autre", campus: "Campus", classrooms: "Salles de classe", labs: "Laboratoires", events: "Événements",
    } as Record<string, string>,
  },
} as const;

export type ContentText = (typeof CONTENT_TEXT)["en"] | (typeof CONTENT_TEXT)["fr"];
