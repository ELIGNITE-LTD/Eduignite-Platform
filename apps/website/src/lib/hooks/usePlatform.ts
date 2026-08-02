import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback } from 'react';
import { platformService } from '@/lib/api/services/platform.service';
import type {
  PlatformSettings,
  PlatformFees,
  PublicEvent,
  UpdatePlatformSettingsRequest,
  CreatePublicEventRequest,
} from '@/lib/api/types';

// Query Key Factory
const platformKeys = {
  all: ['platform'] as const,
  settings: () => [...platformKeys.all, 'settings'] as const,
  fees: () => [...platformKeys.all, 'fees'] as const,
  events: () => [...platformKeys.all, 'events'] as const,
  stats: () => [...platformKeys.all, 'stats'] as const,
};

/**
 * Hook for fetching platform settings
 */
export function usePlatformSettings() {
  return useQuery({
    queryKey: platformKeys.settings(),
    queryFn: () => platformService.getPlatformSettings(),
  });
}

/**
 * Hook for fetching platform fees
 */
export function usePlatformFees() {
  return useQuery({
    queryKey: platformKeys.fees(),
    queryFn: () => platformService.getPlatformFees(),
  });
}

/**
 * Hook for fetching public events
 */
export function usePublicEvents() {
  return useQuery({
    queryKey: platformKeys.events(),
    queryFn: () => platformService.getPublicEvents(),
  });
}

/**
 * Hook for fetching platform statistics
 */
export function usePlatformStats() {
  return useQuery({
    queryKey: platformKeys.stats(),
    queryFn: () => platformService.getPlatformStats(),
  });
}

/**
 * Hook for updating platform settings
 */
export function useUpdatePlatformSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdatePlatformSettingsRequest) =>
      platformService.updatePlatformSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: platformKeys.settings() });
    },
  });
}

/**
 * Hook for creating a public event
 */
export function useCreatePublicEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreatePublicEventRequest | FormData) =>
      platformService.createPublicEvent(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: platformKeys.events() });
    },
  });
}

/**
 * Hook for deleting a public event
 */
export function useDeletePublicEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => platformService.deletePublicEvent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: platformKeys.events() });
    },
  });
}

export function useUpdatePublicEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<PublicEvent> | FormData }) =>
      platformService.updatePublicEvent(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: platformKeys.events() });
    },
  });
}
