import { apiClient } from "../client";
import { API } from "../endpoints";
import type { CreateFeedbackRequest, Feedback, PaginatedResponse } from "../types";

/**
 * Trimmed down from apps/mobile/src/lib/api/services/feedback.service.ts —
 * this app only ever submits feedback and checks on what it already sent, it
 * never resolves/responds to tickets (that stays an EduIgnite-staff action).
 * Requires the school's "feedback" app entitlement, same as apps/mobile.
 */
export const feedbackService = {
  async getMyFeedback(): Promise<PaginatedResponse<Feedback>> {
    const { data } = await apiClient.get(API.FEEDBACK.MY_FEEDBACK);
    return data;
  },

  async createFeedback(payload: CreateFeedbackRequest): Promise<Feedback> {
    const { data } = await apiClient.post(API.FEEDBACK.BASE, payload);
    return data;
  },
};
