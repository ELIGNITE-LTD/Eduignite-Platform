"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useEducationCategory } from "@/lib/hooks/useEducationCategory";

export const HIGHER_HOME = "/dashboard/higher";

/** Pages built around classes, forms, sequences and terms: secondary schools only. */
const SECONDARY_ONLY_PAGES = [
  "/dashboard/classes",
  "/dashboard/sections",
  "/dashboard/subjects",
  "/dashboard/hierarchy",
  "/dashboard/community",
  "/dashboard/academics/promotions",
  "/dashboard/academics/years-and-terms",
  "/dashboard/academics/performance",
  "/dashboard/class-marks",
  "/dashboard/class-history",
  "/dashboard/my-class",
  "/dashboard/conduct",
  "/dashboard/report-cards",
  "/dashboard/health-records",
  "/dashboard/certificates",
  "/dashboard/grades/nursery",
  "/dashboard/grades/comments",
  "/dashboard/exams",
  "/dashboard/career-orientation",
  "/dashboard/roadmap",
  "/dashboard/student-management",
  "/dashboard/rewards",
];

/** Secondary-only for school staff; students and parents keep their own views. */
const SECONDARY_ONLY_FOR_STAFF = ["/dashboard/grades", "/dashboard/students"];

const STAFF_ROLES = ["SCHOOL_ADMIN", "SUB_ADMIN", "TEACHER"];

/** Student, bursar and parent get their own short higher-education menus. */
const LEARNER_SIDE_ROLES = ["STUDENT", "BURSAR", "PARENT"];

/** Pages built for secondary-school students, bursars and parents. */
const SECONDARY_ONLY_FOR_LEARNER_SIDE = [
  "/dashboard/grades",
  "/dashboard/schedule",
  "/dashboard/attendance",
  "/dashboard/assignments",
  "/dashboard/courses",
  "/dashboard/library",
  "/dashboard/live-classes",
  "/dashboard/school-events",
  "/dashboard/id-cards",
  "/dashboard/transcripts",
];

/**
 * Whether the institution has switched on the parent link. The backend has no
 * such setting yet, so this is off unless the school payload says otherwise.
 */
export function isParentLinkEnabled(school: unknown): boolean {
  const s = (school ?? {}) as Record<string, unknown>;
  return Boolean(s.parent_link_enabled ?? s.parentLinkEnabled);
}

const matches = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

/** True when a higher-education user must not see this page. */
export function isSecondaryOnlyForHigher(pathname: string, role: string, parentLink = false): boolean {
  if (SECONDARY_ONLY_PAGES.some((p) => matches(pathname, p))) return true;
  if (STAFF_ROLES.includes(role) && SECONDARY_ONLY_FOR_STAFF.some((p) => matches(pathname, p))) return true;
  if (LEARNER_SIDE_ROLES.includes(role)) {
    if (SECONDARY_ONLY_FOR_LEARNER_SIDE.some((p) => matches(pathname, p))) return true;
    if (role === "PARENT" && !parentLink && (matches(pathname, "/dashboard/children") || matches(pathname, "/dashboard/fees"))) return true;
    if (role === "PARENT" && parentLink && matches(pathname, "/dashboard/children")) return true;
  }
  // The generic overview is replaced by the higher-education overview.
  return (STAFF_ROLES.includes(role) || LEARNER_SIDE_ROLES.includes(role)) && pathname === "/dashboard";
}

/**
 * Sends higher-education users away from secondary-only pages to the higher
 * dashboard. Presentation only: the backend stays the source of truth.
 */
export function HigherRouteGuard({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const category = useEducationCategory();
  const pathname = usePathname() || "";
  const router = useRouter();
  const role = String(user?.role || "").toUpperCase();
  const blocked =
    Boolean(user?.school?.id) &&
    category === "higher" &&
    isSecondaryOnlyForHigher(pathname, role, isParentLinkEnabled(user?.school));

  useEffect(() => {
    if (blocked) router.replace(HIGHER_HOME);
  }, [blocked, router]);

  if (blocked) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-label="Redirecting">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return <>{children}</>;
}
