import { apiClient } from '../client';
import { API } from '../endpoints';
import type {
  AssessmentArea,
  AssessmentAreaInput,
  AssessmentRating,
  AssessmentRatingBulkRequest,
  AssessmentRatingBulkResult,
} from '../types';

export const nurseryService = {
  async listAreas(): Promise<AssessmentArea[]> {
    const { data } = await apiClient.get(API.GRADES.ASSESSMENT_AREAS);
    const rows: AssessmentArea[] = data?.results ?? data ?? [];
    return [...rows].sort((a, b) => a.order_index - b.order_index || a.name.localeCompare(b.name));
  },

  async createArea(payload: AssessmentAreaInput): Promise<AssessmentArea> {
    const { data } = await apiClient.post(API.GRADES.ASSESSMENT_AREAS, payload);
    return data;
  },

  async updateArea(id: string, payload: AssessmentAreaInput): Promise<AssessmentArea> {
    const { data } = await apiClient.patch(API.GRADES.ASSESSMENT_AREA_DETAIL(id), payload);
    return data;
  },

  async deleteArea(id: string): Promise<void> {
    await apiClient.delete(API.GRADES.ASSESSMENT_AREA_DETAIL(id));
  },

  async listRatings(params: { class_id?: string; student_id?: string; academic_year?: string; term?: number }): Promise<AssessmentRating[]> {
    const { data } = await apiClient.get(API.GRADES.ASSESSMENT_RATINGS, { params });
    return data?.results ?? data ?? [];
  },

  /**
   * Upsert ratings. Offline, the apiClient interceptor queues this POST in the
   * outbox (same body, same idempotency key) and answers 202, so `queued` is
   * true and the replay on reconnect is safe to repeat.
   */
  async bulkSave(payload: AssessmentRatingBulkRequest): Promise<AssessmentRatingBulkResult> {
    const response = await apiClient.post(API.GRADES.ASSESSMENT_RATINGS_BULK, payload);
    const queued = response.status === 202 || Boolean(response.data?._offlineQueued);
    return { queued, ratings: queued ? [] : response.data ?? [] };
  },
};
