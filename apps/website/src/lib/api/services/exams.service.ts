import { apiClient } from '../client';
import { API } from '../endpoints';
import type {
  CreateExamRequest,
  CreateExamSubmissionRequest,
  Exam,
  ExamSubmission,
  ListParams,
  PaginatedResponse,
} from '../types';

export const examsService = {
  async getExams(params?: ListParams & { mode?: string }): Promise<PaginatedResponse<Exam>> {
    const { data } = await apiClient.get(API.EXAMS.BASE, { params });
    return data;
  },

  async getActiveExams(): Promise<Exam[]> {
    const { data } = await apiClient.get(API.EXAMS.ACTIVE);
    return data;
  },

  async getExam(id: string): Promise<Exam> {
    const { data } = await apiClient.get(API.EXAMS.DETAIL(id));
    return data;
  },

  async createExam(payload: CreateExamRequest): Promise<Exam> {
    const { data } = await apiClient.post(API.EXAMS.BASE, payload);
    return data;
  },

  async updateExam(id: string, payload: Partial<CreateExamRequest>): Promise<Exam> {
    const { data } = await apiClient.patch(API.EXAMS.DETAIL(id), payload);
    return data;
  },

  async deleteExam(id: string): Promise<void> {
    await apiClient.delete(API.EXAMS.DETAIL(id));
  },

  async getSubmissions(params?: ListParams & { exam?: string }): Promise<PaginatedResponse<ExamSubmission>> {
    const { data } = await apiClient.get(API.EXAMS.SUBMISSIONS, { params });
    return data;
  },

  async getSubmission(id: string): Promise<ExamSubmission> {
    const { data } = await apiClient.get(API.EXAMS.SUBMISSION_DETAIL(id));
    return data;
  },

  async getMyResults(params?: ListParams): Promise<PaginatedResponse<ExamSubmission>> {
    const { data } = await apiClient.get(API.EXAMS.MY_RESULTS, { params });
    return data;
  },

  async createSubmission(payload: CreateExamSubmissionRequest): Promise<ExamSubmission> {
    const { data } = await apiClient.post(API.EXAMS.SUBMISSIONS, payload);
    return data;
  },
};
