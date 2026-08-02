import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback } from 'react';
import { studentsService } from '@/lib/api/services/students.service';
import type {
  Student,
  StudentRegistrySummary,
  CreateStudentRequest,
  UpdateStudentRequest,
  LinkParentRequest,
  PaginationParams,
} from '@/lib/api/types';

// Query Key Factory
const studentsKeys = {
  all: ['students'] as const,
  lists: () => [...studentsKeys.all, 'list'] as const,
  list: (params?: PaginationParams) =>
    [...studentsKeys.lists(), { ...params }] as const,
  details: () => [...studentsKeys.all, 'detail'] as const,
  detail: (id: string) => [...studentsKeys.details(), id] as const,
  me: () => [...studentsKeys.all, 'me'] as const,
  myClassHistory: () => [...studentsKeys.all, 'my-class-history'] as const,
  honourRoll: () => [...studentsKeys.all, 'honour-roll'] as const,
  summary: () => [...studentsKeys.all, 'summary'] as const,
  children: () => [...studentsKeys.all, 'children'] as const,
  classList: (className: string) =>
    [...studentsKeys.all, 'class', className] as const,
  card: (id: string) => [...studentsKeys.all, 'card', id] as const,
};

/**
 * Hook for fetching paginated students
 */
export function useStudents(params?: PaginationParams) {
  return useQuery({
    queryKey: studentsKeys.list(params),
    queryFn: () => studentsService.getStudents(params),
  });
}

export function useAllStudents(params?: PaginationParams, enabled = true) {
  return useQuery({
    queryKey: [...studentsKeys.lists(), 'all-pages', { ...params }] as const,
    queryFn: () => studentsService.getAllStudents(params),
    enabled,
  });
}

/**
 * Hook for fetching single student by ID
 */
export function useStudent(id: string) {
  return useQuery({
    queryKey: studentsKeys.detail(id),
    queryFn: () => studentsService.getStudent(id),
    enabled: !!id,
  });
}

/**
 * Hook for fetching honour roll students
 */
export function useHonourRoll() {
  return useQuery({
    queryKey: studentsKeys.honourRoll(),
    queryFn: () => studentsService.getHonourRoll(),
  });
}

export function useStudentRegistrySummary() {
  return useQuery<StudentRegistrySummary>({
    queryKey: studentsKeys.summary(),
    queryFn: () => studentsService.getRegistrySummary(),
  });
}

/**
 * Hook for fetching current user's children
 */
export function useMyChildren() {
  return useQuery({
    queryKey: studentsKeys.children(),
    queryFn: () => studentsService.getMyChildren(),
  });
}

/**
 * Hook for fetching class list
 * Only enabled when className is provided
 */
export function useClassList(className: string) {
  return useQuery({
    queryKey: studentsKeys.classList(className),
    queryFn: () => studentsService.getClassList(className),
    enabled: !!className,
  });
}

/**
 * Hook for creating a new student
 */
export function useCreateStudent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateStudentRequest) =>
      studentsService.createStudent(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: studentsKeys.lists() });
      queryClient.invalidateQueries({ queryKey: studentsKeys.summary() });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['schools', 'my'] });
    },
  });
}

/**
 * Hook for updating a student
 */
export function useUpdateStudent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateStudentRequest }) =>
      studentsService.updateStudent(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: studentsKeys.detail(variables.id),
      });
      queryClient.invalidateQueries({ queryKey: studentsKeys.lists() });
      queryClient.invalidateQueries({ queryKey: studentsKeys.summary() });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['schools', 'my'] });
    },
  });
}

/**
 * Hook for linking a parent to a student
 */
export function useLinkParent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ studentId, data }: { studentId: string; data: LinkParentRequest }) =>
      studentsService.linkParent(studentId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: studentsKeys.detail(variables.studentId),
      });
      queryClient.invalidateQueries({ queryKey: studentsKeys.lists() });
      queryClient.invalidateQueries({ queryKey: studentsKeys.children() });
      queryClient.invalidateQueries({ queryKey: studentsKeys.summary() });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useMyStudentProfile() {
  return useQuery({
    queryKey: studentsKeys.me(),
    queryFn: () => studentsService.getMyProfile(),
  });
}

export function useMyClassHistory(enabled = true) {
  return useQuery({
    queryKey: studentsKeys.myClassHistory(),
    queryFn: () => studentsService.getMyClassHistory(),
    enabled,
  });
}

/**
 * Hook for fetching student card/profile info
 */
export function useStudentCard(id: string) {
  return useQuery({
    queryKey: studentsKeys.card(id),
    queryFn: () => studentsService.getStudentCard(id),
    enabled: !!id,
  });
}
