/**
 * Human-readable title and a plain-language description for every account
 * role, so each person sees exactly what their account is and does.
 *
 * The role KEY (e.g. "DESIGNER") is an internal identifier referenced across
 * the codebase and never changes - only how a role is presented to people.
 * The DESIGNER account is presented as the Marketing Department.
 */

export type RoleInfo = { title: string; description: string };

export const ROLE_INFO: Record<string, RoleInfo> = {
  // Platform executives
  CEO: {
    title: "Chief Executive Officer",
    description: "Leads EduIgnite: overall strategy, governance and final decisions.",
  },
  CTO: {
    title: "Chief Technology Officer",
    description: "Leads technology, engineering and the platform's technical direction.",
  },
  COO: {
    title: "Operational Department",
    description: "Runs day-to-day operations and execution across EduIgnite.",
  },
  SUPER_ADMIN: {
    title: "Super Administrator",
    description: "Platform administration and support across every area of EduIgnite.",
  },
  INV: {
    title: "Investor",
    description: "Board stakeholder with investment and performance visibility.",
  },
  DESIGNER: {
    title: "Marketing Department",
    description: "Owns branding, marketing content and how EduIgnite is presented to the public.",
  },
  SYSTEM_DEV: {
    title: "Systems Department",
    description: "Builds, deploys and maintains the EduIgnite platform and provisions executive accounts.",
  },
  // Owner of one or more schools
  PROPRIETOR: {
    title: "Proprietor",
    description: "Owns one or more schools: sees their statistics and manages their administrators' login details.",
  },
  // School accounts
  SCHOOL_ADMIN: {
    title: "School Administrator",
    description: "Runs the school on EduIgnite: staff, students, classes and settings.",
  },
  SUB_ADMIN: {
    title: "Sub Administrator",
    description: "Helps run the school, limited to the sub-schools assigned to them.",
  },
  TEACHER: {
    title: "Teacher",
    description: "Teaches classes: lessons, assignments, grades and attendance.",
  },
  STUDENT: {
    title: "Student",
    description: "Learns on EduIgnite: lessons, assignments, results and the AI tutor.",
  },
  PARENT: {
    title: "Parent",
    description: "Follows their children: results, attendance, fees and school updates.",
  },
  BURSAR: {
    title: "Bursar",
    description: "Handles school fees, payments and financial records.",
  },
  LIBRARIAN: {
    title: "Librarian",
    description: "Manages the school library: books, lending and returns.",
  },
  // Independent / partner accounts
  PARTNER: {
    title: "Partner",
    description: "Introduces schools to EduIgnite and earns referral rewards.",
  },
  ACADEMY_LEARNER: {
    title: "Academy Learner",
    description: "Independent learner on EduIgnite Academy.",
  },
  AI_GUEST: {
    title: "EduIgnite AI Guest",
    description: "Uses EduIgnite AI from a chat app without a full account.",
  },
};

/** The display title for a role, e.g. "Marketing Department". Falls back to a tidy version of the code. */
export function roleTitle(role?: string | null): string {
  if (!role) return "User";
  return ROLE_INFO[role.toUpperCase()]?.title || role.replace(/_/g, " ");
}

/** A one-line description of what the role does, or "" if unknown. */
export function roleDescription(role?: string | null): string {
  if (!role) return "";
  return ROLE_INFO[role.toUpperCase()]?.description || "";
}
