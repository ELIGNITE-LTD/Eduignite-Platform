import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback } from 'react';
import { feedbackService } from '@/lib/api/services/feedback.service';
import type {
  Feedback,
  FeedbackStats,
  CreateFeedbackRequest,
  ResolveFeedbackRequest,
  RespondToFeedbackRequest,
  PaginationParams,
} from '@/lib/api/types';

// Query Key Factory
const feedbackKeys = {
  all: ['feedback'] as const,
  lists: () => [...feedbackKeys.all, 'list'] as const,
  list: (params?: PaginationParams) =>
    [...feedbackKeys.lists(), { ...params }] as const,
  my: () => [...feedbackKeys.all, 'my'] as const,
  stats: () => [...feedbackKeys.all, 'stats'] as const,
};

/**
 * Hook for fetching paginated feedbacks
 */
export function useFeedbacks(params?: PaginationParams) {
  return useQuery({
    queryKey: feedbackKeys.list(params),
    queryFn: () => feedbackService.getFeedbacks(params),
  });
}

/**
 * Hook for fetching current user's feedbacks
 */
export function useMyFeedbacks() {
  return useQuery({
    queryKey: feedbackKeys.my(),
    queryFn: () => feedbackService.getMyFeedbacks(),
  });
}

/**
 * Hook for fetching feedback statistics
 */
export function useFeedbackStats() {
  return useQuery({
    queryKey: feedbackKeys.stats(),
    queryFn: () => feedbackService.getFeedbackStats(),
  });
}

/**
 * Hook for creating feedback
 */
export function useCreateFeedback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateFeedbackRequest) =>
      feedbackService.createFeedback(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: feedbackKeys.my() });
      queryClient.invalidateQueries({ queryKey: feedbackKeys.stats() });
    },
  });
}

/**
 * Hook for resolving feedback
 */
export function useResolveFeedback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ResolveFeedbackRequest) =>
      feedbackService.resolveFeedback(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: feedbackKeys.lists() });
      queryClient.invalidateQueries({ queryKey: feedbackKeys.stats() });
    },
  });
}

/**
 * Hook for responding to feedback
 */
export function useRespondToFeedback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: RespondToFeedbackRequest) =>
      feedbackService.respondToFeedback(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: feedbackKeys.lists() });
      queryClient.invalidateQueries({ queryKey: feedbackKeys.my() });
    },
  });
}
