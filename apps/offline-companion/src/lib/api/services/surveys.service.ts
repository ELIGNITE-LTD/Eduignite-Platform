import { apiClient } from "../client";
import { API } from "../endpoints";
import type { SurveyAnswerInput, SurveyDetail, SurveyListItem, SurveyResponseSummary } from "../types";

/**
 * backend/apps/surveys — EduIgnite's office publishes a survey, this app's
 * user answers it. IsAuthenticated only, no app-store entitlement gate
 * (unlike announcements/feedback/chat/community).
 */
export const surveysService = {
  /** Active surveys the caller hasn't answered yet. */
  async getPendingSurveys(): Promise<SurveyListItem[]> {
    const { data } = await apiClient.get(API.SURVEYS.BASE);
    // GET /surveys/ is paginated ({count, next, previous, results}) via this
    // backend's default pagination class -- confirmed live, 2026-09-13.
    // This previously returned `data` directly as if it were already the
    // bare array, so `.map()` on the result would have thrown at runtime
    // the moment the endpoint returned anything (surveys.length was never
    // actually reachable). Array.isArray guards a future/alternate
    // deployment that isn't paginated, without assuming either shape.
    return Array.isArray(data) ? data : (data?.results ?? []);
  },

  async getSurvey(id: number | string): Promise<SurveyDetail> {
    const { data } = await apiClient.get(API.SURVEYS.DETAIL(id));
    return data;
  },

  /** One answer per question, required for every question, string-valued. */
  async submitResponse(id: number | string, answers: SurveyAnswerInput[]): Promise<SurveyResponseSummary> {
    const { data } = await apiClient.post(API.SURVEYS.RESPOND(id), { answers });
    return data;
  },
};
