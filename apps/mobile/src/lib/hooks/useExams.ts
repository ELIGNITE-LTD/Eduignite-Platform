import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { examsService } from '@/lib/api/services/exams.service';
import type { CreateExamRequest, CreateExamSubmissionRequest, ListParams } from '@/lib/api/types';

const examKeys = {
  all: ['exams'] as const,
  lists: () => [...examKeys.all, 'list'] as const,
  list: (params?: ListParams & { mode?: string }) => [...examKeys.lists(), { ...params }] as const,
  active: () => [...examKeys.all, 'active'] as const,
  detail: (id: string) => [...examKeys.all, 'detail', id] as const,
  submissions: () => [...examKeys.all, 'submissions'] as const,
  submissionList: (params?: ListParams & { exam?: string }) => [...examKeys.submissions(), { ...params }] as const,
  submissionDetail: (id: string) => [...examKeys.submissions(), 'detail', id] as const,
  myResults: (params?: ListParams) => [...examKeys.submissions(), 'my-results', { ...params }] as const,
};

export function useExams(params?: ListParams & { mode?: string }) {
  return useQuery({
    queryKey: examKeys.list(params),
    queryFn: () => examsService.getExams(params),
  });
}

export function useActiveExams() {
  return useQuery({
    queryKey: examKeys.active(),
    queryFn: () => examsService.getActiveExams(),
  });
}

export function useExam(id: string) {
  return useQuery({
    queryKey: examKeys.detail(id),
    queryFn: () => examsService.getExam(id),
    enabled: !!id,
  });
}

export function useCreateExam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateExamRequest) => examsService.createExam(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: examKeys.all });
    },
  });
}

export function useDeleteExam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => examsService.deleteExam(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: examKeys.all });
    },
  });
}

export function useExamSubmissions(params?: ListParams & { exam?: string }) {
  return useQuery({
    queryKey: examKeys.submissionList(params),
    queryFn: () => examsService.getSubmissions(params),
  });
}

export function useExamSubmission(id: string) {
  return useQuery({
    queryKey: examKeys.submissionDetail(id),
    queryFn: () => examsService.getSubmission(id),
    enabled: !!id,
  });
}

export function useMyExamResults(params?: ListParams) {
  return useQuery({
    queryKey: examKeys.myResults(params),
    queryFn: () => examsService.getMyResults(params),
  });
}

export function useCreateExamSubmission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateExamSubmissionRequest) => examsService.createSubmission(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: examKeys.all });
      qc.invalidateQueries({ queryKey: examKeys.submissions() });
    },
  });
}
