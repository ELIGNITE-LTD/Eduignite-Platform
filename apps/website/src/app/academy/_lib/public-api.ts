/**
 * Data-fetching for the EduIgnite Academy PUBLIC catalog only (the
 * unauthenticated `/academy`, `/academy/courses`, `/academy/trainers` and
 * `/academy/verify/[id]` pages built in this slice of work).
 *
 * Deliberately scoped to this route's own `_lib` folder rather than a
 * top-level `src/lib/academy.ts` — the SSO auth gateway / course player and
 * the admin CMS are being built concurrently by other agents under
 * `academy/(learner)` and `academy/admin`, and a shared top-level file would
 * be a collision risk. This module only ever talks to the PUBLIC, no-auth
 * endpoints under `/api/v1/academy/`.
 *
 * Follows the same shape as `src/lib/public-site.ts`'s `publicJson` /
 * `getAppsWithLatestReleases` pattern: typed, SSR-friendly, degrades to a
 * safe fallback (never throws) so a flaky backend never crashes a page.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

async function publicJson<T>(path: string, fallback: T, revalidate = 300): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { next: { revalidate } });
    if (!res.ok) return fallback;
    const data = await res.json();
    return (data ?? fallback) as T;
  } catch {
    return fallback;
  }
}

/**
 * Every academy list endpoint backed by a DRF ModelViewSet (courses,
 * trainers, faqs) is paginated by this backend's global
 * DEFAULT_PAGINATION_CLASS -- the response is `{count, next, previous,
 * results}`, never a bare array. `publicJson<T[]>` alone would silently
 * return that whole envelope mistyped as T[], and the first `.slice()`/
 * `.map()`/`.length` check on it at the call site throws at render time
 * (confirmed live: this crashed /academy/courses with a 500 in production,
 * masked on /academy's landing page only because that page happens to be
 * statically pre-rendered and its build-time fetch fell back to `[]`
 * instead of hitting the same array-shape assumption against real data).
 * Unwraps `.results`, tolerating a plain array too in case that ever
 * changes upstream.
 */
async function publicPaginatedJson<T>(path: string, revalidate = 300): Promise<T[]> {
  const data = await publicJson<{ results?: T[] } | T[]>(path, { results: [] }, revalidate);
  if (Array.isArray(data)) return data;
  return data.results ?? [];
}

/* ------------------------------------------------------------------ *
 * Types — mirror `backend/apps/academy/serializers.py` field-for-field.
 * ------------------------------------------------------------------ */

export type RolePathway = "PRINCIPAL" | "TEACHER" | "ACCOUNTANT" | "LIBRARIAN" | "GENERAL";

export const ROLE_PATHWAYS: { value: RolePathway; label: string; course: string; focus: string }[] = [
  { value: "PRINCIPAL", label: "Principals", course: "EduIgnite for Principals", focus: "School setup, class assignments, report publishing, announcements." },
  { value: "TEACHER", label: "Teachers", course: "EduIgnite for Teachers", focus: "Viewing classes, recording attendance, entering marks and results." },
  { value: "ACCOUNTANT", label: "Accountants", course: "EduIgnite for Accountants", focus: "Finance dashboard setup, recording fee payments, generating receipts." },
  { value: "LIBRARIAN", label: "Librarians", course: "EduIgnite for Librarians", focus: "Book inventory, borrower registration, issuing and returns." },
  { value: "GENERAL", label: "Everyone", course: "General courses", focus: "Foundational courses useful to any role on EduIgnite." },
];

export function roleLabel(role: RolePathway): string {
  return ROLE_PATHWAYS.find((r) => r.value === role)?.label ?? role;
}

export type AcademyProfile = {
  tagline: string;
  mission: string;
  vision: string;
  description: string;
  logo_url: string | null;
  stats: {
    courses_count: number;
    learners_count: number;
    certificates_count: number;
  };
};

const FALLBACK_PROFILE: AcademyProfile = {
  tagline: "Developing Verified Operational Competence in School Management",
  mission: "",
  vision: "",
  description: "",
  logo_url: null,
  stats: { courses_count: 0, learners_count: 0, certificates_count: 0 },
};

export type CourseListItem = {
  id: number;
  title: string;
  slug: string;
  description: string;
  thumbnail_url: string | null;
  role_pathway: RolePathway;
  status: string;
  is_featured: boolean;
  module_count: number;
  duration_minutes: number;
  created_at: string;
};

export type LessonPublic = {
  id: number;
  title: string;
  order: number;
  duration_minutes: number;
  description: string;
};

export type ModulePublic = {
  id: number;
  title: string;
  order: number;
  lessons: LessonPublic[];
};

export type ResourceItem = {
  id: number;
  title: string;
  file_url: string;
  resource_type: string;
};

export type CourseTestimonial = {
  id: number;
  user: { id: string; name: string };
  course: number;
  course_slug: string;
  message: string;
  rating: number;
  status: string;
  approved_at: string | null;
  created_at: string;
};

export type TrainerProfile = {
  id: number;
  user_id: string;
  name: string;
  bio: string;
  photo_url: string | null;
  credentials: string;
  is_verified: boolean;
};

