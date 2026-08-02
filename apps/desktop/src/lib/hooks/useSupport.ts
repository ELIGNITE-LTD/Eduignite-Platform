import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback } from 'react';
import { supportService } from '@/lib/api/services/support.service';
import type {
  SupportContribution,
  SupportStats,
  CreateSupportRequest,
  VerifySupportRequest,
  RejectSupportRequest,
  PaginationParams,
} from '@/lib/api/types';

// Query Key Factory
const supportKeys = {
  all: ['support'] as const,
  contributions: () => [...supportKeys.all, 'contributions'] as const,
  contributionsList: (params?: PaginationParams) =>
    [...supportKeys.contributions(), { ...params }] as const,
  stats: () => [...supportKeys.all, 'stats'] as const,
};

/**
 * Hook for fetching support contributions
 */
export function useSupportContributions(params?: PaginationParams) {
  return useQuery({
    queryKey: supportKeys.contributionsList(params),
    queryFn: () => supportService.getSupportContributions(params),
  });
}

/**
 * Hook for creating a support contribution
 */
export function useCreateSupport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateSupportRequest) =>
      supportService.createSupport(data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: supportKeys.contributionsList(),
      });
      queryClient.invalidateQueries({ queryKey: supportKeys.stats() });
    },
  });
}

/**
 * Hook for verifying a support contribution
 */
export function useVerifySupport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: VerifySupportRequest) =>
      supportService.verifySupport(data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: supportKeys.contributionsList(),
      });
      queryClient.invalidateQueries({ queryKey: supportKeys.stats() });
    },
  });
}

/**
 * Hook for rejecting a support contribution
 */
export function useRejectSupport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: RejectSupportRequest) =>
      supportService.rejectSupport(data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: supportKeys.contributionsList(),
      });
    },
  });
}

/**
 * Hook for fetching support statistics
 */
export function useSupportStats() {
  return useQuery({
    queryKey: supportKeys.stats(),
    queryFn: () => supportService.getSupportStats(),
  });
}
