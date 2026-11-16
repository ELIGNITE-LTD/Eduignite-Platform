import { type BasicKind } from "./basic-kind";

type Entry = [href: string, en: string, fr: string];

/** Legacy / primary head-teacher menu. Entries are [href, English, French]. */
export const BASIC_ADMIN_MENU: Entry[] = [
  ["/dashboard", "Home", "Accueil"],
  ["/dashboard/students", "Pupils (add / import)", "Eleves (ajouter / importer)"],
  ["/dashboard/hierarchy", "Hierarchy & Sections", "Hierarchie & Sections"],
  ["/dashboard/attendance", "Attendance", "Presences"],
  ["/dashboard/grades", "Marks & report cards", "Notes et bulletins"],
  ["/dashboard/grades/nursery", "Nursery ratings", "Evaluations maternelle"],
  ["/dashboard/grades/comments", "Report comments", "Appreciations du bulletin"],
  ["/dashboard/conduct", "Conduct", "Conduite"],
  ["/dashboard/fees", "Fees", "Frais scolaires"],
  ["/dashboard/schedule", "Timetable", "Emploi du temps"],
  ["/dashboard/announcements", "Announcements", "Annonces"],
  ["/dashboard/school-events", "School events", "Evenements"],
  ["/dashboard/school-website", "School website", "Site web de l'ecole"],
  ["/dashboard/admissions", "Admissions", "Admissions"],
  ["/dashboard/academics/years-and-terms", "Years & terms", "Annees et trimestres"],
  ["/dashboard/academics/promotions", "Promotion", "Passage de classe"],
  ["/dashboard/staff", "Staff", "Personnel"],
  ["/dashboard/id-cards", "ID cards", "Cartes scolaires"],
  ["/dashboard/health-records", "Health", "Sante des eleves"],
  ["/dashboard/certificates", "Certificates", "Certificats"],
  ["/dashboard/statistics", "Statistics", "Statistiques"],
  ["/dashboard/settings", "Settings", "Parametres"],
  ["/dashboard/subscription", "Subscription", "Abonnement"],
  ["/dashboard/partner", "Partner", "Partenaire"],
  ["/dashboard/referrals", "Refer & Earn", "Parrainage"],
  ["/dashboard/chat", "Messages", "Messages"],
  ["/dashboard/help", "Help / Customer Care", "Aide / Service Client"],
  ["/dashboard/profile", "My profile", "Mon profil"],
];

/** Nursery head-teacher menu: no marks, no report cards, no ranking. */
export const NURSERY_ADMIN_MENU: Entry[] = [
  ["/dashboard", "Home", "Accueil"],
  ["/dashboard/students", "Children", "Enfants"],
  ["/dashboard/hierarchy", "Classes", "Classes"],
  ["/dashboard/attendance", "Attendance", "Presences"],
  ["/dashboard/grades/nursery", "Progress report", "Bilan de progression"],
  ["/dashboard/pickup", "Authorised pick-up", "Personnes autorisees"],
  ["/dashboard/health-records", "Health & allergies", "Sante et allergies"],
  ["/dashboard/fees", "Fees", "Frais scolaires"],
  ["/dashboard/announcements", "Announcements", "Annonces"],
  ["/dashboard/chat", "Messages", "Messages"],
  ["/dashboard/staff", "Staff", "Personnel"],
  ["/dashboard/id-cards", "ID cards", "Cartes scolaires"],
  ["/dashboard/school-website", "School website", "Site web de l'ecole"],
  ["/dashboard/settings", "Settings", "Parametres"],
  ["/dashboard/profile", "My profile", "Mon profil"],
];

/** Nursery teacher menu. */
export const NURSERY_TEACHER_MENU: Entry[] = [
  ["/dashboard", "Class Home", "Ma classe"],
  ["/dashboard/attendance", "Attendance", "Presences"],
  ["/dashboard/grades/nursery", "Progress report", "Bilan de progression"],
  ["/dashboard/pickup", "Authorised pick-up", "Personnes autorisees"],
  ["/dashboard/health-records", "Health", "Sante des enfants"],
  ["/dashboard/chat", "Messages", "Messages"],
  ["/dashboard/profile", "My profile", "Mon profil"],
];

const isAdmin = (role?: string) => role === "SCHOOL_ADMIN" || role === "SUB_ADMIN";

/** The ordered menu for this role and school kind, or null for the default menu. */
export function basicMenuFor(kind: BasicKind | null, role: string | undefined): Entry[] | null {
  if (!kind) return null;
  if (kind === "nursery") {
    if (isAdmin(role)) return NURSERY_ADMIN_MENU;
    if (role === "TEACHER") return NURSERY_TEACHER_MENU;
    return null;
  }
  return isAdmin(role) ? BASIC_ADMIN_MENU : null;
}

/** The nursery ratings page is hidden in a primary-only school. */
export function hiddenForKind(href: string, kind: BasicKind | null): boolean {
  return kind === "primary" && href === "/dashboard/grades/nursery";
}

export function arrangeBasicMenu<T extends { href: string; label: string }>(
  routes: T[],
  role: string | undefined,
  kind: BasicKind | null,
  language: string,
): T[] {
  const menu = basicMenuFor(kind, role);
  if (!menu) return routes;
  const seen = new Set<string>();
  const out: T[] = [];
  for (const [href, en, fr] of menu) {
    const route = routes.find((r) => r.href === href);
    if (!route || seen.has(href)) continue;
    seen.add(href);
    out.push({ ...route, label: language === "en" ? en : fr });
  }
  return out;
}
