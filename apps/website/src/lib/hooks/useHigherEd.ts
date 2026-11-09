import { useMutation, useQuery } from '@tanstack/react-query';
import { higherEdService, higherEdStructureService, type UnitType } from '@/lib/api/services/higher-ed.service';

export const higherEdKeys = {
  all: ['higher-ed'] as const,
  setupStatus: () => [...higherEdKeys.all, 'setup-status'] as const,
};

/** Setup progress of the signed-in higher-education institution. Tolerates a missing backend (404). */
export function useHigherSetupStatus() {
  return useQuery({
    queryKey: higherEdKeys.setupStatus(),
    queryFn: () => higherEdService.setupStatus(),
    staleTime: 30_000,
    retry: 1,
  });
}

// ---------------------------------------------------------------------------
// Structure: departments, programmes, calendar, grading.
// Keys start with "higher-ed" so lib/api/invalidation.ts refreshes them all
// after any write to /higher-ed/ (apiClient calls invalidateAfterWrite).
// ---------------------------------------------------------------------------

export function useHigherUnits(unitType?: UnitType) {
  return useQuery({
    queryKey: [...higherEdKeys.all, 'units', unitType ?? 'all'],
    queryFn: () => higherEdStructureService.listUnits(unitType),
  });
}

export function useHigherProgrammes() {
  return useQuery({ queryKey: [...higherEdKeys.all, 'programmes'], queryFn: () => higherEdStructureService.listProgrammes() });
}

export function useHigherAcademicYears() {
  return useQuery({ queryKey: [...higherEdKeys.all, 'academic-years'], queryFn: () => higherEdStructureService.listAcademicYears() });
}

export function useHigherAcademicPeriods() {
  return useQuery({ queryKey: [...higherEdKeys.all, 'academic-periods'], queryFn: () => higherEdStructureService.listAcademicPeriods() });
}

export function useGradingPresets() {
  return useQuery({
    queryKey: [...higherEdKeys.all, 'grading-presets'],
    queryFn: () => higherEdStructureService.gradingPresets(),
    staleTime: 5 * 60_000,
  });
}

export function useGradingPolicy() {
  return useQuery({ queryKey: [...higherEdKeys.all, 'grading-policy'], queryFn: () => higherEdStructureService.gradingPolicy() });
}

/** One mutation hook for every write; cache invalidation happens in the API client. */
export function useHigherWrite<TArgs, TResult = unknown>(fn: (args: TArgs) => Promise<TResult>) {
  return useMutation({ mutationFn: fn });
}

export const higherWrites = higherEdStructureService;
