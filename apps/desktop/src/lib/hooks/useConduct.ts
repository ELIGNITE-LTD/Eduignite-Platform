import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { conductService, type ConductKind } from '@/lib/api/services/conduct.service';

const conductKey = ['conduct'] as const;

export function useConductEntries(params: { student?: string; class_id?: string }, enabled = true) {
  return useQuery({
    queryKey: [...conductKey, 'list', { ...params }],
    queryFn: () => conductService.list(params),
    enabled: enabled && Boolean(params.student || params.class_id),
  });
}

export function useConductCounts(classId: string, enabled = true) {
  return useQuery({
    queryKey: [...conductKey, 'counts', classId],
    queryFn: () => conductService.counts({ class_id: classId }),
    enabled: enabled && Boolean(classId),
  });
}

export function useAddConduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { student: string; kind: ConductKind; note?: string; date?: string }) => conductService.add(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: conductKey }),
  });
}

export function useLateToday() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (student: string) => conductService.lateToday(student),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: conductKey }),
  });
}

export function useDeleteConduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => conductService.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: conductKey }),
  });
}
