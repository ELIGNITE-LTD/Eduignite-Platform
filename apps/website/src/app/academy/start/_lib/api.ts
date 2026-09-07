/**
 * Scoped API helper for the Academy authenticated learner area
 * (auth gateway, lesson player, certificates). Deliberately NOT a top-level
 * `src/lib/academy.ts` — kept inside this route tree per the build plan, to
 * avoid collision risk with the public-catalog and admin-CMS agents working
 * in parallel under other `academy/*` directories.
 *
 * Reuses the platform's existing JWT session (`apiClient` already attaches
 * the stored access token and refreshes on 401 — see `src/lib/api/client.ts`).
 * There is no separate Academy auth mechanism.
 */
import { apiClient } from "@/lib/api/client";

// ---------------------------------------------------------------------------
// Shared shapes (mirrors backend/apps/academy/serializers.py)
// ---------------------------------------------------------------------------

export type VideoProvider = "youtube" | "vimeo" | "self_hosted";

export interface PlayerLesson {
  id: number;
  title: string;
  order: number;
  duration_minutes: number;
  description: string;
  video_provider: VideoProvider;
  video_url: string;
  completed: boolean;
  /** Additive backend field (not in the original endpoint spec) — the
   * lesson's MODULE_QUIZ id, if it has one, needed to call the quiz-attempt
   * endpoint. Null when the lesson has no quiz. */
  quiz_id: number | null;
}

export interface PlayerModule {
  id: number;
  title: string;
  order: number;
  lessons: PlayerLesson[];
}

export interface CoursePlayer {
  id: number;
  title: string;
  slug: string;
  description: string;
  role_pathway: string;
  modules: PlayerModule[];
  /** Additive backend field — the course's FINAL_ASSESSMENT quiz id, if any. */
  final_assessment_id: number | null;
}

export interface SsoContinueResponse {
  return_path: string;
  recommended_course_slugs: string[];
}

export interface AcademyRegisterPayload {
  name: string;
  email: string;
  password: string;
  phone?: string;
}

export interface AcademyRegisterResponse {
  access_token: string;
  refresh_token: string;
  return_path: string;
  user: {
    id: string;
    matricule: string;
    name: string;
    email: string;
    role: string;
  };
}

export interface EnrollResponse {
  enrolled: boolean;
  source: "sso" | "direct";
  enrolled_at: string;
}

export interface LessonCompleteResponse {
  lesson_id: number;
  completed: boolean;
}

export interface QuizQuestion {
  id: number;
  text: string;
  choices: string[];
}

export interface QuizAttemptGetResponse {
  quiz_id: number;
  kind: "MODULE_QUIZ" | "FINAL_ASSESSMENT";
  pass_threshold_percent: number;
  questions: QuizQuestion[];
}

export interface QuizAttemptSubmitResponse {
  attempt_id: number;
  score_percent: number;
  passed: boolean;
}

export interface MyCertificate {
  id: string;
  verification_id: string;
  learner_name: string;
  course_title: string;
  course_slug: string;
  tier: "COMPLETION" | "CERTIFIED_USER" | "CERTIFIED_TRAINER";
  issued_at: string;
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

/** Path A: get-or-create the caller's Academy profile and resolve where to
 * land next (a cached deep-link return path, or the Academy home). */
export async function ssoContinue(state?: string): Promise<SsoContinueResponse> {
  const { data } = await apiClient.post("/academy/sso/continue/", {}, {
    params: state ? { state } : undefined,
  });
  return data;
}

/** Path B: create a standalone Academy learner account (no school tenant).
 * Returns fresh JWT tokens — the caller is responsible for storing them via
 * `setTokens()` from `@/lib/api/client`, same as the existing login flow. */
export async function registerLearner(
  payload: AcademyRegisterPayload,
  state?: string
): Promise<AcademyRegisterResponse> {
  const { data } = await apiClient.post("/academy/register/", payload, {
    params: state ? { state } : undefined,
  });
  return data;
}

export async function enrollInCourse(slug: string): Promise<EnrollResponse> {
  const { data } = await apiClient.post(`/academy/courses/${encodeURIComponent(slug)}/enroll/`);
  return data;
}

/** Full lesson content including video URLs — 403s if the caller isn't
 * enrolled; callers should catch that and prompt to enroll instead of
 * showing a raw error. */
export async function getCoursePlayer(slug: string): Promise<CoursePlayer> {
  const { data } = await apiClient.get(`/academy/courses/${encodeURIComponent(slug)}/player/`);
  return data;
}

export async function completeLesson(lessonId: number): Promise<LessonCompleteResponse> {
  const { data } = await apiClient.post(`/academy/lessons/${lessonId}/complete/`);
  return data;
}

export async function getQuizAttempt(quizId: number): Promise<QuizAttemptGetResponse> {
  const { data } = await apiClient.get(`/academy/quizzes/${quizId}/attempt/`);
  return data;
}

export async function submitQuizAttempt(
  quizId: number,
  answers: { question_id: number; selected_index: number }[]
): Promise<QuizAttemptSubmitResponse> {
  const { data } = await apiClient.post(`/academy/quizzes/${quizId}/attempt/`, { answers });
  return data;
}

/** The learner's own certificates. Backend endpoint added specifically for
 * this page (`GET /api/v1/academy/certificates/`) — not part of the original
 * named endpoint list, since none of it covered "list my own certificates";
 * see backend/apps/academy/views.py `MyCertificatesView` for why. */
export async function getMyCertificates(): Promise<MyCertificate[]> {
  const { data } = await apiClient.get("/academy/certificates/");
  return data;
}
