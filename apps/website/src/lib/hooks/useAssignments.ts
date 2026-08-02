import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { assignmentsService } from '@/lib/api/services/assignments.service';
import type {
  CreateAssignmentRequest,
  CreateAssignmentSubmissionRequest,
  GradeAssignmentSubmissionRequest,
  ListParams,
} from '@/lib/api/types';

const assignmentKeys = {
  all: ['assignments'] as const,
  lists: () => [...assignmentKeys.all, 'list'] as const,
  list: (params?: ListParams) => [...assignmentKeys.lists(), { ...params }] as const,
  detail: (id: string) => [...assignmentKeys.all, 'detail', id] as const,
  submissions: () => [...assignmentKeys.all, 'submissions'] as const,
  submissionList: (params?: ListParams & { assignment?: string }) =>
    [...assignmentKeys.submissions(), { ...params }] as const,
  mySubmissions: () => [...assignmentKeys.all, 'my-submissions'] as const,
};

export function useAssignments(params?: ListParams) {
  return useQuery({
    queryKey: assignmentKeys.list(params),
    queryFn: () => assignmentsService.getAssignments(params),
  });
}

export function useAssignment(id: string) {
  return useQuery({
    queryKey: assignmentKeys.detail(id),
    queryFn: () => assignmentsService.getAssignment(id),
    enabled: !!id,
  });
}

export function useAssignmentSubmissions(params?: ListParams & { assignment?: string }) {
  return useQuery({
    queryKey: assignmentKeys.submissionList(params),
    queryFn: () => assignmentsService.getSubmissions(params),
    enabled: !!params?.assignment,
  });
}

export function useMyAssignmentSubmissions(params?: ListParams) {
  return useQuery({
    queryKey: [...assignmentKeys.mySubmissions(), { ...params }],
    queryFn: () => assignmentsService.getMySubmissions(params),
  });
}

export function useCreateAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateAssignmentRequest) => assignmentsService.createAssignment(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: assignmentKeys.all });
    },
  });
}

export function useDeleteAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => assignmentsService.deleteAssignment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: assignmentKeys.all });
    },
  });
}

export function useCreateAssignmentSubmission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateAssignmentSubmissionRequest) => assignmentsService.createSubmission(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: assignmentKeys.all });
    },
  });
}

export function useUpdateAssignmentSubmission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CreateAssignmentSubmissionRequest> }) =>
      assignmentsService.updateSubmission(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: assignmentKeys.all });
    },
  });
}

export function useGradeAssignmentSubmission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: GradeAssignmentSubmissionRequest }) =>
      assignmentsService.gradeSubmission(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: assignmentKeys.all });
    },
  });
}
