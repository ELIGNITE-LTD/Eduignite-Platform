/**
 * Public school profiles (backend/apps/schools/public_profile.py). Readable
 * without signing in; the backend only returns schools whose profile is live
 * and only their own descriptive and contact details.
 *
 * The profile API is growing (vision, mission, history, EN/FR text, hero text,
 * leadership, publication state, enrollment switch, SEO). Pages never read the
 * raw response: `fetchPublicSchool` runs it through `normalizeSchool`, which
 * accepts the fields that exist today and every optional field the richer
 * profile may add, in several spellings, so new data lights up without code
 * changes. Missing data stays missing: pages show empty states, never samples.
 */

export type SchoolLang = "en" | "fr";
export const SCHOOL_LANGS: SchoolLang[] = ["en", "fr"];

/** One piece of text that may exist in a default form and/or per language. */
export type LocalizedText = { default?: string; en?: string; fr?: string };

export type PublicLeader = {
  name: string;
  title: string;
  photo: string | null;
  order: number;
  /** Short biography, when the school wrote one (configured leadership only). */
  bio?: string;
};

export type PublicSchool = {
  slug: string;
  name: string;
  short_name: string;
  motto: LocalizedText;
  description: LocalizedText;
  vision: LocalizedText;
  mission: LocalizedText;
  history: LocalizedText;
  hero_title: LocalizedText;
  hero_subtitle: LocalizedText;
  /** Core values: a list per language. */
  values: { default: string[]; en: string[]; fr: string[] };
  logo: string | null;
  banner: string | null;
  principal: string;
  location: string;
  region: string;
  division: string;
  sub_division: string;
  city_village: string;
  address: string;
  postal_code: string | null;
  phone: string;
  email: string;
  school_type: string;
  subsystem: string;
  founded_year: number | null;
  updated_at: string;
  /** Explicit leadership from the profile API, when it provides one. */
  leadership: PublicLeader[];
  enrollment_enabled: boolean;
  /** The school's own default language for its site. */
  default_language: SchoolLang;
  /** False when the API says this is a preview or not (yet) published. */
  is_live: boolean;
  seo: {
    title: LocalizedText;
    description: LocalizedText;
    image: string | null;
    noindex: boolean;
  };
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

type Raw = Record<string, unknown>;

function isRaw(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Reads `key` from `raw` as localized text. Accepts a plain string (default),
 * `{en, fr}` objects, sibling `key_en` / `key_fr` fields, and a nested
 * `translations: { fr: { key } }` block.
 */
function localized(raw: Raw, key: string): LocalizedText {
  const out: LocalizedText = {};
  const own = raw[key];
  if (typeof own === "string") {
    if (own.trim()) out.default = own.trim();
  } else if (isRaw(own)) {
    if (str(own.en)) out.en = str(own.en);
    if (str(own.fr)) out.fr = str(own.fr);
    if (str(own.default)) out.default = str(own.default);
  }
  for (const lang of SCHOOL_LANGS) {
    const sibling = str(raw[`${key}_${lang}`]);
    if (sibling) out[lang] = sibling;
    const translations = raw.translations ?? raw.i18n;
    if (isRaw(translations) && isRaw(translations[lang])) {
      const nested = str((translations[lang] as Raw)[key]);
      if (nested) out[lang] = nested;
    }
  }
  return out;
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => str(v)).filter(Boolean);
  if (typeof value === "string") return value.split(/\r?\n|;/).map((v) => v.trim()).filter(Boolean);
  return [];
}

function valuesFrom(raw: Raw): PublicSchool["values"] {
  const base = raw.values ?? raw.core_values;
  const out = { default: [] as string[], en: [] as string[], fr: [] as string[] };
  if (isRaw(base)) {
    out.en = stringList(base.en);
    out.fr = stringList(base.fr);
    out.default = stringList(base.default);
  } else {
    out.default = stringList(base);
  }
  const en = stringList(raw.values_en ?? raw.core_values_en);
  const fr = stringList(raw.values_fr ?? raw.core_values_fr);
  if (en.length) out.en = en;
  if (fr.length) out.fr = fr;
  return out;
}

function leadersFrom(value: unknown): PublicLeader[] {
  if (!Array.isArray(value)) return [];
  const leaders: PublicLeader[] = [];
  value.forEach((entry, index) => {
    if (!isRaw(entry)) return;
    const name = str(entry.name) || str(entry.display_name);
    if (!name) return;
    const photo = str(entry.photo) || str(entry.avatar) || str(entry.image);
    leaders.push({
      name,
      title: str(entry.title) || str(entry.public_title) || str(entry.role),
      photo: photo || null,
      order: typeof entry.order === "number" ? entry.order : index,
    });
  });
  return leaders.sort((a, b) => a.order - b.order);
}

function defaultLanguageFrom(raw: Raw): SchoolLang {
  const explicit = str(raw.default_language || raw.language).toLowerCase();
  if (explicit.startsWith("fr")) return "fr";
  if (explicit.startsWith("en")) return "en";
  const subsystem = str(raw.subsystem).toLowerCase();
  if (/fran|french/.test(subsystem) && !/anglo|english|bilingual|bilingue/.test(subsystem)) return "fr";
  return "en";
}

export function normalizeSchool(raw: Raw): PublicSchool {
  const seo = isRaw(raw.seo) ? raw.seo : {};
  const status = str(raw.publication_status || raw.status).toLowerCase();
  const isLive = raw.is_preview === true ? false : !status || status === "published" || status === "active";
  const year = Number(raw.founded_year);
  // Contact toggles: a field the school switched off is dropped even if the API still sent it.
  const showPhone = raw.show_phone !== false && raw.show_contact_phone !== false;
  const showEmail = raw.show_email !== false && raw.show_contact_email !== false;
  const showAddress = raw.show_address !== false && raw.show_contact_address !== false;

  return {
    slug: str(raw.slug),
    name: str(raw.name),
    short_name: str(raw.short_name),
    motto: localized(raw, "motto"),
    description: localized(raw, "description"),
    vision: localized(raw, "vision"),
    mission: localized(raw, "mission"),
    history: localized(raw, "history"),
    hero_title: localized(raw, "hero_title"),
    hero_subtitle: localized(raw, "hero_subtitle"),
    values: valuesFrom(raw),
    logo: str(raw.logo) || null,
    banner: str(raw.banner) || str(raw.hero_image) || null,
    principal: str(raw.principal),
    location: str(raw.location),
    region: str(raw.region),
    division: str(raw.division),
    sub_division: str(raw.sub_division),
    city_village: str(raw.city_village),
    address: showAddress ? str(raw.address) : "",
    postal_code: showAddress ? str(raw.postal_code) || null : null,
    phone: showPhone ? str(raw.phone) : "",
    email: showEmail ? str(raw.email) : "",
    school_type: str(raw.school_type),
    subsystem: str(raw.subsystem),
    founded_year: Number.isFinite(year) && year > 0 ? year : null,
    updated_at: str(raw.updated_at),
    leadership: leadersFrom(raw.leadership ?? raw.leaders),
    enrollment_enabled: raw.enrollment_enabled === true || raw.public_enrollment_enabled === true,
    default_language: defaultLanguageFrom(raw),
    is_live: isLive,
    seo: {
      title: localized(seo, "title"),
      description: localized(seo, "description"),
      image: str(seo.og_image) || str(seo.image) || null,
      noindex: seo.noindex === true || raw.noindex === true,
    },
  };
}

/** Picks the text for `lang`, falling back to the default text, then the other language. */
export function pickText(text: LocalizedText, lang: SchoolLang): string {
  const other: SchoolLang = lang === "en" ? "fr" : "en";
  return text[lang] || text.default || text[other] || "";
}

export function pickValues(values: PublicSchool["values"], lang: SchoolLang): string[] {
  const other: SchoolLang = lang === "en" ? "fr" : "en";
  if (values[lang].length) return values[lang];
  if (values.default.length) return values.default;
  return values[other];
}

/** True when the school wrote any of its public text in both languages. */
export function hasBothLanguages(school: PublicSchool): boolean {
  const texts = [
    school.motto, school.description, school.vision, school.mission, school.history,
    school.hero_title, school.hero_subtitle,
  ];
  return texts.some((t) => t.en && t.fr) || (school.values.en.length > 0 && school.values.fr.length > 0);
}

/**
 * Fetches one school's public profile. A `previewToken` (for the owner's
 * unpublished preview) bypasses the cache and is never indexed.
 */
export async function fetchPublicSchool(
  slug: string,
  options: { previewToken?: string } = {},
): Promise<PublicSchool | null> {
  try {
    const query = options.previewToken ? `?preview=${encodeURIComponent(options.previewToken)}` : "";
    const res = await fetch(
      `${API_BASE}/schools/public/${encodeURIComponent(slug)}/${query}`,
      options.previewToken ? { cache: "no-store" } : { next: { revalidate: 900 } },
    );
    if (!res.ok) return null;
    const raw = await res.json();
    if (!isRaw(raw)) return null;
    const school = normalizeSchool(raw);
    if (options.previewToken) school.is_live = false;
    return school.name ? { ...school, slug: school.slug || slug } : null;
  } catch {
    return null;
  }
}

export type PublicStaffMember = { name: string; title: string; avatar: string | null };

/**
 * A school's opt-in public staff directory. Returns people only when the school
 * enabled its directory and each staff member personally opted in; names,
 * titles and photos only, never contact details.
 */
export async function fetchPublicSchoolStaff(
  slug: string,
): Promise<{ enabled: boolean; staff: PublicStaffMember[] }> {
  try {
    const res = await fetch(`${API_BASE}/schools/public/${encodeURIComponent(slug)}/staff/`, {
      next: { revalidate: 900 },
    });
    if (!res.ok) return { enabled: false, staff: [] };
    return (await res.json()) as { enabled: boolean; staff: PublicStaffMember[] };
  } catch {
    return { enabled: false, staff: [] };
  }
}

export async function fetchPublicSchoolIndex(): Promise<{ slug: string; updated_at: string }[]> {
  try {
    const res = await fetch(`${API_BASE}/schools/public/`, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** An image address search engines and link previews can fetch (never a data: URL). */
export function absoluteImage(url?: string | null): string | null {
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : null;
}

/** "Buea, South West": the most specific place plus the region. */
export function schoolPlace(school: PublicSchool): string {
  return [school.city_village || school.location, school.region].filter(Boolean).join(", ");
}

const LEADER_TITLE = /principal|proviseur|head|director|directeur|directrice|vice|censeur|studies|etudes|études|discipline|surveillant|headmaster|headmistress|bursar|econome|économe/i;

/**
 * Leadership for the About and Home pages. Uses the profile API's own
 * leadership list when it has one; otherwise derives it from the school's
 * principal and the opt-in staff directory, so no staff record is duplicated.
 */
export function buildLeadership(
  school: PublicSchool,
  staff: PublicStaffMember[],
): { leaders: PublicLeader[]; team: PublicLeader[] } {
  const people: PublicLeader[] = staff.map((s, i) => ({ name: s.name, title: s.title, photo: s.avatar, order: i }));
  const key = (n: string) => n.trim().toLowerCase();

  if (school.leadership.length) {
    const named = new Set(school.leadership.map((l) => key(l.name)));
    return { leaders: school.leadership, team: people.filter((p) => !named.has(key(p.name))) };
  }

  const rank = (title: string) => {
    const t = title.toLowerCase();
    if (/vice|deputy|adjoint/.test(t)) return 1;
    if (/principal|proviseur|headmaster|headmistress|director|directeur|directrice/.test(t)) return 0;
    return 2;
  };
  const leaders = people.filter((p) => LEADER_TITLE.test(p.title)).sort((a, b) => rank(a.title) - rank(b.title));
  const team = people.filter((p) => !LEADER_TITLE.test(p.title));

  // The principal is already public on the profile; show them first even when they did not opt in as staff.
  if (school.principal && !people.some((p) => key(p.name) === key(school.principal))) {
    leaders.unshift({ name: school.principal, title: "", photo: null, order: -1 });
  }
  return { leaders, team };
}
