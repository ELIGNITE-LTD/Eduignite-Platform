import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { nurseryService } from '@/lib/api/services/nursery.service';
import type { AssessmentAreaInput, AssessmentRatingBulkRequest, TermCommentsRequest } from '@/lib/api/types';

const nurseryKeys = {
  all: ['nursery'] as const,
  areas: () => [...nurseryKeys.all, 'areas'] as const,
  ratings: (params: { class_id?: string; academic_year?: string; term?: number }) =>
    [...nurseryKeys.all, 'ratings', { ...params }] as const,
};

/** Developmental areas of the school (teachers only get the active ones). */
export function useAssessmentAreas(enabled = true) {
  return useQuery({
    queryKey: nurseryKeys.areas(),
    queryFn: () => nurseryService.listAreas(),
    enabled,
  });
}

export function useCreateAssessmentArea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: AssessmentAreaInput) => nurseryService.createArea(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: nurseryKeys.areas() }),
  });
}

export function useUpdateAssessmentArea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: AssessmentAreaInput }) => nurseryService.updateArea(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: nurseryKeys.areas() }),
  });
}

export function useDeleteAssessmentArea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => nurseryService.deleteArea(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: nurseryKeys.areas() }),
  });
}

export function useAssessmentRatings(params: { class_id?: string; academic_year?: string; term?: number }, enabled = true) {
  return useQuery({
    queryKey: nurseryKeys.ratings(params),
    queryFn: () => nurseryService.listRatings(params),
    enabled: enabled && Boolean(params.class_id && params.academic_year && params.term),
  });
}

export function useSaveAssessmentRatings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: AssessmentRatingBulkRequest) => nurseryService.bulkSave(data),
    onSuccess: (result) => {
      if (!result.queued) queryClient.invalidateQueries({ queryKey: [...nurseryKeys.all, 'ratings'] });
    },
  });
}

export function useTermComments(params: { class_id: string; academic_year: string; term: number }, enabled = true) {
  return useQuery({
    queryKey: [...nurseryKeys.all, 'comments', { ...params }],
    queryFn: () => nurseryService.listComments(params),
    enabled: enabled && Boolean(params.class_id && params.academic_year && params.term),
  });
}

export function useSaveTermComments() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: TermCommentsRequest) => nurseryService.saveComments(data),
    onSuccess: (result) => {
      if (!result.queued) queryClient.invalidateQueries({ queryKey: [...nurseryKeys.all, 'comments'] });
    },
  });
}
