/**
 * Which kind of basic-education school this is. The backend keeps
 * education_category = 'basic' for both and stores the kind in
 * SchoolSettings.sections: ['nursery'] = nursery school, ['primary'] = primary
 * school, empty or both = legacy "Nursery & Primary" school.
 */
export type BasicKind = "nursery" | "primary" | "basic";

export function deriveBasicKind(category: unknown, sections?: ReadonlyArray<string> | null): BasicKind | null {
  if (category !== "basic") return null;
  const set = new Set((sections ?? []).filter((s) => s === "nursery" || s === "primary"));
  if (set.size === 1) return set.has("nursery") ? "nursery" : "primary";
  return "basic";
}
