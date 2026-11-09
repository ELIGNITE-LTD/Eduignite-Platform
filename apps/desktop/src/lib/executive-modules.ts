/**
 * Executive activities the founders (CEO/CTO) assign to an executive account.
 *
 * ONE RULE for every executive role (COO, INV, DESIGNER, SYSTEM_DEV, SUPER_ADMIN
 * and any added later): the account can do exactly the activities of the modules
 * assigned to it, whatever its role label. CEO and CTO (the founders) always
 * have everything.
 *
 * Keep in sync with backend/apps/users/executive_modules.py (the catalogue the
 * Founders page assigns from) and backend/apps/users/executive_access.py.
 */

export type ExecutiveModule = { key: string; label: string; description: string };

export const EXECUTIVE_MODULES: ExecutiveModule[] = [
  { key: "schools", label: "Schools", description: "Add schools to the system, manage them and their staff, and work on any school's records." },
  { key: "proprietors", label: "Proprietors", description: "Create proprietor accounts, link schools to them and reset their administrators' logins." },
  { key: "school_websites", label: "School websites", description: "See every school's website status, force a site offline and unlock it." },
  { key: "support", label: "Support registry", description: "Handle support requests, contact messages and account requests." },
  { key: "testimonials", label: "Testimonials", description: "Review and publish testimonials." },
  { key: "flyer_qr", label: "Flyer QR", description: "Generate marketing flyers and QR codes." },
  { key: "portfolio_policy", label: "Portfolio & Policy", description: "Branding, marketing content, tutorials and platform policy." },
  { key: "platform_billing", label: "Platform billing", description: "Set the per-student fee and deadlines, and follow each school's platform bill." },
  { key: "log_post", label: "Log posts", description: "Write blog / log posts." },
  { key: "academy", label: "Academy admin", description: "Manage EduIgnite Academy courses and content." },
  { key: "partners", label: "Partners (admin)", description: "Administer the partner programme." },
  { key: "app_registry", label: "App registry", description: "Manage the app registry and the application store." },
  { key: "ai_economics", label: "AI economics", description: "See AI usage economics and revenue (changing prices stays with the founders)." },
  { key: "community", label: "Community portal", description: "The executive community portal." },
  { key: "announcements", label: "Announcements", description: "Publish announcements and managed notifications." },
  { key: "surveys", label: "Surveys", description: "Create and review surveys." },
  { key: "feedback", label: "Feedback", description: "Read and resolve feedback." },
  { key: "draft", label: "Drafts", description: "Recover drafted schools and accounts." },
];

export const EXECUTIVE_MODULE_KEYS = EXECUTIVE_MODULES.map((m) => m.key);

/** Every platform executive role. */
export const ALL_EXECUTIVE_ROLES = ["SUPER_ADMIN", "CEO", "CTO", "COO", "INV", "DESIGNER", "SYSTEM_DEV"];
/** The founders always hold every module. */
export const FOUNDER_ROLES = ["CEO", "CTO"];

const norm = (role: string | null | undefined) => (role || "").trim().toUpperCase();

export const isFounderRole = (role: string | null | undefined) => FOUNDER_ROLES.includes(norm(role));
export const isExecutiveRole = (role: string | null | undefined) => ALL_EXECUTIVE_ROLES.includes(norm(role));
/** An executive who is not a founder: limited to the general tabs + assigned modules. */
export const isLimitedExecutive = (role: string | null | undefined) =>
  isExecutiveRole(role) && !isFounderRole(role);

/**
 * The general tabs every executive account has. Nothing school-specific, and
 * nothing that belongs to an activity the founders have to assign.
 */
export const GENERAL_EXECUTIVE_ROUTES = [
  "/dashboard", // overview / home
  "/dashboard/profile", // my profile and own account settings
  "/dashboard/chat", // messages
  "/dashboard/notifications",
];