export type CourseDetail = CourseListItem & {
  modules: ModulePublic[];
  resources: ResourceItem[];
  testimonials: CourseTestimonial[];
  trainer: TrainerProfile | null;
};

export type FaqEntry = {
  id: number;
  question: string;
  answer: string;
  category: string;
  order: number;
};

export type SearchResult =
  | {
      type: "lesson";
      title: string;
      duration_minutes: number;
      course_title: string;
      course_slug: string;
      lesson_id: number;
      deep_link: string;
    }
  | {
      type: "course";
      title: string;
      course_slug: string;
      deep_link: string;
    };

export type CertificateVerification = {
  verification_id: string;
  learner_name: string;
  course_title: string;
  tier: "COMPLETION" | "CERTIFIED_USER" | "CERTIFIED_TRAINER";
  issued_at: string;
};

export const CERTIFICATE_TIER_LABEL: Record<CertificateVerification["tier"], string> = {
  COMPLETION: "Certificate of Completion",
  CERTIFIED_USER: "Certified EduIgnite User",
  CERTIFIED_TRAINER: "Certified EduIgnite Trainer",
};

/* ------------------------------------------------------------------ *
 * Fetchers
 * ------------------------------------------------------------------ */

export function fetchAcademyProfile(): Promise<AcademyProfile> {
  return publicJson<AcademyProfile>("/academy/profile/", FALLBACK_PROFILE, 300);
}

export function fetchCourses(params?: { role_pathway?: RolePathway; featured?: boolean }): Promise<CourseListItem[]> {
  const search = new URLSearchParams();
  if (params?.role_pathway) search.set("role_pathway", params.role_pathway);
  if (params?.featured) search.set("featured", "true");
  const qs = search.toString();
  return publicPaginatedJson<CourseListItem>(`/academy/courses/${qs ? `?${qs}` : ""}`, 300);
}

/** Full course detail by slug — SSR'd on the course detail page. Returns
 * null on a 404 (or any failure) so the page can call Next's `notFound()`. */
export async function fetchCourseDetail(slug: string): Promise<CourseDetail | null> {
  try {
    const res = await fetch(`${API_BASE}/academy/courses/${encodeURIComponent(slug)}/`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return (await res.json()) as CourseDetail;
  } catch {
    return null;
  }
}

export function fetchTrainers(): Promise<TrainerProfile[]> {
  return publicPaginatedJson<TrainerProfile>("/academy/trainers/", 300);
}

export function fetchFaqs(): Promise<FaqEntry[]> {
  return publicPaginatedJson<FaqEntry>("/academy/faqs/", 600);
}

/** Live, natural-language-ish search across course/lesson titles+descriptions. */
export async function searchAcademy(q: string): Promise<SearchResult[]> {
  const query = q.trim();
  if (!query) return [];
  try {
    const res = await fetch(`${API_BASE}/academy/search/?q=${encodeURIComponent(query)}`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.results ?? []) as SearchResult[];
  } catch {
    return [];
  }
}

/** Public certificate verification lookup. Null on a 404/miss or any failure —
 * callers render a clear "not found or invalid" state either way. */
export async function verifyCertificate(verificationId: string): Promise<CertificateVerification | null> {
  try {
    const res = await fetch(`${API_BASE}/academy/verify/${encodeURIComponent(verificationId)}/`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as CertificateVerification;
  } catch {
    return null;
  }
}

/**
 * The Deep Link Redirection Rule (spec Section 3 / contract): before routing
 * an UNAUTHENTICATED visitor through any enroll/start/continue CTA, cache the
 * pre-auth context so the gateway can send them straight back afterwards.
 *
 * NOTE on `courseId`/`moduleId`: the backend's `DeepLinkCreateSerializer`
 * declares both as `UUIDField`, but `Course`/`Module` use the project's
 * default `BigAutoField` integer primary key (no UUID override) — passing
 * the course's real numeric id would fail serializer validation with a 400.
 * The one passing backend test for this endpoint
 * (`DeepLinkCacheTests.test_deep_link_round_trip_through_sso_continue`) only
 * ever sends `returnPath`, which is also all this catalog actually needs:
 * `returnPath` already encodes the exact course/lesson URL to return to. So
 * this helper intentionally omits `courseId`/`moduleId` rather than send a
 * value that would be rejected — flagged for backend follow-up.
 */
export async function createDeepLink(returnPath: string): Promise<{ state: string } | null> {
  try {
    const res = await fetch(`${API_BASE}/academy/deep-link/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnPath }),
    });
    if (!res.ok) return null;
    return (await res.json()) as { state: string };
  } catch {
    return null;
  }
}

/**
 * The auth gateway's own route. Assumed to be `/academy/start` per the
 * contract ("just link to `/academy/start?state=...` and it'll resolve once
 * that agent's work lands") — this repo has no `academy/(learner)` or
 * `academy/admin` directory yet at the time this was written, so the path
 * could not be confirmed against real code and should be double-checked once
 * the auth-gateway agent's route lands.
 */
export function buildAuthGatewayUrl(opts: { state?: string | null; returnPath: string }): string {
  const params = new URLSearchParams();
  if (opts.state) params.set("state", opts.state);
  else params.set("returnPath", opts.returnPath);
  return `/academy/start?${params.toString()}`;
}
