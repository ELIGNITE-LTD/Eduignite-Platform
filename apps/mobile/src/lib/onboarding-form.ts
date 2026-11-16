/**
 * What the "Onboard Institution" form shows for each education level.
 * The founder first picks the level; the form then asks only what makes sense for it
 * (a university has a Rector, not a Principal, and no "General/Technical" school type).
 * Pure data and functions so they can be unit tested.
 */
export type OnboardLevel = "nursery" | "primary" | "secondary" | "higher";

export const ONBOARD_LEVELS: Array<{ value: OnboardLevel; title: string; subtitle: string }> = [
  { value: "nursery", title: "Nursery school", subtitle: "Maternelle, for children aged 3 to 5" },
  { value: "primary", title: "Primary school", subtitle: "Primaire: Class 1 to Class 6 or CP to CM2" },
  { value: "secondary", title: "Secondary school", subtitle: "General, technical or mixed: collège, lycée, high school" },
  { value: "higher", title: "University or higher institution", subtitle: "University, institute, grande école, polytechnic" },
];

export interface OnboardConfig {
  /** Section heading above the name fields. */
  identityTitle: string;
  nameLabel: string;
  namePlaceholder: string;
  shortCodePlaceholder: string;
  headLabel: string;
  headPlaceholder: string;
  /** Show the General / Technical / Mixed choice (secondary only). */
  showSchoolType: boolean;
  subsystemLabel: string;
  /** Wording for the head of the institution in lists and the success screen. */
  headTitle: string;
  /** Values sent when the field is not asked. */
  defaults: { school_type: string; motto: string; description: string };
  requiredMessage: string;
}

const CONFIG: Record<OnboardLevel, OnboardConfig> = {
  nursery: {
    identityTitle: "School Identity",
    nameLabel: "Full Nursery School Name",
    namePlaceholder: "e.g. Little Stars Nursery School",
    shortCodePlaceholder: "e.g. LSNS",
    headLabel: "Head Teacher / Directrice",
    headPlaceholder: "e.g. Mrs. Marie Dupont",
    showSchoolType: false,
    subsystemLabel: "Education Subsystem",
    headTitle: "Head Teacher",
    defaults: { school_type: "general", motto: "Discipline - Work - Success", description: "New Institutional Node" },
    requiredMessage: "School name, short code, head teacher and email and city/town are required.",
  },
  primary: {
    identityTitle: "School Identity",
    nameLabel: "Full Primary School Name",
    namePlaceholder: "e.g. Government Primary School Bonanjo",
    shortCodePlaceholder: "e.g. GPSB",
    headLabel: "Head Teacher Name",
    headPlaceholder: "e.g. Mrs. Marie Dupont",
    showSchoolType: false,
    subsystemLabel: "Education Subsystem",
    headTitle: "Head Teacher",
    defaults: { school_type: "general", motto: "Discipline - Work - Success", description: "New Institutional Node" },
    requiredMessage: "School name, short code, head teacher and email and city/town are required.",
  },
  secondary: {
    identityTitle: "School Identity",
    nameLabel: "Full School Name",
    namePlaceholder: "e.g. Government Bilingual High School Deido",
    shortCodePlaceholder: "e.g. GBHS",
    headLabel: "Principal Name",
    headPlaceholder: "e.g. Dr. Jean Dupont",
    showSchoolType: true,
    subsystemLabel: "Education Subsystem",
    headTitle: "Principal",
    defaults: { school_type: "general", motto: "Discipline - Work - Success", description: "New Institutional Node" },
    requiredMessage: "School name, short code, principal and email and city/town are required.",
  },
  higher: {
    identityTitle: "Institution Identity",
    nameLabel: "Full Institution Name",
    namePlaceholder: "e.g. University of Buea, Institut Supérieur de Gestion",
    shortCodePlaceholder: "e.g. UB",
    headLabel: "Rector / Vice-Chancellor / Director General",
    headPlaceholder: "e.g. Prof. Jean Dupont",
    showSchoolType: false,
    subsystemLabel: "Language of instruction",
    headTitle: "Head of Institution",
    // No made-up slogan or placeholder text: the institution writes its own when it sets up its website.
    defaults: { school_type: "general", motto: "", description: "" },
    requiredMessage: "Institution name, short code, head of institution and email and city/town are required.",
  },
};

export function normalizeOnboardLevel(value: unknown): OnboardLevel {
  if (value === "nursery" || value === "primary" || value === "higher") return value;
  // Older records and links call a nursery and primary school "basic".
  return value === "basic" ? "primary" : "secondary";
}

/** What the API gets for a chosen level: nursery and primary are both category 'basic', told apart by basic_section. */
export function payloadForLevel(level: unknown): { education_category: "basic" | "secondary" | "higher"; basic_section?: "nursery" | "primary" } {
  const l = normalizeOnboardLevel(level);
  if (l === "nursery" || l === "primary") return { education_category: "basic", basic_section: l };
  return { education_category: l };
}

export function onboardConfig(level: unknown): OnboardConfig {
  return CONFIG[normalizeOnboardLevel(level)];
}

/** Label for the head of an institution of this level (list cards, success screen). */
export function headTitleFor(level: unknown): string {
  return onboardConfig(level).headTitle;
}

export interface OnboardInput {
  name: string;
  shortName: string;
  principal: string;
  email: string;
  /** The backend needs a place; the form takes it from City / Town. */
  cityVillage: string;
}

/** The first problem to show, or null when the required fields are filled. */
export function onboardingProblem(level: unknown, data: OnboardInput): string | null {
  const ok = data.name.trim() && data.shortName.trim() && data.principal.trim() && data.email.trim() && data.cityVillage.trim();
  return ok ? null : onboardConfig(level).requiredMessage;
}
