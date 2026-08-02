import { apiClient } from '../client';
import { API } from '../endpoints';
import type {
  Assignment,
  AssignmentSubmission,
  CreateAssignmentRequest,
  CreateAssignmentSubmissionRequest,
  GradeAssignmentSubmissionRequest,
  ListParams,
  PaginatedResponse,
} from '../types';

export const assignmentsService = {
  async getAssignments(params?: ListParams): Promise<PaginatedResponse<Assignment>> {
    const { data } = await apiClient.get(API.ASSIGNMENTS.BASE, { params });
    return data;
  },

  async getAssignment(id: string): Promise<Assignment> {
    const { data } = await apiClient.get(API.ASSIGNMENTS.DETAIL(id));
    return data;
  },

  async createAssignment(payload: CreateAssignmentRequest): Promise<Assignment> {
    const { data } = await apiClient.post(API.ASSIGNMENTS.BASE, payload);
    return data;
  },

  async updateAssignment(id: string, payload: Partial<CreateAssignmentRequest>): Promise<Assignment> {
    const { data } = await apiClient.patch(API.ASSIGNMENTS.DETAIL(id), payload);
    return data;
  },

  async deleteAssignment(id: string): Promise<void> {
    await apiClient.delete(API.ASSIGNMENTS.DETAIL(id));
  },

  async getSubmissions(params?: ListParams & { assignment?: string }): Promise<PaginatedResponse<AssignmentSubmission>> {
    const { data } = await apiClient.get(API.ASSIGNMENTS.SUBMISSIONS, { params });
    return data;
  },

  async getMySubmissions(params?: ListParams): Promise<PaginatedResponse<AssignmentSubmission>> {
    const { data } = await apiClient.get(API.ASSIGNMENTS.MY_SUBMISSIONS, { params });
    return data;
  },

  async createSubmission(payload: CreateAssignmentSubmissionRequest): Promise<AssignmentSubmission> {
    const { data } = await apiClient.post(API.ASSIGNMENTS.SUBMISSIONS, payload);
    return data;
  },

  async updateSubmission(id: string, payload: Partial<CreateAssignmentSubmissionRequest>): Promise<AssignmentSubmission> {
    const { data } = await apiClient.patch(API.ASSIGNMENTS.SUBMISSION_DETAIL(id), payload);
    return data;
  },

  async gradeSubmission(id: string, payload: GradeAssignmentSubmissionRequest): Promise<AssignmentSubmission> {
    const { data } = await apiClient.post(API.ASSIGNMENTS.GRADE_SUBMISSION(id), payload);
    return data;
  },
};

