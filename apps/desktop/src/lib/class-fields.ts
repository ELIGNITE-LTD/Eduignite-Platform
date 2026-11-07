/**
 * The details a student carries that come from their class.
 *
 * Mirrors `backend/apps/students/class_sync.py`, which is the source of truth:
 * the server recomputes these whenever a class is set or edited, so this is
 * only used to PREVIEW what will be saved. Never send these as authoritative.
 */

export function inferClassLevel(className: string | null | undefined): string {
  const raw = (className || "").trim();
  const label = raw.toLowerCase();
  const normalized = label.replace(/ /g, "");
  if (label.includes("upper sixth") || normalized.includes("upper6") || normalized.includes("uppersixth")) return "Upper Sixth";
  if (label.includes("lower sixth") || normalized.includes("lower6") || normalized.includes("lowersixth")) return "Lower Sixth";
  for (const level of ["form1", "form2", "form3", "form4", "form5"]) {
    if (normalized.includes(level)) return level.replace("form", "Form ");
  }
  if (normalized.includes("6eme") || normalized === "6e") return "6eme";
  if (normalized.includes("5eme") || normalized === "5e") return "5eme";
  if (normalized.includes("4eme") || normalized === "4e") return "4eme";
  if (normalized.includes("3eme") || normalized === "3e") return "3eme";
  if (normalized.includes("2nde") || normalized.includes("seconde")) return "2nde";
  if (normalized.includes("premiere") || normalized.includes("1ere")) return "Premiere";
  if (normalized.includes("terminale") || normalized === "tle") return "Terminale";
  return raw || "Current Class";
}

export function inferSection(className: string | null | undefined): string {
  const label = (className || "").trim().toLowerCase();
  if (label.includes("bilingual")) return "Bilingual";
  if (label.includes("technical")) return "Technical";
  if (label.includes("science")) return "Science";
  if (/\barts?\b/.test(label)) return "Arts";
  if (label.includes("commercial") || label.includes("commerce")) return "Commercial";
  if (label.includes("french") || label.includes("francophone")) return "French Section";
  if (label.includes("english") || label.includes("anglophone")) return "English Section";
  return "General";
}

export function deriveClassFields(className: string | null | undefined) {
  return {
    student_class: (className || "").trim(),
    class_level: inferClassLevel(className),
    section: inferSection(className),
  };
}
