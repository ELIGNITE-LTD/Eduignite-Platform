/**
 * Pure helpers for the higher-education "Quick setup" wizard: theme presets,
 * the colour contrast check and hero palette (same thresholds as brandCss in
 * school-site-programmes.ts, which is server-side and not shipped to the mobile
 * and desktop apps), and the publish checklist built from the backend's
 * publish_errors keys. No React, no network: easy to unit test.
 */

export type ThemePreset = { key: string; en: string; fr: string; hex: string };

/** Each preset is safe for white text on the hero and passes the brand check. */
export const THEME_PRESETS: readonly ThemePreset[] = [
  { key: "navy-brass", en: "Navy & Brass", fr: "Bleu marine et laiton", hex: "#1e3a8a" },
  { key: "forest", en: "Forest", fr: "Foret", hex: "#166534" },
  { key: "burgundy", en: "Burgundy", fr: "Bordeaux", hex: "#7f1d1d" },
  { key: "slate", en: "Slate", fr: "Ardoise", hex: "#334155" },
];

export const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;

export function normalizeHex(value: string): string | null {
  const v = value.trim();
  if (/^#[0-9a-fA-F]{3}$/.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`.toLowerCase();
  return HEX_COLOUR.test(v) ? v.toLowerCase() : null;
}

type RGB = [number, number, number];
const toRgb = (hex: string): RGB => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const toHex = (rgb: RGB) => `#${rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("")}`;

function luminance([r, g, b]: RGB): number {
  const f = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** WCAG contrast ratio between two "#rrggbb" colours (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const [la, lb] = [luminance(toRgb(a)), luminance(toRgb(b))];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function mix(a: string, b: string, t: number): string {
  const [x, y] = [toRgb(a), toRgb(b)];
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

function pushUntil(hex: string, target: string, against: string, min: number): string | null {
  for (let i = 0; i <= 25; i++) {
    const c = mix(hex, target, i / 25);
    if (contrastRatio(c, against) >= min) return c;
  }
  return null;
}

export type HeroPalette = { from: string; via: string; to: string; bright: string; ink: string };

/**
 * The hero colours the public site derives from a brand colour, or null when
 * the colour cannot be made readable (the site then keeps its stock palette).
 */
export function heroPalette(brand: string): HeroPalette | null {
  const hex = normalizeHex(brand);
  if (!hex) return null;
  const INK = "#0f1c2e";
  const bright = pushUntil(hex, "#ffffff", INK, 7);
  if (!bright) return null;
  let base: string | null = null;
  for (const min of [7, 10, 14]) {
    const c = pushUntil(hex, "#000000", "#ffffff", min);
    if (c && contrastRatio(bright, c) >= 4.5) { base = c; break; }
  }
  if (!base) return null;
  const lifted = mix(base, "#ffffff", 0.1);
  const to = contrastRatio(lifted, "#ffffff") >= 4.5 && contrastRatio(bright, lifted) >= 4.5 ? lifted : base;
  return { from: mix(base, "#000000", 0.5), via: base, to, bright, ink: INK };
}

export type ContrastLevel = "invalid" | "great" | "adjusted" | "stock";

export type ContrastReport = {
  level: ContrastLevel;
  /** White text on the colour exactly as chosen. */
  ratio: number;
  /** Colours to render in the preview (the colour as the site will show it). */
  palette: HeroPalette | null;
};

/**
 * great: the chosen colour is dark enough as it is. adjusted: the site will
 * darken it a little so white text stays readable. stock: too extreme (for
 * example near white), the site keeps its standard navy and brass.
 */
export function contrastReport(brand: string): ContrastReport {
  const hex = normalizeHex(brand);
  if (!hex) return { level: "invalid", ratio: 0, palette: null };
  const ratio = contrastRatio(hex, "#ffffff");
  const palette = heroPalette(hex);
  if (!palette) return { level: "stock", ratio, palette: null };
  return { level: ratio >= 7 ? "great" : "adjusted", ratio, palette };
}

/** The preset whose colour equals `hex`, if any. */
export function matchPreset(hex: string): ThemePreset | undefined {
  const n = normalizeHex(hex);
  return n ? THEME_PRESETS.find((p) => p.hex === n) : undefined;
}

// ---- Publish checklist ----

export type WizardStep = 0 | 1 | 2;

export type ChecklistItem = {
  key: string;
  en: string;
  fr: string;
  done: boolean;
  /** Wizard step that fixes it; null when only the platform can (shown as info). */
  fixStep: WizardStep | null;
  /** Backend message when it is missing. */
  message?: string;
};

/**
 * One row per rule in backend publish_errors (public_site_services.py), in the
 * order a person fixes them. `blockers` is profile.publish_blockers.
 */
export function buildChecklist(blockers: Record<string, string> | undefined | null): ChecklistItem[] {
  const b = blockers ?? {};
  const rows: Array<Omit<ChecklistItem, "done" | "message">> = [
    { key: "name", en: "School name", fr: "Nom de l'etablissement", fixStep: null },
    { key: "description", en: "Short description", fr: "Courte description", fixStep: 0 },
    { key: "contact", en: "Email or phone number", fr: "Email ou numero de telephone", fixStep: 0 },
    { key: "slug", en: "Public web address", fr: "Adresse web publique", fixStep: null },
    { key: "school", en: "School account is active", fr: "Compte de l'etablissement actif", fixStep: null },
    { key: "public_profile_enabled", en: "Public pages enabled by EduIgnite", fr: "Pages publiques activees par EduIgnite", fixStep: null },
  ];
  const known = new Set(rows.map((r) => r.key));
  const items: ChecklistItem[] = rows.map((r) => ({ ...r, done: !(r.key in b), message: b[r.key] }));
  // A rule added to the backend later still blocks publishing: show it rather than hide it.
  for (const [key, message] of Object.entries(b)) {
    if (!known.has(key)) items.push({ key, en: message, fr: message, done: false, fixStep: null, message });
  }
  return items;
}

export const missingCount = (items: ChecklistItem[]) => items.filter((i) => !i.done).length;

/** Loose email check, enough to stop obvious typos before saving. */
export function isPlausibleEmail(value: string): boolean {
  const v = value.trim();
  return v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}
