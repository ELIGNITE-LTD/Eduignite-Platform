'use client';

import { useQuery } from '@tanstack/react-query';
import { configService, CameroonConfig, SchoolConfig } from '../api/services/config.service';

/**
 * Hook to fetch static Cameroonian education system config.
 * Cached indefinitely — this data never changes at runtime.
 */
export function useCameroonConfig() {
  return useQuery<CameroonConfig>({
    queryKey: ['cameroon-config'],
    queryFn: () => configService.getCameroonConfig(),
    staleTime: Infinity, // never re-fetch — static data
    gcTime: Infinity,
  });
}

/**
 * Hook to fetch live school-scoped dropdown data.
 * Re-fetches when the school changes.
 */
export function useSchoolConfig(schoolId?: string) {
  return useQuery<SchoolConfig>({
    queryKey: ['school-config', schoolId],
    queryFn: () => configService.getSchoolConfig(schoolId),
    staleTime: 30 * 1000, // 30 seconds
    enabled: true,
  });
}

/**
 * Hook that returns divisions for a selected region.
 * Derived from useCameroonConfig — no extra network call.
 */
export function useRegionDivisions(regionName: string | undefined) {
  const { data: config } = useCameroonConfig();
  if (!config || !regionName) return [];
  return configService.getDivisions(config, regionName);
}

/**
 * Hook that returns class levels for a given subsystem + school type.
 */
export function useClassLevels(
  subsystem?: 'francophone' | 'anglophone' | 'bilingual',
  schoolType?: 'general' | 'technical' | 'mixed'
) {
  const { data: config } = useCameroonConfig();
  if (!config || !subsystem || !schoolType) return [];
  return configService.getClassLevels(config, subsystem, schoolType);
}

/**
 * Hook that returns subjects for a given subsystem and optional specialisation.
 */
export function useSubjects(
  subsystem?: 'francophone' | 'anglophone',
  specialisation?: string
) {
  const { data: config } = useCameroonConfig();
  if (!config || !subsystem) return [];
  return configService.getSubjects(config, subsystem, specialisation);
}
