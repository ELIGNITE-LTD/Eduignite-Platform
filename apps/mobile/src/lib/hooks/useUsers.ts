import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback } from 'react';
import { usersService } from '@/lib/api/services/users.service';
import type {
  User,
  FounderProfile,
  CreateFounderRequest,
  UpdateFounderRequest,
  AddFounderSharesRequest,
  CreateUserRequest,
  UpdateProfileRequest,
  UpdateRoleRequest,
  ToggleLicenseRequest,
  PaginationParams,
} from '@/lib/api/types';

// Query Key Factory
const usersKeys = {
  all: ['users'] as const,
  lists: () => [...usersKeys.all, 'list'] as const,
  list: (params?: PaginationParams) =>
    [...usersKeys.lists(), { ...params }] as const,
  details: () => [...usersKeys.all, 'detail'] as const,
  detail: (id: string) => [...usersKeys.details(), id] as const,
  stats: () => [...usersKeys.all, 'stats'] as const,
  executives: () => [...usersKeys.all, 'executives'] as const,
  founders: () => [...usersKeys.all, 'founders'] as const,
  bySchool: (schoolId: string, params?: PaginationParams) =>
    [...usersKeys.all, 'school', schoolId, { ...params }] as const,
};

/**
 * Hook for fetching paginated users
 */
export function useUsers(params?: PaginationParams) {
  return useQuery({
    queryKey: usersKeys.list(params),
    queryFn: () => usersService.getUsers(params),
  });
}

/**
 * Hook for fetching every user matching `params` (all pages). Use this for
 * selectors and complete tables; `useUsers` returns a single page.
 */
export function useAllUsers(params?: PaginationParams, enabled = true) {
  return useQuery({
    queryKey: [...usersKeys.lists(), 'all-pages', { ...params }] as const,
    queryFn: () => usersService.getAllUsers(params),
    enabled,
  });
}

/**
 * Hook for fetching single user by ID
 */
export function useUser(id: string) {
  return useQuery({
    queryKey: usersKeys.detail(id),
    queryFn: () => usersService.getUser(id),
    enabled: !!id,
  });
}

/**
 * Hook for fetching user statistics
 */
export function useUserStats() {
  return useQuery({
    queryKey: usersKeys.stats(),
    queryFn: () => usersService.getUserStats(),
  });
}

/**
 * Hook for fetching executives only
 */
export function useExecutives() {
  return useQuery({
    queryKey: usersKeys.executives(),
    queryFn: () => usersService.getExecutives(),
  });
}

export function useFounders() {
  return useQuery<FounderProfile[]>({
    queryKey: usersKeys.founders(),
    queryFn: () => usersService.getFounders(),
  });
}

/**
 * Hook for fetching users by school
 */
export function useUsersBySchool(schoolId: string, params?: PaginationParams) {
  return useQuery({
    queryKey: usersKeys.bySchool(schoolId, params),
    queryFn: () => usersService.getUsersBySchool(schoolId, params),
    enabled: !!schoolId,
  });
}

export function useAllUsersBySchool(schoolId: string, params?: PaginationParams, enabled = true) {
  return useQuery({
    queryKey: [...usersKeys.bySchool(schoolId, params), 'all-pages'] as const,
    queryFn: () => usersService.getAllUsersBySchool(schoolId, params),
    enabled: !!schoolId && enabled,
  });
}

/**
 * Hook for creating a new user
 */
export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateUserRequest) => usersService.createUser(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: usersKeys.lists() });
    },
  });
}

export function useCreateFounder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateFounderRequest) => usersService.createFounder(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: usersKeys.founders() });
      queryClient.invalidateQueries({ queryKey: usersKeys.executives() });
    },
  });
}

export function useUpdateFounder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateFounderRequest }) =>
      usersService.updateFounder(id, data),
    // Optimistic update: the founders board and the executive table show the
    // edit (e.g. a corrected role) instantly, before the server responds. Only
    // the fields that were edited are touched, so the rest of the staff's
    // record is left exactly as it was. Rolled back if the request fails.
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: usersKeys.founders() });
      await queryClient.cancelQueries({ queryKey: usersKeys.executives() });

      const prevFounders = queryClient.getQueryData<FounderProfile[]>(usersKeys.founders());
      const prevExecutives = queryClient.getQueryData<any>(usersKeys.executives());

      let userId: string | undefined;
      queryClient.setQueryData<FounderProfile[]>(usersKeys.founders(), (old) =>
        (old ?? []).map((f) => {
          if (f.id !== id) return f;
          userId = f.user_id;
          return { ...f, ...data } as FounderProfile;
        })
      );

      const userPatch: Record<string, unknown> = {};
      for (const k of ['name', 'email', 'phone', 'whatsapp', 'role'] as const) {
        if (data[k] !== undefined) userPatch[k] = data[k];
      }
      if (userId && Object.keys(userPatch).length) {
        queryClient.setQueryData<any>(usersKeys.executives(), (old: any) => {
          if (!old?.results) return old;
          return {
            ...old,
            results: old.results.map((e: any) => (e.id === userId ? { ...e, ...userPatch } : e)),
          };
        });
      }

      return { prevFounders, prevExecutives };
    },
    onError: (_err, _vars, context) => {
      if (context?.prevFounders) queryClient.setQueryData(usersKeys.founders(), context.prevFounders);
      if (context?.prevExecutives !== undefined)
        queryClient.setQueryData(usersKeys.executives(), context.prevExecutives);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: usersKeys.founders() });
      queryClient.invalidateQueries({ queryKey: usersKeys.executives() });
    },
  });
}

export function useAddFounderShares() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: AddFounderSharesRequest }) =>
      usersService.addFounderShares(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: usersKeys.founders() });
    },
  });
}

export function useDeleteFounder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: string | { id: string; confirmation: { matricule: string; password: string } }) =>
      typeof input === 'string'
        ? usersService.deleteFounder(input)
        : usersService.deleteFounder(input.id, input.confirmation),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: usersKeys.founders() });
      queryClient.invalidateQueries({ queryKey: usersKeys.executives() });
    },
  });
}

export function useRenewFounderShares() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => usersService.renewFounderShares(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: usersKeys.founders() });
    },
  });
}

export function useRemoveShareAdjustment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ founderId, adjustmentId }: { founderId: string; adjustmentId: string }) =>
      usersService.removeShareAdjustment(founderId, adjustmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: usersKeys.founders() });
    },
  });
}

/**
 * Hook for updating user profile
 */
export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProfileRequest }) =>
      usersService.updateProfile(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      queryClient.invalidateQueries({
        queryKey: usersKeys.detail(variables.id),
      });
      queryClient.invalidateQueries({ queryKey: usersKeys.lists() });
    },
  });
}

/**
 * Hook for updating user role
 */
export function useUpdateRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateRoleRequest }) =>
      usersService.updateRole(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: usersKeys.detail(variables.id),
      });
      queryClient.invalidateQueries({ queryKey: usersKeys.lists() });
    },
  });
}

/**
 * Hook for toggling user license
 */
export function useToggleLicense() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ToggleLicenseRequest }) =>
      usersService.toggleLicense(id, data as Record<string, unknown>),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: usersKeys.detail(variables.id),
      });
      queryClient.invalidateQueries({ queryKey: usersKeys.lists() });
    },
  });
}
