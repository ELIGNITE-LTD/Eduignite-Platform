import { apiClient } from "../client";
import { API } from "../endpoints";
import type { CreateTestimonyRequest, PaginatedResponse, Testimony } from "../types";

/**
 * Testimonies live under backend/apps/community (apps/mobile's
 * community.service.ts covers blogs/comments too, which this app has no use
 * for). List is AllowAny on the backend; create requires auth + the
 * school's "community" app entitlement.
 */
export const communityService = {
  async getApprovedTestimonies(): Promise<PaginatedResponse<Testimony>> {
    const { data } = await apiClient.get(API.COMMUNITY.TESTIMONIES);
    return data;
  },

  async createTestimony(payload: CreateTestimonyRequest): Promise<Testimony> {
    const { data } = await apiClient.post(API.COMMUNITY.TESTIMONIES, payload);
    return data;
  },
};
