import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback } from 'react';
import { aiService } from '@/lib/api/services/ai.service';
import type {
  AIRequest,
  AIInsights,
  StudyPlan,
  GradeAnalysis,
  AttendanceInsight,
  ExamPrepPlan,
  ParentReport,
  PlatformInsight,
  GenerateInsightsRequest,
  CreateAIRequestRequest,
  PaginationParams,
} from '@/lib/api/types';

// Query Key Factory
const aiKeys = {
  all: ['ai'] as const,
  requests: () => [...aiKeys.all, 'requests'] as const,
  requestsList: (params?: PaginationParams) =>
    [...aiKeys.requests(), { ...params }] as const,
  insights: () => [...aiKeys.all, 'insights'] as const,
  platformInsights: () => [...aiKeys.all, 'platform-insights'] as const,
};

/**
 * Hook for fetching paginated AI requests
 */
export function useAIRequests(params?: PaginationParams) {
  return useQuery({
    queryKey: aiKeys.requestsList(params),
    queryFn: () => aiService.getAIRequests(params),
  });
}

/**
 * Hook for fetching AI insights
 */
export function useAIInsights() {
  return useQuery({
    queryKey: aiKeys.insights(),
    queryFn: () => aiService.getAIInsights(),
  });
}

/**
 * Hook for generating a study plan
 */
export function useGenerateStudyPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      studentId?: string;
      subjects: string[];
      duration?: number;
      weeks?: number;
    }) => aiService.generateStudyPlan(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiKeys.requestsList() });
      queryClient.invalidateQueries({ queryKey: aiKeys.insights() });
    },
  });
}

/**
 * Hook for analyzing grades
 */
export function useAnalyzeGrades() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { studentId?: string; sequenceId?: string }) =>
      aiService.analyzeGrades(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiKeys.requestsList() });
      queryClient.invalidateQueries({ queryKey: aiKeys.insights() });
    },
  });
}

/**
 * Hook for generating attendance insights
 */
export function useAttendanceInsight() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      studentId: string;
      startDate: string;
      endDate: string;
    }) => aiService.generateAttendanceInsight(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiKeys.requestsList() });
      queryClient.invalidateQueries({ queryKey: aiKeys.insights() });
    },
  });
}

/**
 * Hook for generating exam preparation plan
 */
export function useExamPrep() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { studentId?: string; examType?: string; daysLeft?: number; subject_id?: string; subjectId?: string }) =>
      aiService.generateExamPrepPlan(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiKeys.requestsList() });
      queryClient.invalidateQueries({ queryKey: aiKeys.insights() });
    },
  });
}

/**
 * Hook for generating parent report
 */
export function useParentReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { studentId?: string; student_id?: string; period?: string }) =>
      aiService.generateParentReport(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiKeys.requestsList() });
      queryClient.invalidateQueries({ queryKey: aiKeys.insights() });
    },
  });
}

/**
 * Hook for fetching platform insights
 */
export function usePlatformInsights() {
  return useQuery({
    queryKey: aiKeys.platformInsights(),
    queryFn: () => aiService.getPlatformInsights(),
  });
}

/**
 * Hook for generating platform insights
 */
export function useGenerateInsights() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: GenerateInsightsRequest) =>
      aiService.generateInsights(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiKeys.platformInsights() });
    },
  });
}
