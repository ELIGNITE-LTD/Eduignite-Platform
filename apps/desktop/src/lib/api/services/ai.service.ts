import { apiClient } from '../client';
import { API } from '../endpoints';
import {
  AIRequest,
  AIInsight,
  PaginatedResponse,
  ListParams,
  AIExamDraft,
  AIExamDraftDetail,
  AIExamQuestion,
  CreateExamDraftPayload,
  QuestionBankItem,
  CareerReportPayload,
  CareerReportData,
  CareerOrientationReport,
  SkillGapReport,
  GuidanceReportPayload,
  StudentGuidanceReport,
  AcademicRoadmap,
} from '../types';

export const aiService = {
  async getAIRequests(params?: ListParams): Promise<PaginatedResponse<AIRequest>> {
    const { data } = await apiClient.get(API.AI.REQUESTS, { params });
    return data;
  },

  async getAIRequest(id: string): Promise<AIRequest> {
    const { data } = await apiClient.get(API.AI.REQUEST_DETAIL(id));
    return data;
  },

  async generateStudyPlan(
    studentIdOrPayload: string | { studentId?: string; subjects: string[]; duration?: number; weeks?: number },
    subjects?: string[],
    weeks?: number
  ): Promise<AIRequest> {
    const payload =
      typeof studentIdOrPayload === 'string'
        ? { student: studentIdOrPayload, subjects, weeks }
        : {
            student: studentIdOrPayload.studentId,
            subjects: studentIdOrPayload.subjects,
            weeks: studentIdOrPayload.weeks ?? studentIdOrPayload.duration,
          };
    const { data } = await apiClient.post(API.AI.STUDY_PLAN, {
      ...payload,
    });
    return data;
  },

  async analyzeGrades(
    studentIdOrPayload: string | { studentId?: string; sequenceId?: string },
    sequenceId?: string
  ): Promise<AIRequest> {
    const payload =
      typeof studentIdOrPayload === 'string'
        ? { student: studentIdOrPayload, sequence: sequenceId }
        : { student: studentIdOrPayload.studentId, sequence: studentIdOrPayload.sequenceId };
    const { data } = await apiClient.post(API.AI.ANALYZE_GRADES, {
      ...payload,
    });
    return data;
  },

  async getAttendanceInsight(studentId: string): Promise<AIRequest> {
    const { data } = await apiClient.post(API.AI.ATTENDANCE_INSIGHT, {
      student: studentId,
    });
    return data;
  },

  async getExamPrep(studentId: string, subjectId: string): Promise<AIRequest> {
    const { data } = await apiClient.post(API.AI.EXAM_PREP, {
      student: studentId,
      subject: subjectId,
    });
    return data;
  },

  async generateAttendanceInsight(payload: {
    studentId: string;
    startDate?: string;
    endDate?: string;
  }): Promise<AIRequest> {
    return this.getAttendanceInsight(payload.studentId);
  },

  async generateExamPrepPlan(payload: {
    studentId?: string;
    subjectId?: string;
    subject_id?: string;
    examType?: string;
    daysLeft?: number;
  }): Promise<AIRequest> {
    return this.getExamPrep(payload.studentId, payload.subjectId ?? payload.subject_id ?? payload.examType ?? '');
  },

  async generateParentReport(payload: {
    studentId?: string;
    student_id?: string;
    period?: string;
  }): Promise<AIRequest> {
    return this.getParentReport(payload.studentId ?? payload.student_id ?? '');
  },

  async getParentReport(studentId: string): Promise<AIRequest> {
    const { data } = await apiClient.post(API.AI.PARENT_REPORT, {
      student: studentId,
    });
    return data;
  },

  async getPlatformInsights(): Promise<AIRequest> {
    const { data } = await apiClient.get(API.AI.PLATFORM_INSIGHTS);
    return data;
  },

  async getInsights(params?: ListParams): Promise<PaginatedResponse<AIInsight>> {
    const { data } = await apiClient.get(API.AI.INSIGHTS, { params });
    return data;
  },

  async getAIInsights(params?: ListParams): Promise<PaginatedResponse<AIInsight>> {
    return this.getInsights(params);
  },

  async getInsight(id: string): Promise<AIInsight> {
    const { data } = await apiClient.get(API.AI.INSIGHT_DETAIL(id));
    return data;
  },

  async generateInsights(_payload?: any): Promise<AIInsight> {
    const { data } = await apiClient.post(API.AI.GENERATE_INSIGHTS, {});
    return data;
  },

  async directChat(message: string, history?: { role: string; content: string }[]): Promise<{ reply: string; tokens_used: number; processing_time_ms: number }> {
    const { data } = await apiClient.post(API.AI.DIRECT_CHAT, { message, history });
    return data;
  },

  async createExamDraft(payload: CreateExamDraftPayload): Promise<AIExamDraftDetail> {
    const { data } = await apiClient.post(API.AI.EXAM_DRAFTS, payload);
    return data;
  },

  async getExamDraft(id: string): Promise<AIExamDraftDetail> {
    const { data } = await apiClient.get(API.AI.EXAM_DRAFT_DETAIL(id));
    return data;
  },

  async listExamDrafts(params?: ListParams): Promise<PaginatedResponse<AIExamDraft>> {
    const { data } = await apiClient.get(API.AI.EXAM_DRAFTS, { params });
    return data;
  },

  async addExamQuestion(draftId: string, payload: Partial<AIExamQuestion>): Promise<AIExamQuestion> {
    const { data } = await apiClient.post(API.AI.EXAM_DRAFT_QUESTIONS(draftId), payload);
    return data;
  },

  async editExamQuestion(draftId: string, questionId: string, payload: Partial<AIExamQuestion>): Promise<AIExamQuestion> {
    const { data } = await apiClient.patch(API.AI.EXAM_QUESTION_DETAIL(draftId, questionId), payload);
    return data;
  },

  async deleteExamQuestion(draftId: string, questionId: string): Promise<void> {
    await apiClient.delete(API.AI.EXAM_QUESTION_DETAIL(draftId, questionId));
  },

  async publishExamDraft(id: string): Promise<{ exam_id?: string; assignment_id?: string; draft?: AIExamDraftDetail }> {
    const { data } = await apiClient.post(API.AI.EXAM_DRAFT_PUBLISH(id));
    return data;
  },

  async reviewExamDraft(id: string): Promise<AIExamDraftDetail> {
    const { data } = await apiClient.post(API.AI.EXAM_DRAFT_REVIEW(id));
    return data;
  },

  async regenerateExamDraft(id: string): Promise<AIExamDraftDetail> {
    const { data } = await apiClient.post(API.AI.EXAM_DRAFT_REGENERATE(id));
    return data;
  },

  async exportExamPDF(id: string): Promise<Blob> {
    const { data } = await apiClient.get(API.AI.EXAM_DRAFT_EXPORT_PDF(id), { responseType: 'blob' });
    return data;
  },

  async exportExamDocx(id: string): Promise<Blob> {
    const { data } = await apiClient.get(API.AI.EXAM_DRAFT_EXPORT_DOCX(id), { responseType: 'blob' });
    return data;
  },

  async getQuestionBank(params?: { subject?: string; class_level?: string; difficulty?: string; kind?: string; search?: string }): Promise<PaginatedResponse<QuestionBankItem>> {
    const { data } = await apiClient.get(API.AI.QUESTION_BANK, { params });
    return data;
  },

  async importQuestionBankItems(draftId: string, questionIds: string[]): Promise<{ imported: number }> {
    const { data } = await apiClient.post(API.AI.QUESTION_BANK_IMPORT, { draft_id: draftId, question_ids: questionIds });
    return data;
  },

  async createCareerReport(payload: CareerReportPayload): Promise<{ id: string; status: string; report_data?: CareerReportData | null; error?: string }> {
    const { data } = await apiClient.post(API.AI.CAREER_REPORTS, payload);
    return data;
  },

  async listCareerReports(params?: ListParams): Promise<PaginatedResponse<CareerOrientationReport>> {
    const { data } = await apiClient.get(API.AI.CAREER_REPORTS, { params });
    return data;
  },

  async getCareerReportStatus(id: string): Promise<{ status: string; report_data: CareerReportData | null; error?: string }> {
    const { data } = await apiClient.get(API.AI.CAREER_REPORT_STATUS(id));
    return data;
  },

  async exportCareerPDF(id: string): Promise<Blob> {
    const { data } = await apiClient.get(API.AI.CAREER_REPORT_EXPORT_PDF(id), { responseType: 'blob' });
    return data;
  },

  async exportCareerDocx(id: string): Promise<Blob> {
    const { data } = await apiClient.get(API.AI.CAREER_REPORT_EXPORT_DOCX(id), { responseType: 'blob' });
    return data;
  },

  async createRoadmap(payload: { student: string; academic_year: string; target_grade?: number; target_career?: string }): Promise<{ id: string; status: string }> {
    const { data } = await apiClient.post(API.AI.ROADMAPS, payload);
    return data;
  },

  async getRoadmapStatus(id: string): Promise<{ status: string; roadmap_data: Record<string, unknown> | null; error?: string }> {
    const { data } = await apiClient.get(API.AI.ROADMAP_STATUS(id));
    return data;
  },

  async listRoadmaps(params?: ListParams): Promise<PaginatedResponse<AcademicRoadmap>> {
    const { data } = await apiClient.get(API.AI.ROADMAPS, { params });
    return data;
  },

  async generateSkillGap(studentId: string, sequenceId?: string): Promise<{ id: string; status: string }> {
    const { data } = await apiClient.post(API.AI.SKILL_GAP, { student_id: studentId, sequence_id: sequenceId });
    return data;
  },

  async getSkillGapStatus(id: string): Promise<{ status: string; analysis_data: SkillGapReport['analysis_data'] | null; error?: string }> {
    const { data } = await apiClient.get(API.AI.SKILL_GAP_STATUS(id));
    return data;
  },

  async listSkillGapReports(params?: ListParams): Promise<PaginatedResponse<SkillGapReport>> {
    const { data } = await apiClient.get(API.AI.SKILL_GAP, { params });
    return data;
  },

  async createGuidanceReport(payload: GuidanceReportPayload): Promise<{ id: string; status: string }> {
    const { data } = await apiClient.post(API.AI.GUIDANCE_REPORTS, payload);
    return data;
  },

  async listGuidanceReports(params?: ListParams): Promise<PaginatedResponse<StudentGuidanceReport>> {
    const { data } = await apiClient.get(API.AI.GUIDANCE_REPORTS, { params });
    return data;
  },

  async getGuidanceReportStatus(id: string): Promise<{ status: string; report_data: StudentGuidanceReport['report_data'] | null; error?: string }> {
    const { data } = await apiClient.get(API.AI.GUIDANCE_REPORT_STATUS(id));
    return data;
  },

  async exportGuidancePDF(id: string): Promise<Blob> {
    const { data } = await apiClient.get(API.AI.GUIDANCE_REPORT_EXPORT_PDF(id), { responseType: 'blob' });
    return data;
  },

  async exportGuidanceDocx(id: string): Promise<Blob> {
    const { data } = await apiClient.get(API.AI.GUIDANCE_REPORT_EXPORT_DOCX(id), { responseType: 'blob' });
    return data;
  },
};
