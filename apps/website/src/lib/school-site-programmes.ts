/**
 * Programmes and departments of a higher-education institution, read from the
 * public endpoints /schools/public/{slug}/programmes/ and .../departments/.
 *
 * Defensive by design: a 404 (endpoint not deployed yet), a network error, or
 * an institution with nothing published all yield an empty list, and the site
 * then renders nothing for programmes. No sample or fallback data, ever.
 * Also holds brand-colour maths (with a contrast-safe fallback), the EN/FR
 * wording for these sections, and the schema.org JSON-LD for /programmes.
 * Server-side only.
 */
import type { PublicSchool, SchoolLang } from "@/lib/public-schools";
import { canonicalUrl } from "@/lib/school-site";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export type Programme = {
  id: string;
  name: string;
  award_level: string;
  award_level_label: string;
  duration_years: number | null;
  required_credits: number | null;
  department_name: string;
  description: string;
};

export type Department = { id: string; name: string; parent_name: string };

type Raw = Record<string, unknown>;

function s(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function n(v: unknown): number | null {
  const x = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(x) && x > 0 ? x : null;
}
function rowsOf(data: unknown): Raw[] {
  const rows: unknown = Array.isArray(data) ? data : (data as Raw | null)?.results;
  return Array.isArray(rows) ? rows.filter((r): r is Raw => !!r && typeof r === "object" && !Array.isArray(r)) : [];
}

async function getRows(slug: string, kind: "programmes" | "departments"): Promise<Raw[]> {
  try {
    const res = await fetch(`${API_BASE}/schools/public/${encodeURIComponent(slug)}/${kind}/`, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    return rowsOf(await res.json());
  } catch {
    return [];
  }
}

export async function fetchPublicProgrammes(slug: string): Promise<Programme[]> {
  const rows = await getRows(slug, "programmes");
  const out: Programme[] = [];
  rows.forEach((r, i) => {
    const name = s(r.name);
    if (!name) return;
    out.push({
      id: String(r.id ?? i),
      name,
      award_level: s(r.award_level).toLowerCase(),
      award_level_label: s(r.award_level_label) || s(r.award_level),
      duration_years: n(r.duration_years),
      required_credits: n(r.required_credits),
      department_name: s(r.department_name),
      description: s(r.description),
    });
  });
  return out;
}

export async function fetchPublicDepartments(slug: string): Promise<Department[]> {
  const rows = await getRows(slug, "departments");
  const out: Department[] = [];
  rows.forEach((r, i) => {
    const name = s(r.name);
    if (name) out.push({ id: String(r.id ?? i), name, parent_name: s(r.parent_name) });
  });
  return out;
}

// ---- Grouping ----

/** Display order of award levels; anything unknown follows, alphabetically. */
const LEVEL_ORDER = ["licence", "master", "doctorat", "hnd", "bts", "diploma", "certificate"];

/** Maps the many spellings of an award level onto one of LEVEL_ORDER (or the cleaned raw key). */
export function levelKey(raw: string): string {
  const v = raw.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");
  if (/^(licen[cs]e|bachelor|bsc|ba$)/.test(v)) return "licence";
  if (/^(master|msc|ma$)/.test(v)) return "master";
  if (/^(doctora|doctor|phd)/.test(v)) return "doctorat";
  if (v === "hnd" || v.startsWith("highernational")) return "hnd";
  if (v === "bts" || v.startsWith("brevetdetechnicien")) return "bts";
  if (v.startsWith("diplom")) return "diploma";
  if (v.startsWith("certif")) return "certificate";
  return v || "other";
}

export type ProgrammeGroup = { key: string; label: string; programmes: Programme[] };

export function groupByLevel(programmes: Programme[]): ProgrammeGroup[] {
  const map = new Map<string, ProgrammeGroup>();
  for (const p of programmes) {
    const key = levelKey(p.award_level || p.award_level_label);
    const g = map.get(key) ?? { key, label: p.award_level_label || p.award_level || key, programmes: [] };
    g.programmes.push(p);
    map.set(key, g);
  }
  const rank = (k: string) => {
    const i = LEVEL_ORDER.indexOf(k);
    return i === -1 ? LEVEL_ORDER.length : i;
  };
  return [...map.values()].sort((a, b) => rank(a.key) - rank(b.key) || a.label.localeCompare(b.label));
}

export type FacultyGroup = { faculty: string; departments: string[] };

/**
 * Faculties with their departments. A department with a parent belongs to that
 * parent; a top-level unit that is nobody's parent is listed on its own. Names
 * only, so links can filter programmes by department_name.
 */
export function facultyGroups(departments: Department[]): FacultyGroup[] {
  const parents = new Map<string, string[]>();
  for (const d of departments) {
    if (d.parent_name) parents.set(d.parent_name, [...(parents.get(d.parent_name) ?? []), d.name]);
  }
  const groups: FacultyGroup[] = [...parents.entries()].map(([faculty, names]) => ({ faculty, departments: names }));
  const loose = departments.filter((d) => !d.parent_name && !parents.has(d.name)).map((d) => d.name);
  if (loose.length) groups.push({ faculty: "", departments: loose });
  return groups;
}

/** Adds department / level filters to a school page href that may already carry ?lang= or ?preview=. */
export function programmeHref(base: string, params: { department?: string; level?: string }): string {
  const [path, query] = base.split("?");
  const qs = new URLSearchParams(query ?? "");
  if (params.department) qs.set("department", params.department);
  if (params.level) qs.set("level", params.level);
  const out = qs.toString();
  return out ? `${path}?${out}` : path;
}

// ---- Wording ----

export type ProgText = {
  academics: string; programmes: string; programmesLead: string; allProgrammes: string;
  facultiesDepartments: string; byLevel: string; years: string; year: string; credits: string;
  department: string; level: string; allDepartments: string; allLevels: string; apply: string; reset: string;
  filters: string; shown: string; none: string; noMatch: string; duration: string; viewAll: string;
};

const PT: Record<SchoolLang, ProgText> = {
  en: {
    academics: "Academics", programmes: "Programmes", programmesLead: "Degrees, diplomas and certificates offered by the institution.",
    allProgrammes: "All programmes", facultiesDepartments: "Faculties and departments", byLevel: "Programmes by level",
    years: "years", year: "year", credits: "credits", department: "Department", level: "Award level",
    allDepartments: "All departments", allLevels: "All levels", apply: "Apply filters", reset: "Clear filters",
    filters: "Filter programmes", shown: "shown", none: "This institution has not published its programmes yet. Check back soon.",
    noMatch: "No programme matches these filters.", duration: "Duration", viewAll: "Explore all programmes",
  },
  fr: {
    academics: "Formations", programmes: "Programmes", programmesLead: "Diplômes, licences et certificats proposés par l'établissement.",
    allProgrammes: "Tous les programmes", facultiesDepartments: "Facultés et départements", byLevel: "Programmes par niveau",
    years: "ans", year: "an", credits: "crédits", department: "Département", level: "Niveau de diplôme",
    allDepartments: "Tous les départements", allLevels: "Tous les niveaux", apply: "Appliquer", reset: "Réinitialiser",
    filters: "Filtrer les programmes", shown: "affichés", none: "Cet établissement n'a pas encore publié ses programmes. Revenez bientôt.",
    noMatch: "Aucun programme ne correspond à ces filtres.", duration: "Durée", viewAll: "Voir tous les programmes",
  },
};
export const progText = (lang: SchoolLang): ProgText => PT[lang];

export function durationLabel(years: number, pt: ProgText): string {
  const v = Number.isInteger(years) ? String(years) : String(Math.round(years * 10) / 10);
  return `${v} ${years === 1 ? pt.year : pt.years}`;
}

// ---- JSON-LD ----

/** ISO 8601 duration: whole years as PnY, otherwise months. */
function isoDuration(years: number): string {
  return Number.isInteger(years) ? `P${years}Y` : `P${Math.round(years * 12)}M`;
}

/** ItemList of EducationalOccupationalProgram, one per real programme listed on the page. */
export function programmesJsonLd(school: PublicSchool, lang: SchoolLang, programmes: Programme[]) {
  const pageUrl = canonicalUrl(school, "programmes", lang);
  const provider = { "@type": "CollegeOrUniversity", name: school.name, url: canonicalUrl(school, "", lang) };
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: lang === "fr" ? `Programmes de ${school.name}` : `Programmes at ${school.name}`,
    url: pageUrl,
    numberOfItems: programmes.length,
    itemListElement: programmes.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "EducationalOccupationalProgram",
        name: p.name,
        description: p.description || undefined,
        url: `${pageUrl}#programme-${encodeURIComponent(p.id)}`,
        provider,
        educationalCredentialAwarded: p.award_level_label || undefined,
        timeToComplete: p.duration_years ? isoDuration(p.duration_years) : undefined,
        numberOfCredits: p.required_credits ?? undefined,
        inLanguage: lang,
      },
    })),
  };
}

