import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback } from 'react';
import { gradesService } from '@/lib/api/services/grades.service';
import type {
  Subject,
  SubjectMaterial,
  StudentSubjectEnrollment,
  Sequence,
  Grade,
  ReportCard,
  ClassResults,
  ClassStatisticsResponse,
  PeriodStatisticsResponse,
  TermResults,
  AnnualResults,
  CreateGradeRequest,
  BulkCreateGradesRequest,
  CreateSubjectMaterialRequest,
  PaginationParams,
} from '@/lib/api/types';

// Query Key Factory
const gradesKeys = {
  all: ['grades'] as const,
  subjects: () => [...gradesKeys.all, 'subjects'] as const,
  subjectsList: (params?: PaginationParams) =>
    [...gradesKeys.subjects(), { ...params }] as const,
  enrollments: () => [...gradesKeys.all, 'student-enrollments'] as const,
  enrollmentsList: (params?: PaginationParams) =>
    [...gradesKeys.enrollments(), { ...params }] as const,
  materials: () => [...gradesKeys.all, 'materials'] as const,
  materialsList: (params?: PaginationParams) =>
    [...gradesKeys.materials(), { ...params }] as const,
  sequences: () => [...gradesKeys.all, 'sequences'] as const,
  sequencesList: (params?: PaginationParams) =>
    [...gradesKeys.sequences(), { ...params }] as const,
  activeSequences: () => [...gradesKeys.all, 'sequences', 'active'] as const,
  lists: () => [...gradesKeys.all, 'list'] as const,
  list: (params?: PaginationParams) =>
    [...gradesKeys.lists(), { ...params }] as const,
  reportCard: (studentId = "", sequenceId = "") =>
    [...gradesKeys.all, 'report-card', studentId, sequenceId] as const,
  classResults: (className = "", sequenceId = "") =>
    [...gradesKeys.all, 'class-results', className, sequenceId] as const,
  classStatistics: (sequenceId = "") =>
    [...gradesKeys.all, 'class-statistics', sequenceId] as const,
  periodStatistics: (params?: Record<string, unknown>) =>
    [...gradesKeys.all, 'period-statistics', { ...params }] as const,
  termResults: (params?: PaginationParams) =>
    [...gradesKeys.all, 'term-results', { ...params }] as const,
  annualResults: (params?: PaginationParams) =>
    [...gradesKeys.all, 'annual-results', { ...params }] as const,
};

/**
 * Hook for fetching subjects with optional pagination
 */
export function useSubjects(params?: PaginationParams) {
  return useQuery({
    queryKey: gradesKeys.subjectsList(params),
    queryFn: () => gradesService.getSubjects(params),
  });
}

export function useCreateSubject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<Subject>) => gradesService.createSubject(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gradesKeys.subjects() });
    },
  });
}

export function useStudentSubjectEnrollments(params?: PaginationParams, enabled = true) {
  return useQuery({
    queryKey: gradesKeys.enrollmentsList(params),
    queryFn: () => gradesService.getStudentSubjectEnrollments(params),
    enabled,
  });
}

export function useUpdateStudentSubjectEnrollment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<StudentSubjectEnrollment> }) =>
      gradesService.updateStudentSubjectEnrollment(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gradesKeys.enrollments() });
      queryClient.invalidateQueries({ queryKey: gradesKeys.subjects() });
    },
  });
}

export function useUpdateSubject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Subject> }) =>
      gradesService.updateSubject(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gradesKeys.subjects() });
    },
  });
}

export function useDeleteSubject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => gradesService.deleteSubject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gradesKeys.subjects() });
    },
  });
}

export function useSubjectMaterials(params?: PaginationParams, enabled = true) {
  return useQuery({
    queryKey: gradesKeys.materialsList(params),
    queryFn: () => gradesService.getSubjectMaterials(params),
    enabled,
  });
}

