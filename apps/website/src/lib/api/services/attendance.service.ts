import { apiClient } from '../client';
import { API } from '../endpoints';
import {
  AttendanceSession,
  AttendanceRecord,
  AttendanceSummary,
  PaginatedResponse,
  ListParams,
  DailyRoster,
  DailyRegisterSubmission,
  DailyRegisterResult,
  MyTeachingClass,
} from '../types';
import type { AttendanceHistoryOptions, AttendanceHistoryReport } from '@/lib/attendance-history-pdf';

const DEVICE_ID_KEY = 'eduignite_device_id';

function deviceToken(): string {
  const fresh = () => Math.random().toString(36).slice(2, 10).padEnd(8, '0');
  if (typeof window === 'undefined') return fresh();
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = fresh();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id.slice(0, 8);
  } catch {
    return 'nostore0';
  }
}

/**
 * Stable reference for one device's register of one class on one date.
 * Derived, not random, so a retry, a second tap or an offline resubmit of the
 * same register always carries the same reference and the server updates the
 * one register instead of making another. 59 characters; the server keeps 64.
 */
export function dailyRegisterClientRef(schoolClassId: string, date: string): string {
  return `dr:${deviceToken()}:${schoolClassId}:${date}`.slice(0, 64);
}

export const attendanceService = {
  async getAttendanceSessions(params?: ListParams): Promise<PaginatedResponse<AttendanceSession>> {
    const { data } = await apiClient.get(API.ATTENDANCE.SESSIONS, { params });
    return data;
  },

  async createSession(sessionData: Partial<AttendanceSession>): Promise<AttendanceSession> {
    const { data } = await apiClient.post(API.ATTENDANCE.SESSIONS, sessionData);
    return data;
  },

  async updateSession(id: string, sessionData: Partial<AttendanceSession>): Promise<AttendanceSession> {
    const { data } = await apiClient.patch(API.ATTENDANCE.SESSION_DETAIL(id), sessionData);
    return data;
  },

  async getAttendanceRecords(params?: ListParams): Promise<PaginatedResponse<AttendanceRecord>> {
    const { data } = await apiClient.get(API.ATTENDANCE.RECORDS, { params });
    return data;
  },

  async createAttendanceRecord(recordData: Partial<AttendanceRecord>): Promise<AttendanceRecord> {
    const { data } = await apiClient.post(API.ATTENDANCE.RECORDS, recordData);
    return data;
  },

  async updateAttendanceRecord(
    id: string,
    recordData: Partial<AttendanceRecord>
  ): Promise<AttendanceRecord> {
    const { data } = await apiClient.patch(API.ATTENDANCE.RECORD_DETAIL(id), recordData);
    return data;
  },

  async bulkRecordAttendance(
    sessionIdOrPayload:
      | string
      | {
          sessionId: string;
          student_class?: string;
          date?: string;
          period?: string;
          subject?: string;
          records: Array<{
            student: string;
            status: 'Present' | 'Absent' | 'Late' | 'Excused';
            excuse_note?: string;
          }>;
        },
    records?: Array<{
      student: string;
      status: 'Present' | 'Absent' | 'Late' | 'Excused';
      excuse_note?: string;
    }>
  ): Promise<AttendanceRecord[]> {
    const payload =
      typeof sessionIdOrPayload === 'string'
        ? { session: sessionIdOrPayload, records }
        : {
            session: sessionIdOrPayload.sessionId,
            student_class: sessionIdOrPayload.student_class,
            date: sessionIdOrPayload.date,
            period: sessionIdOrPayload.period,
            subject: sessionIdOrPayload.subject,
            records: sessionIdOrPayload.records,
          };
    const { data } = await apiClient.post(API.ATTENDANCE.BULK_RECORD, {
      ...payload,
    });
    return data;
  },

  async getMyAttendance(params?: ListParams): Promise<PaginatedResponse<AttendanceRecord>> {
    const { data } = await apiClient.get(API.ATTENDANCE.MY_ATTENDANCE, { params });
    return data;
  },

  async getStudentSummary(studentId: string): Promise<AttendanceSummary> {
    const { data } = await apiClient.get(API.ATTENDANCE.STUDENT_SUMMARY(studentId));
    return data;
  },

  async getAttendanceSummary(params?: ListParams): Promise<AttendanceSummary & {
    total_records?: number;
    sessions_count?: number;
    students_tracked?: number;
    today_absent?: number;
    today_total?: number;
    class_summary?: Array<{
      class_id?: string | null;
      class_name: string;
      total: number;
      present: number;
      late: number;
      absent: number;
      excused: number;
      attendance_percentage: number;
    }>;
  }> {
    const { data } = await apiClient.get(API.ATTENDANCE.SUMMARY, { params });
    return data;
  },

  async getStudentAttendanceSummary(studentId: string): Promise<AttendanceSummary> {
    return this.getStudentSummary(studentId);
  },

  async getClassReport(
    className: string,
    startDate?: string,
    endDate?: string
  ): Promise<any> {
    const { data } = await apiClient.get(API.ATTENDANCE.CLASS_REPORT(className), {
      params: { start_date: startDate, end_date: endDate },
    });
    return data;
  },

  async getClassAttendanceReport(
    className: string,
    startDate?: string,
    endDate?: string
  ): Promise<any> {
    return this.getClassReport(className, startDate, endDate);
  },

  async getAbsentToday(): Promise<any[]> {
    const { data } = await apiClient.get(API.ATTENDANCE.ABSENT_TODAY);
    return data;
  },

  async getTeacherAttendance(params?: ListParams): Promise<PaginatedResponse<any>> {
    const { data } = await apiClient.get(API.ATTENDANCE.TEACHER_ATTENDANCE, { params });
    return data;
  },

  async recordTeacherAttendance(recordData: {
    date: string;
    status: 'Present' | 'Absent' | 'Late';
    note?: string;
  }): Promise<any> {
    const { data } = await apiClient.post(API.ATTENDANCE.TEACHER_ATTENDANCE, recordData);
    return data;
  },

  async createAttendanceSession(sessionData: Partial<AttendanceSession>): Promise<AttendanceSession> {
    return this.createSession(sessionData);
  },

  /** Filters this user may use for the attendance history PDF. */
  async getHistoryReportOptions(): Promise<AttendanceHistoryOptions> {
    const { data } = await apiClient.get(API.ATTENDANCE.HISTORY_REPORT_OPTIONS);
    return data;
  },

  /** Attendance history for the PDF; the server scopes it to this user. */
  async getHistoryReport(params: Record<string, string>): Promise<AttendanceHistoryReport> {
    const { data } = await apiClient.get(API.ATTENDANCE.HISTORY_REPORT, { params });
    return data;
  },

  /**
   * The class roster for a date with any marks already taken. Goes through
   * apiClient, so when the device is offline the interceptor serves the last
   * cached copy (flagged fromCache).
   */
  async getDailyRoster(schoolClassId: string, date: string): Promise<DailyRoster> {
    const response = await apiClient.get(API.ATTENDANCE.DAILY, {
      params: { school_class: schoolClassId, date },
    });
    return {
      ...response.data,
      fromCache: String(response.statusText || '').includes('offline cache'),
    };
  },

  /**
   * Submit (or correct) the daily register of a class. Offline, the apiClient
   * interceptor queues this POST in the outbox with the body, including the
   * client_ref, unchanged, and answers 202; the replay therefore carries the
   * same client_ref and the server treats it as the same register.
   */
  async submitDailyRegister(submission: DailyRegisterSubmission): Promise<DailyRegisterResult> {
    const client_ref = dailyRegisterClientRef(submission.school_class, submission.date);
    const response = await apiClient.post(API.ATTENDANCE.DAILY, { ...submission, client_ref });
    const queued = response.status === 202 || Boolean(response.data?._offlineQueued);
    return {
      queued,
      created: response.status === 201,
      client_ref,
      session: queued ? undefined : response.data?.session,
      records: queued ? undefined : response.data?.records,
    };
  },

  /** Classes a basic-school teacher teaches as a whole class (empty elsewhere). */
  async getMyTeachingClasses(): Promise<MyTeachingClass[]> {
    const { data } = await apiClient.get(API.ATTENDANCE.MY_TEACHING_CLASSES);
    return Array.isArray(data?.classes) ? data.classes : [];
  },
};