// ---- Brand colour ----

type RGB = [number, number, number];

function toRgb(hex: string): RGB {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
function toHex(rgb: RGB): string {
  return `#${rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("")}`;
}
function luminance([r, g, b]: RGB): number {
  const f = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function contrast(a: string, b: string): number {
  const [la, lb] = [luminance(toRgb(a)), luminance(toRgb(b))];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
function mix(a: string, b: string, t: number): string {
  const [x, y] = [toRgb(a), toRgb(b)];
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}
/** Moves `hex` toward `target` in small steps until it reaches `min` contrast against `against`; null if it never does. */
function pushUntil(hex: string, target: string, against: string, min: number): string | null {
  for (let i = 0; i <= 25; i++) {
    const c = mix(hex, target, i / 25);
    if (contrast(c, against) >= min) return c;
  }
  return null;
}

/**
 * CSS for the brand palette, or "" to keep the stock navy and brass. Every
 * derived colour is checked against what it is read on:
 *  - hero/banner gradient: white text at 7:1 or better
 *  - accent on light paper and on the dark surface: 5.5:1 or better
 *  - bright accent (buttons on the gradient): dark ink text at 7:1 or better
 * If a check cannot be met, the stock palette is used. `brand` is a validated
 * "#rrggbb" (see normalizeSchool), so the output is safe to inline in <style>.
 */
export function brandCss(brand: string | null): string {
  if (!brand || !/^#[0-9a-f]{6}$/.test(brand)) return "";
  const WHITE = "#ffffff", BLACK = "#000000", INK = "#0f1c2e", PAPER = "#f6f7f9", DARK = "#0a111c";
  const accentLight = pushUntil(brand, BLACK, PAPER, 5.5);
  const accentDark = pushUntil(brand, WHITE, DARK, 5.5);
  const bright = pushUntil(brand, WHITE, INK, 7);
  if (!accentLight || !accentDark || !bright) return "";
  // Darken the gradient until white text AND the bright accent both read on it.
  let base: string | null = null;
  for (const min of [7, 10, 14]) {
    const c = pushUntil(brand, BLACK, WHITE, min);
    if (c && contrast(bright, c) >= 4.5) { base = c; break; }
  }
  if (!base) return "";
  const from = mix(base, BLACK, 0.5);
  const lifted = mix(base, WHITE, 0.1);
  const to = contrast(lifted, WHITE) >= 4.5 && contrast(bright, lifted) >= 4.5 ? lifted : base;
  return (
    `.he-site.he-brand{--he-accent:${accentLight};--he-accent-bright:${bright};--he-brass:${bright};--he-brass-fg:${INK};` +
    `--he-hero-from:${from};--he-hero-via:${base};--he-hero-to:${to};--he-btn-bg:${base};--he-ink-2:${base};}` +
    `@media (prefers-color-scheme:dark){.he-site.he-brand{--he-accent:${accentDark};--he-btn-bg:${bright};--he-btn-fg:${INK};}}`
  );
}
