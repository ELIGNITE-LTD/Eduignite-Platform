/**
 * How the school's top account is named on screen.
 *
 * The role value `SCHOOL_ADMIN` never changes (API payloads, permissions and
 * routing all use it). Only the label people read depends on the school type:
 *
 *   secondary -> "Principal"
 *   basic     -> "Discipline Master" (nursery / primary)
 *   higher    -> "School Administrator" (unchanged)
 *
 * Every screen that prints a role name goes through `roleLabel` (or the
 * `useRoleLabel` hook, which also works out the school type) so the wording
 * stays in one place.
 */

import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { useEducationCategory } from "@/lib/hooks/useEducationCategory";
import type { EducationCategory } from "@/lib/cameroon-education-system";
import { roleTitle } from "@/lib/role-info";

type Lang = "en" | "fr";

const SCHOOL_ADMIN_LABELS: Record<EducationCategory, { one: Record<Lang, string>; many: Record<Lang, string> }> = {
  secondary: {
    one: { en: "Principal", fr: "Principal" },
    many: { en: "Principals", fr: "Principaux" },
  },
  basic: {
    one: { en: "Discipline Master", fr: "Maître de discipline" },
    many: { en: "Discipline Masters", fr: "Maîtres de discipline" },
  },
  higher: {
    one: { en: "School Administrator", fr: "Administrateur scolaire" },
    many: { en: "School Administrators", fr: "Administrateurs scolaires" },
  },
};

/** The SCHOOL_ADMIN label for a school type; neutral wording when the type is unknown. */
export function schoolAdminLabel(
  category: EducationCategory | null | undefined,
  language: Lang = "en",
  plural = false,
): string {
  const entry = SCHOOL_ADMIN_LABELS[category || "higher"] || SCHOOL_ADMIN_LABELS.higher;
  return (plural ? entry.many : entry.one)[language === "fr" ? "fr" : "en"];
}

/**
 * Display name of a role. Only SCHOOL_ADMIN depends on the school type; any
 * other role keeps its usual title. An unknown category (e.g. a platform
 * executive who belongs to no school) gets the neutral "School Administrator".
 */
export function roleLabel(
  role: string | null | undefined,
  category?: EducationCategory | null,
  language: Lang = "en",
): string {
  if (String(role || "").toUpperCase() === "SCHOOL_ADMIN") return schoolAdminLabel(category, language);
  // Display only: the stored values COO and DESIGNER never change.
  if (language === "fr") {
    const key = String(role || "").toUpperCase();
    if (key === "COO") return "Département Opérationnel";
    if (key === "DESIGNER") return "Département Marketing";
  }
  return roleTitle(role);
}

/** The education category carried by a user/staff record or school object, if any. */
export function categoryOfPerson(person: unknown): EducationCategory | undefined {
  const p = person as Record<string, any> | null | undefined;
  const raw =
    p?.school?.education_category ??
    p?.school?.educationCategory ??
    p?.school_education_category ??
    p?.education_category ??
    p?.educationCategory;
  return raw === "basic" || raw === "secondary" || raw === "higher" ? raw : undefined;
}

/**
 * Hook returning `label(role, person?)` and `adminLabel(plural?)` in the active
 * interface language. The category
 * comes from the displayed person's school when their record carries it,
 * otherwise from the signed-in user's school; users who belong to no school get
 * the neutral wording.
 */
export function useRoleLabel() {
  const { user } = useAuth();
  const { language } = useI18n();
  const current = useEducationCategory();
  const fallback = user?.school ? current : undefined;
  return {
    label: (role: string | null | undefined, person?: unknown): string =>
      roleLabel(role, categoryOfPerson(person) ?? fallback, language),
    adminLabel: (plural = false): string => schoolAdminLabel(fallback, language, plural),
  };
}
