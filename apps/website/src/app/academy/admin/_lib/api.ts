"use client";

/**
 * Thin, scoped API helper for the EduIgnite Academy admin CMS.
 *
 * Deliberately NOT a shared top-level `src/lib/academy.ts` — two other agents
 * are concurrently building the public catalog and the learner area under
 * `academy/` in this same session, so this file lives inside the admin route
 * tree it belongs to (`academy/admin/_lib/`) to avoid any collision risk.
 *
 * Every call here hits a real, already-tested backend endpoint under
 * `/api/v1/academy/` (see `backend/apps/academy/{views,permissions,serializers}.py`).
 * The backend is the actual authority on every one of these actions — this
 * file does no client-side enforcement, it only shapes requests/responses.
 */

import { apiClient } from "@/lib/api/client";

const BASE = "/academy";

// ---------------------------------------------------------------------------
// Shared types (mirror backend/apps/academy/{models,serializers}.py exactly)
// ---------------------------------------------------------------------------

export type AcademyScope =
  | "COURSE_CREATE"
  | "COURSE_PUBLISH"
  | "COURSE_ASSIGN"
  | "COURSE_APPROVE"
  | "PROFILE_EDIT"
  | "ACM_READ"
  | "ACM_WRITE"
  | "ANALYTICS_VIEW"
  | "LEARNER_ACCESS"
  | "QUIZ_TAKE";

export type CourseStatus = "DRAFT" | "PENDING_REVIEW" | "PUBLISHED";
export type RolePathway = "PRINCIPAL" | "TEACHER" | "ACCOUNTANT" | "LIBRARIAN" | "GENERAL";
export type VideoProvider = "youtube" | "vimeo" | "self_hosted";
export type ResourceType = "pdf" | "checklist" | "guide" | "other";
export type TestimonialStatus = "pending" | "approved" | "rejected";

export interface AcademyProfilePublic {
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
}

export interface ProfileConfigPayload {
  tagline: string;
  mission: string;
  vision: string;
  description: string;
  logo_url: string | null;
  courses_count_override: number | null;
  learners_count_override: number | null;
  certificates_count_override: number | null;
  updated_at?: string;
}

export interface ResourceItem {
  id?: number;
  title: string;
  file_url: string;
  resource_type: ResourceType;
}

export interface LessonItem {
  id?: number;
  title: string;
  order: number;
  duration_minutes: number;
  video_provider: VideoProvider;
  video_url: string;
  description: string;
  resources?: ResourceItem[];
}

export interface ModuleItem {
  id?: number;
  title: string;
  order: number;
  lessons?: LessonItem[];
}

export interface CourseListItem {
  id: string;
  title: string;
  slug: string;
  description: string;
  thumbnail_url: string | null;
  role_pathway: RolePathway;
  status: CourseStatus;
  is_featured: boolean;
  module_count: number;
  duration_minutes: number;
  created_at: string;
}

export interface CourseDetail extends CourseListItem {
  modules: ModuleItem[];
  resources: ResourceItem[];
  testimonials: CourseTestimonialItem[];
  trainer: TrainerProfileItem | null;
}

export interface CourseWritePayload {
  title?: string;
  slug?: string;
  description?: string;
  role_pathway?: RolePathway;
  assigned_by?: string;
  thumbnail_url?: string | null;
  is_featured?: boolean;
  modules?: ModuleItem[];
  resources?: ResourceItem[];
}

export interface TrainerProfileItem {
  id: number;
  user_id: string;
  name: string;
  bio: string;
  photo_url: string | null;
  credentials: string;
  is_verified: boolean;
}

export interface FAQItem {
  id: number;
  question: string;
  answer: string;
  category: string;
  order: number;
}

export interface CourseTestimonialItem {
  id: number;
  user: { id: string; name: string };
  course: string;
  course_slug: string;
  message: string;
  rating: number;
  status: TestimonialStatus;
  approved_at: string | null;
  created_at: string;
}

export interface AcademyPermissionItem {
  id: number;
  user: string;
  user_matricule: string;
  scope: AcademyScope;
  granted_by: string | null;
  granted_by_matricule: string | null;
  granted_at: string;
}

interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/** DRF's pagination wraps lists as {results:[...]}; unwrap defensively so
 * callers never have to guess whether pagination is on for a given view. */
function unwrapList<T>(data: Paginated<T> | T[] | Record<string, T[]>): T[] {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray((data as Paginated<T>).results)) return (data as Paginated<T>).results;
  return [];
}

// ---------------------------------------------------------------------------
// Profile / stats (PROFILE_EDIT)
// ---------------------------------------------------------------------------

export const getAcademyProfile = () =>
  apiClient.get<AcademyProfilePublic>(`${BASE}/profile/`).then((r) => r.data);

