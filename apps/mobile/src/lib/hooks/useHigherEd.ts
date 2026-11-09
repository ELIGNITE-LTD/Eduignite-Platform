import { useQuery } from '@tanstack/react-query';
import { higherEdService } from '@/lib/api/services/higher-ed.service';

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
