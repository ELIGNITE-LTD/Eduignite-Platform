import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { authService } from '@/lib/api/services/auth.service';
import type {
  LoginRequest,
  LogoutRequest,
  ChangePasswordRequest,
  ActivateAccountRequest,
  User,
} from '@/lib/api/types';
import { getAccessToken, setTokens, clearTokens } from '@/lib/auth';

// Query Key Factory
const authKeys = {
  all: ['auth'] as const,
  me: () => [...authKeys.all, 'me'] as const,
};

/**
 * Hook for user login
 * Stores tokens, sets user in localStorage, and navigates on success
 */
export function useLogin() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: LoginRequest) => authService.login(data),
    onSuccess: (data) => {
      // Store tokens
      if (data.access_token && data.refresh_token) {
        setTokens({
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
        });
      }

      // Set user in cache
      if (data.user) {
        queryClient.setQueryData(authKeys.me(), data.user);
        localStorage.setItem('user', JSON.stringify(data.user));
      }

      // Navigate to dashboard
      router.push('/dashboard');
    },
  });
}

/**
 * Hook for user logout
 * Clears tokens and redirects to login page
 */
export function useLogout() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data?: LogoutRequest) => authService.logout(data),
    onSuccess: () => {
      // Clear tokens
      clearTokens();

      // Clear auth from cache
      queryClient.removeQueries({ queryKey: authKeys.all });

      // Clear localStorage
      localStorage.removeItem('user');

      // Redirect to login
      router.push('/login');
    },
  });
}

/**
 * Hook for fetching current user profile
 */
export function useMe() {
  return useQuery({
    queryKey: authKeys.me(),
    queryFn: () => authService.getMe(),
    enabled: !!getAccessToken(),
  });
}

/**
 * Hook for changing user password
 */
export function useChangePassword() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ChangePasswordRequest) =>
      authService.changePassword(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: authKeys.me() });
    },
  });
}

/**
 * Hook for activating user account
 */
export function useActivateAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ActivateAccountRequest) =>
      authService.activateAccount(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: authKeys.me() });
    },
  });
}
