import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback } from 'react';
import { communityService } from '@/lib/api/services/community.service';
import type {
  Testimony,
  Blog,
  BlogComment,
  CreateTestimonyRequest,
  ApproveTestimonyRequest,
  RejectTestimonyRequest,
  CreateBlogRequest,
  PublishBlogRequest,
  CreateBlogCommentRequest,
  PaginationParams,
} from '@/lib/api/types';

// Query Key Factory
const communityKeys = {
  all: ['community'] as const,
  testimonies: () => [...communityKeys.all, 'testimonies'] as const,
  testimoniesList: (params?: PaginationParams) =>
    [...communityKeys.testimonies(), { ...params }] as const,
  pending: () => [...communityKeys.all, 'pending-testimonies'] as const,
  blogs: () => [...communityKeys.all, 'blogs'] as const,
  blogsList: (params?: PaginationParams) =>
    [...communityKeys.blogs(), { ...params }] as const,
  blog: (slug: string) => [...communityKeys.blogs(), slug] as const,
  comments: (blogId: string) =>
    [...communityKeys.all, 'comments', blogId] as const,
};

/**
 * Hook for fetching approved testimonies
 */
export function useTestimonies(params?: PaginationParams) {
  return useQuery({
    queryKey: communityKeys.testimoniesList(params),
    queryFn: () => communityService.getTestimonies(params),
  });
}

/**
 * Hook for fetching pending testimonies (admin only)
 */
export function usePendingTestimonies() {
  return useQuery({
    queryKey: communityKeys.pending(),
    queryFn: () => communityService.getPendingTestimonies(),
  });
}

/**
 * Hook for creating a testimony
 */
export function useCreateTestimony() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateTestimonyRequest) =>
      communityService.createTestimony(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: communityKeys.pending() });
    },
  });
}

/**
 * Hook for approving a testimony
 */
export function useApproveTestimony() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ApproveTestimonyRequest | string) =>
      communityService.approveTestimony(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: communityKeys.pending() });
      queryClient.invalidateQueries({
        queryKey: communityKeys.testimoniesList(),
      });
    },
  });
}

/**
 * Hook for rejecting a testimony
 */
export function useRejectTestimony() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: RejectTestimonyRequest | string) =>
      communityService.rejectTestimony(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: communityKeys.pending() });
    },
  });
}

/**
 * Hook for fetching blogs
 */
export function useBlogs(params?: PaginationParams) {
  return useQuery({
    queryKey: communityKeys.blogsList(params),
    queryFn: () => communityService.getBlogs(params),
  });
}

/**
 * Hook for fetching a single blog by slug
 */
export function useBlog(slug: string) {
  return useQuery({
    queryKey: communityKeys.blog(slug),
    queryFn: () => communityService.getBlog(slug),
    enabled: !!slug,
  });
}

/**
 * Hook for creating a blog
 */
export function useCreateBlog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateBlogRequest) =>
      communityService.createBlog(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: communityKeys.blogsList() });
    },
  });
}

/**
 * Hook for publishing a blog
 */
export function usePublishBlog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: PublishBlogRequest | string) =>
      communityService.publishBlog(data),
    onSuccess: (_, variables) => {
      const slug = typeof variables === "string" ? variables : variables.slug;
      queryClient.invalidateQueries({ queryKey: communityKeys.blogsList() });
      queryClient.invalidateQueries({
        queryKey: communityKeys.blog(slug),
      });
    },
  });
}

/**
 * Hook for updating a strategic log
 */
export function useUpdateBlog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: CreateBlogRequest }) =>
      communityService.updateBlog(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: communityKeys.blogsList() });
      queryClient.invalidateQueries({ queryKey: communityKeys.blog(variables.id) });
    },
  });
}

/**
 * Hook for deleting a strategic log
 */
export function useDeleteBlog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => communityService.deleteBlog(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: communityKeys.blogsList() });
    },
  });
}

/**
 * Hook for fetching blog comments
 */
export function useBlogComments(blogId: string) {
  return useQuery({
    queryKey: communityKeys.comments(blogId),
    queryFn: () => communityService.getBlogComments(blogId),
    enabled: !!blogId,
  });
}

/**
 * Hook for creating a blog comment
 */
export function useCreateBlogComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateBlogCommentRequest | { blogId: string; content: string }) =>
      communityService.createBlogComment(
        "blogId" in data ? { blog_id: data.blogId, content: data.content } : data
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: communityKeys.comments("blogId" in variables ? variables.blogId : variables.blog_id),
      });
    },
  });
}
