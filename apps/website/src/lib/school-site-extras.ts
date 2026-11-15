/**
 * Pure helpers for the public site's WhatsApp button, Mobile Money block and
 * MINESUP accreditation badge. No React, no network: easy to unit test.
 */

export type AccreditationLevel = "none" | "authorized" | "approved" | "homologated";

export type Accreditation = {
  level: AccreditationLevel;
  reference: string;
  date: string | null;
  verified: boolean;
};

export const MINESUP_URL = "https://www.minesup.gov.cm";

const LEVELS: AccreditationLevel[] = ["none", "authorized", "approved", "homologated"];

export const ACCREDITATION_LABELS: Record<AccreditationLevel, { en: string; fr: string }> = {
  none: { en: "None", fr: "Aucune" },
  authorized: { en: "Authorized", fr: "Autorise" },
  approved: { en: "Approved", fr: "Agree" },
  homologated: { en: "Homologated", fr: "Homologue" },
};

/** Digits only; "" when what is left is not a plausible international number (8 to 15 digits). */
export function whatsappDigits(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 ? digits : "";
}

export function whatsappMessage(schoolName: string, lang: "en" | "fr"): string {
  return lang === "fr"
    ? `Bonjour, je souhaite m'informer sur l'admission a ${schoolName}.`
    : `Hello, I am interested in admission to ${schoolName}.`;
}

/** https://wa.me/<digits>?text=<encoded message>, or null when there is no usable number. */
export function buildWhatsAppLink(number: unknown, schoolName: string, lang: "en" | "fr"): string | null {
  const digits = whatsappDigits(number);
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(whatsappMessage(schoolName, lang))}`;
}

/** Reads the API's accreditation object defensively: unknown input becomes "none", never "verified". */
export function parseAccreditation(raw: unknown): Accreditation {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const level = LEVELS.includes(o.level as AccreditationLevel) ? (o.level as AccreditationLevel) : "none";
  return {
    level,
    reference: typeof o.reference === "string" ? o.reference.trim().slice(0, 120) : "",
    date: typeof o.date === "string" && o.date ? o.date : null,
    verified: level !== "none" && o.verified === true,
  };
}

/** What to show: nothing for level "none", "verified" only when the platform verified it, else "declared". */
export function accreditationState(a: Accreditation): "hidden" | "verified" | "declared" {
  if (a.level === "none") return "hidden";
  return a.verified ? "verified" : "declared";
}
