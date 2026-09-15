import { apiClient } from "../client";
import { API } from "../endpoints";
import type {
  SurveyAccess,
  SurveyAnswerInput,
  SurveyDetail,
  SurveyListItem,
  SurveyManaged,
  SurveyPublisher,
  SurveyPublishInput,
  SurveyResponsesReport,
  SurveyResponseSummary,
} from "../types";

const listOf = <T,>(data: any): T[] => (Array.isArray(data) ? data : (data?.results ?? []));

/**
 * backend/apps/surveys. The CEO, the CTO or an authorised publisher
 * publishes a survey for an audience, and every EduIgnite client (website,
 * mobile, desktop, offline companion) reads the same API. The server decides
 * who is in the audience and who may publish; nothing here is trusted.
 */
export const surveysService = {
  /** What the signed-in person may do with surveys. */
  async getAccess(): Promise<SurveyAccess> {
    const { data } = await apiClient.get(`${API.SURVEYS.BASE}access/`);
    return data;
  },

  /** Surveys the caller manages, with response counts. Publishers only. */
  async getManaged(): Promise<SurveyManaged[]> {
    const { data } = await apiClient.get(`${API.SURVEYS.BASE}managed/`, { params: { page_size: 100 } });
    return listOf<SurveyManaged>(data);
  },

  async getResponses(id: number | string): Promise<SurveyResponsesReport> {
    const { data } = await apiClient.get(`${API.SURVEYS.DETAIL(id)}responses/`);
    return data;
  },

  /** CEO/CTO only: people authorised to publish surveys. */
  async getPublishers(): Promise<SurveyPublisher[]> {
    const { data } = await apiClient.get(`${API.SURVEYS.BASE}publishers/`);
    return listOf<SurveyPublisher>(data);
  },

  async addPublisher(matricule: string): Promise<SurveyPublisher> {
    const { data } = await apiClient.post(`${API.SURVEYS.BASE}publishers/`, { matricule });
    return data;
  },

  async removePublisher(id: number | string): Promise<void> {
    await apiClient.delete(`${API.SURVEYS.BASE}publishers/${id}/`);
  },

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
