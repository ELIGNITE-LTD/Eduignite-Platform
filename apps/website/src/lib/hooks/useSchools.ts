import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback } from 'react';
import { schoolsService } from '@/lib/api/services/schools.service';
import type {
  School,
  CreateSchoolRequest,
  UpdateSchoolRequest,
  ToggleSchoolStatusRequest,
  UpdateSchoolSettingsRequest,
  PaginationParams,
  HierarchyClass,
} from '@/lib/api/types';

// Query Key Factory
const schoolsKeys = {
  all: ['schools'] as const,
  lists: () => [...schoolsKeys.all, 'list'] as const,
  list: (params?: PaginationParams) =>
    [...schoolsKeys.lists(), { ...params }] as const,
  details: () => [...schoolsKeys.all, 'detail'] as const,
  detail: (id: string) => [...schoolsKeys.details(), id] as const,
  my: () => [...schoolsKeys.all, 'my'] as const,
  stats: () => [...schoolsKeys.all, 'stats'] as const,
  settings: (id: string) => [...schoolsKeys.all, 'settings', id] as const,
  hierarchyClasses: (params?: { school_id?: string; sub_school?: string }) =>
    [...schoolsKeys.all, 'hierarchy-classes', { ...(params ?? {}) }] as const,
};

/**
 * Hook for fetching paginated schools
 */
export function useSchools(params?: PaginationParams) {
  return useQuery({
    queryKey: schoolsKeys.list(params),
    queryFn: () => schoolsService.getSchools(params),
  });
}

/**
 * Hook for fetching single school by ID
 */
export function useSchool(id: string) {
  return useQuery({
    queryKey: schoolsKeys.detail(id),
    queryFn: () => schoolsService.getSchool(id),
    enabled: !!id,
  });
}

/**
 * Hook for fetching current user's school
 */
export function useMySchool() {
  return useQuery({
    queryKey: schoolsKeys.my(),
    queryFn: () => schoolsService.getMySchool(),
  });
}

/**
 * Hook for fetching school statistics
 */
export function useSchoolStats() {
  return useQuery({
    queryKey: schoolsKeys.stats(),
    queryFn: () => schoolsService.getSchoolStats(),
  });
}

/**
 * Hook for fetching school settings
 */
export function useSchoolSettings(id: string) {
  return useQuery({
    queryKey: schoolsKeys.settings(id),
    queryFn: () => schoolsService.getSchoolSettings(id),
    enabled: !!id,
  });
}

/**
 * Hook for creating a new school
 */
export function useCreateSchool() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateSchoolRequest) =>
      schoolsService.createSchool(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: schoolsKeys.lists() });
    },
  });
}

/**
 * Hook for updating a school
 */
export function useUpdateSchool() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateSchoolRequest }) =>
      schoolsService.updateSchool(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: schoolsKeys.detail(variables.id),
      });
      queryClient.invalidateQueries({ queryKey: schoolsKeys.lists() });
      queryClient.invalidateQueries({ queryKey: schoolsKeys.my() });
    },
  });
}

/**
 * Hook for deleting a school
 */
export function useDeleteSchool() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: string | { id: string; confirmation: { matricule: string; password: string } }) =>
      typeof input === 'string'
        ? schoolsService.deleteSchool(input)
        : schoolsService.deleteSchool(input.id, input.confirmation),
    onSuccess: (_, input) => {
      const id = typeof input === 'string' ? input : input.id;
      queryClient.removeQueries({ queryKey: schoolsKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: schoolsKeys.lists() });
    },
  });
}

export function useHierarchyClasses(params?: { school_id?: string; sub_school?: string }, enabled = true) {
  return useQuery<HierarchyClass[]>({
    queryKey: schoolsKeys.hierarchyClasses(params),
    queryFn: () => schoolsService.getHierarchyClasses(params),
    enabled,
  });
}

/**
 * Hook for toggling school status
 */
export function useToggleSchoolStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: ToggleSchoolStatusRequest;
    }) => schoolsService.toggleSchoolStatus(id, data as Record<string, unknown>),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: schoolsKeys.detail(variables.id),
      });
      queryClient.invalidateQueries({ queryKey: schoolsKeys.lists() });
    },
  });
}

/**
 * Hook for updating school settings
 */
export function useUpdateSchoolSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: UpdateSchoolSettingsRequest;
    }) => schoolsService.updateSchoolSettings(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: schoolsKeys.settings(variables.id),
      });
      queryClient.invalidateQueries({
        queryKey: schoolsKeys.detail(variables.id),
      });
    },
  });
}
