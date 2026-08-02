import { apiClient } from '../client';
import { API } from '../endpoints';
import {
  AttendanceSession,
  AttendanceRecord,
  AttendanceSummary,
  PaginatedResponse,
  ListParams,
} from '../types';

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
};