export function useCreateSubjectMaterial() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateSubjectMaterialRequest) => gradesService.createSubjectMaterial(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gradesKeys.materials() });
    },
  });
}

export function useDeleteSubjectMaterial() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => gradesService.deleteSubjectMaterial(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gradesKeys.materials() });
    },
  });
}

/**
 * Hook for fetching sequences with optional pagination
 */
export function useSequences(params?: PaginationParams) {
  return useQuery({
    queryKey: gradesKeys.sequencesList(params),
    queryFn: () => gradesService.getSequences(params),
  });
}

/**
 * Hook for fetching only active sequences
 */
export function useActiveSequence() {
  return useQuery({
    queryKey: gradesKeys.activeSequences(),
    queryFn: () => gradesService.getActiveSequences(),
  });
}

/**
 * Hook for fetching grades with optional pagination
 */
export function useGrades(params?: PaginationParams) {
  return useQuery({
    queryKey: gradesKeys.list(params),
    queryFn: () => gradesService.getGrades(params),
  });
}

/**
 * Hook for fetching student report card
 * Enabled only when both studentId and sequenceId are provided
 */
export function useReportCard(studentId: string, sequenceId: string) {
  return useQuery({
    queryKey: gradesKeys.reportCard(studentId, sequenceId),
    queryFn: () => gradesService.getReportCard(studentId, sequenceId),
    enabled: !!studentId && !!sequenceId,
  });
}

/**
 * Hook for fetching class results for a specific sequence
 */
export function useClassResults(className: string, sequenceId: string) {
  return useQuery({
    queryKey: gradesKeys.classResults(className, sequenceId),
    queryFn: () => gradesService.getClassResults(className, sequenceId),
    enabled: !!className && !!sequenceId,
  });
}

export function useClassStatistics(sequenceId?: string, enabled = true) {
  return useQuery<ClassStatisticsResponse>({
    queryKey: gradesKeys.classStatistics(sequenceId || ""),
    queryFn: () => gradesService.getClassStatistics(sequenceId ? { sequence_id: sequenceId } : undefined),
    enabled,
    refetchInterval: 30000,
  });
}

export function usePeriodStatistics(
  params?: {
    scope?: 'SEQUENCE' | 'TERM';
    sequence_id?: string;
    term?: number | string;
    academic_year?: string;
    class_id?: string;
    sub_school_id?: string;
  },
  enabled = true
) {
  return useQuery<PeriodStatisticsResponse>({
    queryKey: gradesKeys.periodStatistics(params),
    queryFn: () => gradesService.getPeriodStatistics(params),
    enabled,
    refetchInterval: 30000,
  });
}

/**
 * Hook for fetching term results
 */
export function useTermResults(params?: PaginationParams) {
  return useQuery({
    queryKey: gradesKeys.termResults(params),
    queryFn: () => gradesService.getTermResults(params),
  });
}

/**
 * Hook for fetching annual results
 */
export function useAnnualResults(params?: PaginationParams) {
  return useQuery({
    queryKey: gradesKeys.annualResults(params),
    queryFn: () => gradesService.getAnnualResults(params),
  });
}

/**
 * Hook for creating a single grade
 */
export function useCreateGrade() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateGradeRequest) =>
      gradesService.createGrade(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gradesKeys.lists() });
    },
  });
}

/**
 * Hook for bulk creating grades
 */
export function useBulkCreateGrades() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: BulkCreateGradesRequest) =>
      gradesService.bulkCreateGrades(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gradesKeys.lists() });
      queryClient.invalidateQueries({ queryKey: gradesKeys.reportCard() });
      queryClient.invalidateQueries({ queryKey: gradesKeys.classResults() });
      queryClient.invalidateQueries({ queryKey: gradesKeys.classStatistics() });
      queryClient.invalidateQueries({ queryKey: [...gradesKeys.all, 'period-statistics'] });
      queryClient.invalidateQueries({ queryKey: gradesKeys.termResults() });
    },
  });
}
