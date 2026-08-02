import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { registryService } from '@/lib/api/services/registry';

export const registryKeys = {
  all: ['registry'] as const,
  myApps: () => [...registryKeys.all, 'my-apps'] as const,
  catalogue: () => [...registryKeys.all, 'catalogue'] as const,
  schoolApps: (schoolId: string) => [...registryKeys.all, 'school', schoolId] as const,
  builds: () => [...registryKeys.all, 'builds'] as const,
};

/**
 * The apps this user's school has.
 *
 * Held for a long time on purpose: entitlements change only when a founder
 * installs or removes something, and this is fetched on every dashboard load,
 * including over slow mobile connections.
 */
export function useMyApps() {
  return useQuery({
    queryKey: registryKeys.myApps(),
    queryFn: () => registryService.myApps(),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}

export function useAppCatalogue(enabled = true) {
  return useQuery({
    queryKey: registryKeys.catalogue(),
    queryFn: () => registryService.catalogue(),
    enabled,
    staleTime: 10 * 60 * 1000,
  });
}

export function useSchoolApps(schoolId: string) {
  return useQuery({
    queryKey: registryKeys.schoolApps(schoolId),
    queryFn: () => registryService.schoolApps(schoolId),
    enabled: !!schoolId,
  });
}

/** Install, uninstall or re-date a licence, then refresh what the console shows. */
export function useUpdateSchoolApp(schoolId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      app_key: string;
      action: 'install' | 'uninstall' | 'set_expiry';
      licence_expiry?: string | null;
      note?: string;
    }) => registryService.updateSchoolApp(schoolId, body),
    onSuccess: (data) => {
      queryClient.setQueryData(registryKeys.schoolApps(schoolId), data);
      // A founder may be changing their own school, so their navigation
      // could be about to gain or lose entries.
      queryClient.invalidateQueries({ queryKey: registryKeys.myApps() });
    },
  });
}

// ---- Developer Console: uploaded builds -------------------------------------

export function useAppBuilds(enabled = true) {
  return useQuery({
    queryKey: registryKeys.builds(),
    queryFn: () => registryService.builds(),
    enabled,
    staleTime: 30 * 1000,
  });
}

export function useUploadBuild() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => registryService.uploadBuild(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: registryKeys.builds() });
    },
  });
}

/** Set an app's pricing. Editable anytime, no rebuild. */
export function useSetPricing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ appKey, pricing }: { appKey: string; pricing: import('@/lib/api/services/registry').AppPricing }) =>
      registryService.setPricing(appKey, pricing),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: registryKeys.builds() });
    },
  });
}

/** Advance a build. A publish or pull can change what every school sees. */
export function useBuildAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      buildId,
      action,
      note,
    }: {
      buildId: string;
      action: 'submit' | 'approve' | 'reject' | 'publish' | 'pull';
      note?: string;
    }) => registryService.buildAction(buildId, action, note),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: registryKeys.builds() });
      if (variables.action === 'publish' || variables.action === 'pull') {
        queryClient.invalidateQueries({ queryKey: registryKeys.catalogue() });
        queryClient.invalidateQueries({ queryKey: registryKeys.myApps() });
      }
    },
  });
}
