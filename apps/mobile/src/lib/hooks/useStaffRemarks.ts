import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback } from 'react';
import { staffRemarksService } from '@/lib/api/services/staff-remarks.service';
import type {
  StaffRemark,
  CreateRemarkRequest,
  AcknowledgeRemarkRequest,
  PaginationParams,
} from '@/lib/api/types';

// Query Key Factory
const staffRemarksKeys = {
  all: ['staff-remarks'] as const,
  lists: () => [...staffRemarksKeys.all, 'list'] as const,
  list: (params?: PaginationParams) =>
    [...staffRemarksKeys.lists(), { ...params }] as const,
  my: () => [...staffRemarksKeys.all, 'my'] as const,
};

/**
 * Hook for fetching paginated staff remarks
 */
export function useStaffRemarks(params?: PaginationParams) {
  return useQuery({
    queryKey: staffRemarksKeys.list(params),
    queryFn: () => staffRemarksService.getStaffRemarks(params),
  });
}

/**
 * Hook for fetching current user's remarks
 */
export function useMyRemarks() {
  return useQuery({
    queryKey: staffRemarksKeys.my(),
    queryFn: () => staffRemarksService.getMyRemarks(),
  });
}

/**
 * Hook for creating a staff remark
 */
export function useCreateRemark() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateRemarkRequest) =>
      staffRemarksService.createRemark(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: staffRemarksKeys.lists() });
    },
  });
}

/**
 * Hook for acknowledging a staff remark
 */
export function useAcknowledgeRemark() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: AcknowledgeRemarkRequest) =>
      staffRemarksService.acknowledgeRemark(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: staffRemarksKeys.my() });
      queryClient.invalidateQueries({ queryKey: staffRemarksKeys.lists() });
    },
  });
}
