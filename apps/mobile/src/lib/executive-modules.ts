/**
 * Executive activities the founders (CEO/CTO) can assign to an executive
 * account. CEO and CTO always have everything; every other executive sees the
 * shared default tabs plus only the activities assigned to them.
 *
 * Keep in sync with backend/apps/users/executive_modules.py and the `module`
 * keys on the sidebar nav items.
 */

export type ExecutiveModule = { key: string; label: string; description: string };

export const EXECUTIVE_MODULES: ExecutiveModule[] = [
  { key: "schools", label: "Schools", description: "Add schools to the system and manage them." },
  { key: "support", label: "Support registry", description: "Handle support requests and the support registry." },
  { key: "testimonials", label: "Testimonials", description: "Review and publish testimonials." },
  { key: "flyer_qr", label: "Flyer QR", description: "Generate marketing flyers and QR codes." },
  { key: "portfolio_policy", label: "Portfolio & Policy", description: "Branding, marketing content and platform policy." },
  { key: "log_post", label: "Log posts", description: "Write blog / log posts." },
  { key: "academy", label: "Academy admin", description: "Manage EduIgnite Academy courses and content." },
  { key: "partners", label: "Partners (admin)", description: "Administer the partner programme." },
  { key: "app_registry", label: "App registry", description: "Manage the app registry." },
  { key: "ai_economics", label: "AI economics", description: "See AI usage economics and revenue." },
  { key: "community", label: "Community portal", description: "The executive community portal." },
  { key: "announcements", label: "Announcements", description: "Publish announcements." },
  { key: "surveys", label: "Surveys", description: "Create and review surveys." },
  { key: "feedback", label: "Feedback", description: "Read and resolve feedback." },
  { key: "draft", label: "Drafts", description: "Recover drafted schools and accounts." },
];

export const EXECUTIVE_MODULE_KEYS = EXECUTIVE_MODULES.map((m) => m.key);

/**
 * Can a user with this role + assigned modules open a nav item?
 * - CEO/CTO: everything (full access).
 * - Other executives: default tabs (no module) always; assignable tabs only
 *   when their key is in allowedModules.
 * - Non-executive roles: unaffected (this returns true; role gating already
 *   handled the item).
 */
export function canAccessModule(
  role: string | null | undefined,
  allowedModules: string[] | null | undefined,
  module?: string,
): boolean {
  if (!module) return true; // default tab
  const r = (role || "").toUpperCase();
  if (r === "CEO" || r === "CTO") return true;
  const EXEC = ["SUPER_ADMIN", "COO", "INV", "DESIGNER", "SYSTEM_DEV"];
  if (!EXEC.includes(r)) return true; // not an assignable executive; role gating stands
  return Array.isArray(allowedModules) && allowedModules.includes(module);
}

const ALL_EXECUTIVE_ROLES = ["SUPER_ADMIN", "CEO", "CTO", "COO", "INV", "DESIGNER", "SYSTEM_DEV"];

/**
 * True when the signed-in user is a platform executive who may carry out the
 * given activity: CEO/CTO always, any other executive only when the founders
 * assigned the module. Pages use this instead of a hard-coded role list, so a
 * tab that the sidebar shows (because the module is assigned) also works once
 * opened. School-level roles always get false.
 */
export function hasExecutiveModule(
  user: { role?: string | null; allowed_modules?: string[] | null } | null | undefined,
  module: string,
): boolean {
  const role = (user?.role || "").toUpperCase();
  if (!ALL_EXECUTIVE_ROLES.includes(role)) return false;
  return canAccessModule(role, user?.allowed_modules, module);
}
