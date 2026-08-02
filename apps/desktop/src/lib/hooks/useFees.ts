import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback } from 'react';
import { feesService } from '@/lib/api/services/fees.service';
import type {
  FeeStructure,
  Payment,
  RevenueReport,
  Receipt,
  CreateFeeStructureRequest,
  CreatePaymentRequest,
  ConfirmPaymentRequest,
  RejectPaymentRequest,
  PaginationParams,
  PaginatedResponse,
  SchoolFeeAssignment,
  StudentSchoolFeeRecord,
  SchoolFeeSummary,
  CreateSchoolFeeAssignmentRequest,
  UpdateStudentSchoolFeeRecordRequest,
} from '@/lib/api/types';

// Query Key Factory
const feesKeys = {
  all: ['fees'] as const,
  structures: () => [...feesKeys.all, 'structures'] as const,
  structuresList: (params?: PaginationParams) =>
    [...feesKeys.structures(), { ...params }] as const,
  payments: () => [...feesKeys.all, 'payments'] as const,
  paymentsList: (params?: PaginationParams) =>
    [...feesKeys.payments(), { ...params }] as const,
  my: () => [...feesKeys.all, 'my'] as const,
  revenue: (params?: PaginationParams) =>
    [...feesKeys.all, 'revenue', { ...params }] as const,
  outstanding: () => [...feesKeys.all, 'outstanding'] as const,
  receipt: (id: string) => [...feesKeys.all, 'receipt', id] as const,
  schoolFeeAssignments: (params?: PaginationParams) =>
    [...feesKeys.all, 'school-fee-assignments', { ...params }] as const,
  studentSchoolFees: (params?: PaginationParams) =>
    [...feesKeys.all, 'student-school-fees', { ...params }] as const,
  schoolFeeSummary: (params?: PaginationParams) =>
    [...feesKeys.all, 'school-fee-summary', { ...params }] as const,
};

/**
 * Hook for fetching fee structures
 */
export function useFeeStructures(params?: PaginationParams) {
  return useQuery({
    queryKey: feesKeys.structuresList(params),
    queryFn: () => feesService.getFeeStructures(params),
  });
}

/**
 * Hook for fetching paginated payments
 */
export function usePayments(params?: PaginationParams) {
  return useQuery({
    queryKey: feesKeys.paymentsList(params),
    queryFn: () => feesService.getPayments(params),
  });
}

/**
 * Hook for fetching current user's payments
 */
export function useMyPayments() {
  return useQuery({
    queryKey: feesKeys.my(),
    queryFn: () => feesService.getMyPayments(),
  });
}

/**
 * Hook for fetching revenue report
 */
export function useRevenueReport(params?: PaginationParams) {
  return useQuery({
    queryKey: feesKeys.revenue(params),
    queryFn: () => feesService.getRevenueReport(params),
  });
}

/**
 * Hook for fetching outstanding fees
 */
export function useOutstandingFees() {
  return useQuery({
    queryKey: feesKeys.outstanding(),
    queryFn: () => feesService.getOutstandingFees(),
  });
}

/**
 * Hook for fetching a receipt
 * Enabled only when id is provided
 */
export function useReceipt(id: string) {
  return useQuery({
    queryKey: feesKeys.receipt(id),
    queryFn: () => feesService.getReceipt(id),
    enabled: !!id,
  });
}

export function useSchoolFeeAssignments(params?: PaginationParams, enabled = true) {
  return useQuery<PaginatedResponse<SchoolFeeAssignment>>({
    queryKey: feesKeys.schoolFeeAssignments(params),
    queryFn: () => feesService.getSchoolFeeAssignments(params),
    enabled,
  });
}

export function useStudentSchoolFees(params?: PaginationParams, enabled = true) {
  return useQuery<PaginatedResponse<StudentSchoolFeeRecord>>({
    queryKey: feesKeys.studentSchoolFees(params),
    queryFn: () => feesService.getStudentSchoolFees(params),
    enabled,
  });
}

export function useSchoolFeeSummary(params?: PaginationParams, enabled = true) {
  return useQuery<SchoolFeeSummary>({
    queryKey: feesKeys.schoolFeeSummary(params),
    queryFn: () => feesService.getSchoolFeeSummary(params),
    enabled,
  });
}

/**
 * Hook for creating a fee structure
 */
export function useCreateFeeStructure() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateFeeStructureRequest) =>
      feesService.createFeeStructure(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: feesKeys.structures() });
      queryClient.invalidateQueries({ queryKey: [...feesKeys.all, 'school-fee-summary'] });
      queryClient.invalidateQueries({ queryKey: feesKeys.paymentsList() });
    },
  });
}

/**
 * Hook for creating a payment
 */
export function useCreatePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreatePaymentRequest) =>
      feesService.createPayment(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: feesKeys.paymentsList() });
      queryClient.invalidateQueries({ queryKey: feesKeys.my() });
      queryClient.invalidateQueries({ queryKey: feesKeys.revenue() });
      queryClient.invalidateQueries({ queryKey: feesKeys.outstanding() });
    },
  });
}

export function useCreateSchoolFeeAssignment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateSchoolFeeAssignmentRequest) =>
      feesService.createSchoolFeeAssignment(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...feesKeys.all, 'school-fee-assignments'] });
      queryClient.invalidateQueries({ queryKey: [...feesKeys.all, 'student-school-fees'] });
      queryClient.invalidateQueries({ queryKey: [...feesKeys.all, 'school-fee-summary'] });
    },
  });
}

export function useUpdateSchoolFeeAssignment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateSchoolFeeAssignmentRequest> }) =>
      feesService.updateSchoolFeeAssignment(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...feesKeys.all, 'school-fee-assignments'] });
      queryClient.invalidateQueries({ queryKey: [...feesKeys.all, 'student-school-fees'] });
      queryClient.invalidateQueries({ queryKey: [...feesKeys.all, 'school-fee-summary'] });
    },
  });
}

export function useUpdateStudentSchoolFeeRecord() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateStudentSchoolFeeRecordRequest }) =>
      feesService.updateStudentSchoolFeeRecord(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...feesKeys.all, 'student-school-fees'] });
      queryClient.invalidateQueries({ queryKey: [...feesKeys.all, 'school-fee-summary'] });
    },
  });
}

/**
 * Hook for confirming a payment
 */
export function useConfirmPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ConfirmPaymentRequest) =>
      feesService.confirmPayment(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: feesKeys.paymentsList() });
      queryClient.invalidateQueries({ queryKey: feesKeys.revenue() });
    },
  });
}

/**
 * Hook for rejecting a payment
 */
export function useRejectPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: RejectPaymentRequest) =>
      feesService.rejectPayment(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: feesKeys.paymentsList() });
    },
  });
}
