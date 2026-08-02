export type TutorialLinkSurface = "web" | "mobile";

export interface TutorialLinkTargets {
  web: string;
  mobile: string;
}

export type TutorialLinksRecord = Record<string, TutorialLinkTargets>;

export function normalizeTutorialLinkEntry(value: unknown): TutorialLinkTargets {
  if (typeof value === "string") {
    const link = value.trim();
    return { web: link, mobile: link };
  }

  if (!value || typeof value !== "object") {
    return { web: "", mobile: "" };
  }

  const record = value as Record<string, unknown>;
  const fallback = typeof record.url === "string" ? record.url.trim() : "";
  const web = typeof record.web === "string" ? record.web.trim() : "";
  const mobile = typeof record.mobile === "string" ? record.mobile.trim() : "";

  return {
    web: web || fallback,
    mobile: mobile || fallback,
  };
}

export function normalizeTutorialLinksRecord(
  value: unknown,
  roles: readonly string[] = []
): TutorialLinksRecord {
  const source =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const normalized: TutorialLinksRecord = {};

  Object.entries(source).forEach(([role, entry]) => {
    normalized[role] = normalizeTutorialLinkEntry(entry);
  });

  roles.forEach((role) => {
    if (!normalized[role]) {
      normalized[role] = { web: "", mobile: "" };
    }
  });

  return normalized;
}

export function getTutorialLinkForSurface(
  links: unknown,
  role: string | null | undefined,
  surface: TutorialLinkSurface
): string {
  if (!role) {
    return "";
  }

  const normalized = normalizeTutorialLinksRecord(links, [role]);
  const entry = normalized[role];

  return (
    entry?.[surface] ||
    entry?.[surface === "web" ? "mobile" : "web"] ||
    ""
  );
}
