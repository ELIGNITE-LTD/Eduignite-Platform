import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { aiCreditsService } from '@/lib/api/services/ai-credits.service';
import { CREDITS_CHANGED_EVENT, type CreditBalance } from '@/lib/ai-credits';
import { useAuth } from '@/lib/auth-context';

export const aiCreditKeys = {
  all: ['ai-credits'] as const,
  balance: () => [...aiCreditKeys.all, 'balance'] as const,
  history: (page: number, kind: string) => [...aiCreditKeys.all, 'history', page, kind] as const,
  usage: (days: number) => [...aiCreditKeys.all, 'usage', days] as const,
};

/**
 * The signed-in person's AI credits, kept current.
 *
 * Re-read whenever AI work finishes or credits are bought anywhere in the
 * app, so the number on screen is never the one from before the last answer.
 */
export function useAiCreditBalance() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: aiCreditKeys.all });
    };
    window.addEventListener(CREDITS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(CREDITS_CHANGED_EVENT, refresh);
  }, [queryClient]);

  return useQuery<CreditBalance>({
    queryKey: aiCreditKeys.balance(),
    queryFn: () => aiCreditsService.getBalance(),
    enabled: Boolean(user?.id),
    staleTime: 60_000,
    // A new day brings new free credits; pick them up without a reload.
    refetchInterval: 5 * 60_000,
    retry: 1,
  });
}

/** Put a balance the server just sent straight on screen, without a round trip. */
export function useSetAiCreditBalance() {
  const queryClient = useQueryClient();
  return (balance: CreditBalance | undefined | null) => {
    if (balance) queryClient.setQueryData(aiCreditKeys.balance(), balance);
  };
}
