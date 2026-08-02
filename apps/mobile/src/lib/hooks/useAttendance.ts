import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback } from 'react';
import { attendanceService } from '@/lib/api/services/attendance.service';
import type {
  AttendanceSession,
  AttendanceRecord,
  AttendanceSummary,
  AttendanceReport,
  BulkRecordAttendanceRequest,
  CreateAttendanceSessionRequest,
  RecordTeacherAttendanceRequest,
  PaginationParams,
} from '@/lib/api/types';

// Query Key Factory
const attendanceKeys = {
  all: ['attendance'] as const,
  sessions: () => [...attendanceKeys.all, 'sessions'] as const,
  sessionsList: (params?: PaginationParams) =>
    [...attendanceKeys.sessions(), { ...params }] as const,
  records: () => [...attendanceKeys.all, 'records'] as const,
  recordsList: (params?: PaginationParams) =>
    [...attendanceKeys.records(), { ...params }] as const,
  summary: (params?: PaginationParams) =>
    [...attendanceKeys.all, 'summary', { ...params }] as const,
  my: () => [...attendanceKeys.all, 'my'] as const,
  studentSummary: (studentId: string) =>
    [...attendanceKeys.all, 'student', studentId] as const,
  classReport: (
    className: string,
    startDate?: string,
    endDate?: string
  ) => [...attendanceKeys.all, 'class', className, startDate, endDate] as const,
  absentToday: () => [...attendanceKeys.all, 'absent-today'] as const,
  teacher: (params?: PaginationParams) =>
    [...attendanceKeys.all, 'teacher', { ...params }] as const,
};

/**
 * Hook for fetching attendance sessions
 */
export function useAttendanceSessions(params?: PaginationParams) {
  return useQuery({
    queryKey: attendanceKeys.sessionsList(params),
    queryFn: () => attendanceService.getAttendanceSessions(params),
  });
}

/**
 * Hook for fetching attendance records
 */
export function useAttendanceRecords(params?: PaginationParams) {
  return useQuery({
    queryKey: attendanceKeys.recordsList(params),
    queryFn: () => attendanceService.getAttendanceRecords(params),
  });
}

export function useAttendanceSummary(params?: PaginationParams) {
  return useQuery({
    queryKey: attendanceKeys.summary(params),
    queryFn: () => attendanceService.getAttendanceSummary(params),
  });
}

/**
 * Hook for fetching current user's attendance
 */
export function useMyAttendance() {
  return useQuery({
    queryKey: attendanceKeys.my(),
    queryFn: () => attendanceService.getMyAttendance(),
  });
}

/**
 * Hook for fetching student attendance summary
 */
export function useStudentAttendanceSummary(studentId: string) {
  return useQuery({
    queryKey: attendanceKeys.studentSummary(studentId),
    queryFn: () => attendanceService.getStudentAttendanceSummary(studentId),
    enabled: !!studentId,
  });
}

/**
 * Hook for fetching class attendance report
 */
export function useClassAttendanceReport(
  className: string,
  startDate?: string,
  endDate?: string
) {
  return useQuery({
    queryKey: attendanceKeys.classReport(className, startDate, endDate),
    queryFn: () =>
      attendanceService.getClassAttendanceReport(className, startDate, endDate),
    enabled: !!className,
  });
}

/**
 * Hook for fetching students absent today
 */
export function useAbsentToday() {
  return useQuery({
    queryKey: attendanceKeys.absentToday(),
    queryFn: () => attendanceService.getAbsentToday(),
  });
}

/**
 * Hook for fetching teacher attendance
 */
export function useTeacherAttendance(params?: PaginationParams) {
  return useQuery({
    queryKey: attendanceKeys.teacher(params),
    queryFn: () => attendanceService.getTeacherAttendance(params),
  });
}

/**
 * Hook for bulk recording attendance
 */
export function useBulkRecordAttendance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: BulkRecordAttendanceRequest) =>
      attendanceService.bulkRecordAttendance(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: attendanceKeys.recordsList() });
      queryClient.invalidateQueries({ queryKey: attendanceKeys.absentToday() });
    },
  });
}

/**
 * Hook for creating an attendance session
 */
export function useCreateAttendanceSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateAttendanceSessionRequest) =>
      attendanceService.createAttendanceSession(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: attendanceKeys.sessionsList() });
    },
  });
}

/**
 * Hook for recording teacher attendance
 */
export function useRecordTeacherAttendance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: RecordTeacherAttendanceRequest) =>
      attendanceService.recordTeacherAttendance(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: attendanceKeys.teacher() });
      queryClient.invalidateQueries({ queryKey: attendanceKeys.my() });
    },
  });
}
