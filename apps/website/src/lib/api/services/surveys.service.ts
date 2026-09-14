import { apiClient } from "../client";
import { API } from "../endpoints";
import type {
  SurveyAnswerInput,
  SurveyDetail,
  SurveyListItem,
  SurveyPublishInput,
  SurveyResponseSummary,
} from "../types";

/**
 * backend/apps/surveys — the CEO or CTO publishes a survey here and it
 * immediately becomes visible to every authenticated user across every
 * EduIgnite client that reads this API (website, mobile, desktop, offline
 * companion) -- no per-app publish step. Read/respond needs only
 * IsAuthenticated (no app-store entitlement gate); create/update/delete
 * is CEO/CTO only, enforced server-side.
 */
export const surveysService = {
  /** Active surveys the caller hasn't answered yet. */
  async getPendingSurveys(): Promise<SurveyListItem[]> {
    const { data } = await apiClient.get(API.SURVEYS.BASE);
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

  /** CEO/CTO only -- rejected with a 403 for any other role. */
  async publish(input: SurveyPublishInput): Promise<SurveyDetail> {
    const { data } = await apiClient.post(API.SURVEYS.BASE, input);
    return data;
  },

  /** CEO/CTO only. Used to unpublish (is_active: false) or edit a survey. */
  async update(id: number | string, input: Partial<SurveyPublishInput>): Promise<SurveyDetail> {
    const { data } = await apiClient.patch(API.SURVEYS.DETAIL(id), input);
    return data;
  },

  /** CEO/CTO only. */
  async remove(id: number | string): Promise<void> {
    await apiClient.delete(API.SURVEYS.DETAIL(id));
  },
};
