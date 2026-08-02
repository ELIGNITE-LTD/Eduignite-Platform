import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback } from 'react';
import { announcementsService } from '@/lib/api/services/announcements.service';
import type {
  Announcement,
  CreateAnnouncementRequest,
  PaginationParams,
} from '@/lib/api/types';

// Query Key Factory
const announcementsKeys = {
  all: ['announcements'] as const,
  lists: () => [...announcementsKeys.all, 'list'] as const,
  list: (params?: PaginationParams) =>
    [...announcementsKeys.lists(), { ...params }] as const,
  feed: () => [...announcementsKeys.all, 'feed'] as const,
  pinned: () => [...announcementsKeys.all, 'pinned'] as const,
  platform: () => [...announcementsKeys.all, 'platform'] as const,
};

/**
 * Hook for fetching paginated announcements
 */
export function useAnnouncements(params?: PaginationParams) {
  return useQuery({
    queryKey: announcementsKeys.list(params),
    queryFn: () => announcementsService.getAnnouncements(params),
  });
}

/**
 * Hook for fetching current user's announcement feed
 */
export function useMyAnnouncementFeed() {
  return useQuery({
    queryKey: announcementsKeys.feed(),
    queryFn: () => announcementsService.getMyAnnouncementFeed(),
  });
}

/**
 * Hook for fetching pinned announcements
 */
export function usePinnedAnnouncements() {
  return useQuery({
    queryKey: announcementsKeys.pinned(),
    queryFn: () => announcementsService.getPinnedAnnouncements(),
  });
}

/**
 * Hook for fetching platform announcements
 */
export function usePlatformAnnouncements() {
  return useQuery({
    queryKey: announcementsKeys.platform(),
    queryFn: () => announcementsService.getPlatformAnnouncements(),
  });
}

/**
 * Hook for creating an announcement
 */
export function useCreateAnnouncement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateAnnouncementRequest) =>
      announcementsService.createAnnouncement(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: announcementsKeys.lists() });
      queryClient.invalidateQueries({ queryKey: announcementsKeys.feed() });
    },
  });
}

/**
 * Hook for marking an announcement as read
 */
export function useMarkAnnouncementRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      announcementsService.markAnnouncementRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: announcementsKeys.feed() });
      queryClient.invalidateQueries({ queryKey: announcementsKeys.lists() });
    },
  });
}

/**
 * Hook for deleting an announcement
 */
export function useDeleteAnnouncement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      announcementsService.deleteAnnouncement(id),
    onSuccess: () => {
      queryClient.removeQueries({
        queryKey: announcementsKeys.lists(),
      });
      queryClient.invalidateQueries({ queryKey: announcementsKeys.feed() });
    },
  });
}
