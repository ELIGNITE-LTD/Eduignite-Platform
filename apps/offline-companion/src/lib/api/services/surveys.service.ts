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
    return data;
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