export const updateProfileConfig = (payload: Partial<ProfileConfigPayload>) =>
  apiClient.put<ProfileConfigPayload>(`${BASE}/profile-config/`, payload).then((r) => r.data);

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------

export const listCourses = (params?: Record<string, string>) =>
  apiClient.get<Paginated<CourseListItem> | CourseListItem[]>(`${BASE}/courses/`, { params }).then((r) => unwrapList(r.data));

export const getCourse = (slug: string) =>
  apiClient.get<CourseDetail>(`${BASE}/courses/${slug}/`).then((r) => r.data);

export const createCourse = (payload: CourseWritePayload) =>
  apiClient.post<CourseDetail>(`${BASE}/courses/`, payload).then((r) => r.data);

export const updateCourse = (slug: string, payload: Partial<CourseWritePayload>) =>
  apiClient.patch<CourseDetail>(`${BASE}/courses/${slug}/`, payload).then((r) => r.data);

export const deleteCourse = (slug: string) => apiClient.delete(`${BASE}/courses/${slug}/`).then((r) => r.data);

export const submitCourseForReview = (slug: string) =>
  apiClient.post<CourseDetail>(`${BASE}/courses/${slug}/submit-for-review/`).then((r) => r.data);

export const approveCourse = (slug: string) =>
  apiClient.post<CourseDetail>(`${BASE}/courses/${slug}/approve/`).then((r) => r.data);

export const rejectCourse = (slug: string) =>
  apiClient.post<CourseDetail>(`${BASE}/courses/${slug}/reject/`).then((r) => r.data);

// ---------------------------------------------------------------------------
// Trainers (PROFILE_EDIT)
// ---------------------------------------------------------------------------

export const listTrainers = () =>
  apiClient.get<Paginated<TrainerProfileItem> | TrainerProfileItem[]>(`${BASE}/trainers/`).then((r) => unwrapList(r.data));

export const createTrainer = (payload: { user: string; bio: string; photo_url?: string; credentials: string; is_verified?: boolean }) =>
  apiClient.post<TrainerProfileItem>(`${BASE}/trainers/`, payload).then((r) => r.data);

export const updateTrainer = (id: number, payload: Partial<{ user: string; bio: string; photo_url: string; credentials: string; is_verified: boolean }>) =>
  apiClient.put<TrainerProfileItem>(`${BASE}/trainers/${id}/`, payload).then((r) => r.data);

export const deleteTrainer = (id: number) => apiClient.delete(`${BASE}/trainers/${id}/`).then((r) => r.data);

// ---------------------------------------------------------------------------
// FAQs (PROFILE_EDIT) — list is grouped by category server-side: {category: FAQItem[]}
// ---------------------------------------------------------------------------

export const listFaqsGrouped = () => apiClient.get<Record<string, FAQItem[]>>(`${BASE}/faqs/`).then((r) => r.data);

export const createFaq = (payload: { question: string; answer: string; category: string; order?: number }) =>
  apiClient.post<FAQItem>(`${BASE}/faqs/`, payload).then((r) => r.data);

export const updateFaq = (id: number, payload: Partial<{ question: string; answer: string; category: string; order: number }>) =>
  apiClient.put<FAQItem>(`${BASE}/faqs/${id}/`, payload).then((r) => r.data);

export const deleteFaq = (id: number) => apiClient.delete(`${BASE}/faqs/${id}/`).then((r) => r.data);

// ---------------------------------------------------------------------------
// Testimonials (ACM_READ to view, ACM_WRITE to approve/reject)
// ---------------------------------------------------------------------------

export const listTestimonials = (status?: TestimonialStatus) =>
  apiClient
    .get<Paginated<CourseTestimonialItem> | CourseTestimonialItem[]>(`${BASE}/testimonials/`, {
      params: status ? { status } : undefined,
    })
    .then((r) => unwrapList(r.data));

export const approveTestimonial = (id: number) =>
  apiClient.put<CourseTestimonialItem>(`${BASE}/testimonials/${id}/approve/`).then((r) => r.data);

export const rejectTestimonial = (id: number) =>
  apiClient.put<CourseTestimonialItem>(`${BASE}/testimonials/${id}/reject/`).then((r) => r.data);

// ---------------------------------------------------------------------------
// Permission grant/revoke (COURSE_ASSIGN or COURSE_APPROVE holders — CEO and
// CTO hold COURSE_APPROVE identically per the founder-parity bootstrap grant)
// ---------------------------------------------------------------------------

export const grantAcademyPermission = (payload: { user: string; scope: AcademyScope }) =>
  apiClient.post<AcademyPermissionItem>(`${BASE}/permissions/grant/`, payload).then((r) => r.data);

export const revokeAcademyPermission = (payload: { user: string; scope: AcademyScope }) =>
  apiClient.post<{ revoked: boolean }>(`${BASE}/permissions/revoke/`, payload).then((r) => r.data);