/** Dashboard route -> the modules that open it (any one of them is enough). */
export const MODULES_BY_HREF: Record<string, string[]> = {
  "/dashboard/log-post": ["log_post"],
  "/dashboard/apps": ["app_registry"],
  "/dashboard/app-store": ["app_registry"],
  "/dashboard/partners": ["partners"],
  "/academy/admin": ["academy"],
  "/dashboard/schools": ["schools", "proprietors"],
  "/dashboard/school-website": ["school_websites"],
  "/dashboard/support": ["support"],
  "/dashboard/flyer-qr": ["flyer_qr"],
  "/dashboard/testimonials": ["testimonials"],
  "/dashboard/platform-settings": ["portfolio_policy", "platform_billing"],
  "/dashboard/community": ["community"],
  "/dashboard/announcements": ["announcements"],
  "/dashboard/surveys": ["surveys"],
  "/dashboard/feedback": ["feedback"],
  "/dashboard/draft": ["draft"],
  "/dashboard/ai-economics": ["ai_economics"],
};

/** Where each module's work happens (used for the "your assigned activities" list). */
export const HREF_BY_MODULE: Record<string, string> = {
  schools: "/dashboard/schools",
  proprietors: "/dashboard/schools",
  school_websites: "/dashboard/school-website",
  support: "/dashboard/support",
  testimonials: "/dashboard/testimonials",
  flyer_qr: "/dashboard/flyer-qr",
  portfolio_policy: "/dashboard/platform-settings",
  platform_billing: "/dashboard/platform-settings",
  log_post: "/dashboard/log-post",
  academy: "/academy/admin",
  partners: "/dashboard/partners",
  app_registry: "/dashboard/apps",
  ai_economics: "/dashboard/ai-economics",
  community: "/dashboard/community",
  announcements: "/dashboard/announcements",
  surveys: "/dashboard/surveys",
  feedback: "/dashboard/feedback",
  draft: "/dashboard/draft",
};

const cleanPath = (path: string) => (path.split(/[?#]/)[0].replace(/\/+$/, "") || "/");
const matches = (path: string, base: string) => path === base || path.startsWith(base + "/");

/** The module(s) that gate a route, or [] when the route is not an assignable activity. */
export function modulesForPath(path: string): string[] {
  const p = cleanPath(path);
  let best = "";
  for (const href of Object.keys(MODULES_BY_HREF)) {
    if (matches(p, href) && href.length > best.length) best = href;
  }
  return best ? MODULES_BY_HREF[best] : [];
}

/**
 * Can a user with this role + assigned modules open a nav item?
 * - CEO/CTO: everything.
 * - Any other executive: default (module-less) tabs always; assignable tabs only
 *   when their key is in allowedModules.
 * - Non-executive roles: unaffected (true; role gating already handled the item).
 */
export function canAccessModule(
  role: string | null | undefined,
  allowedModules: string[] | null | undefined,
  module?: string,
): boolean {
  if (!module) return true; // default tab
  if (!isLimitedExecutive(role)) return true; // founders: all; school roles: role gating stands
  return Array.isArray(allowedModules) && allowedModules.includes(module);
}

/**
 * True when the signed-in user is a platform executive who may carry out the
 * given activity: CEO/CTO always, any other executive only when the founders
 * assigned the module. School-level roles always get false.
 */
export function hasExecutiveModule(
  user: { role?: string | null; allowed_modules?: string[] | null } | null | undefined,
  module: string,
): boolean {
  const role = norm(user?.role);
  if (!isExecutiveRole(role)) return false;
  return canAccessModule(role, user?.allowed_modules, module);
}

/**
 * The single rule for what a non-founder executive can see or open: the general
 * tabs plus the routes of assigned modules. Everything else is hidden. Founders
 * and school roles are never restricted here.
 */
export function canOpenExecutiveRoute(
  role: string | null | undefined,
  allowedModules: string[] | null | undefined,
  path: string,
): boolean {
  if (!isLimitedExecutive(role)) return true;
  const p = cleanPath(path);
  if (GENERAL_EXECUTIVE_ROUTES.some((g) => (g === "/dashboard" ? p === g : matches(p, g)))) return true;
  const needed = modulesForPath(p);
  if (!needed.length) return false;
  const have = Array.isArray(allowedModules) ? allowedModules : [];
  return needed.some((m) => have.includes(m));
}

/** The activities assigned to an account, with a link each (deduplicated by route). */
export function assignedActivities(
  allowedModules: string[] | null | undefined,
): Array<ExecutiveModule & { href: string }> {
  const have = Array.isArray(allowedModules) ? allowedModules : [];
  return EXECUTIVE_MODULES.filter((m) => have.includes(m.key) && HREF_BY_MODULE[m.key]).map((m) => ({
    ...m,
    href: HREF_BY_MODULE[m.key],
  }));
}
