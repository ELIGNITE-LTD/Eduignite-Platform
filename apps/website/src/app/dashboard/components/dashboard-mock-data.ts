// =====================================================
// Centralized mock data for dashboard views.
// TODO: Replace with real Firestore queries per module.
// =====================================================
// NOTE: DATA_PERIODS is used as axis labels for recharts time-series charts
// and can be retained for this purpose. All other constants should be phased
// out as real API hooks are implemented. See PAGE rewrites in TASKS.md

import { PenTool, FileEdit } from "lucide-react";

/** Chart axis labels - retain for recharts formatting */
export const DATA_PERIODS = {
  weekly: [],
  monthly: [],
  yearly: []
};

/** Chart data - phased out when usePlatformStats hook is implemented */
export const USER_DISTRIBUTION: any[] = [];

/** DEPRECATED: Replace with useStudents() + useAttendanceRecords() hooks */
export const TEACHER_CLASS_DATA: any[] = [];

export const UPCOMING_TASKS: any[] = [];

export const RECENT_GRADES: any[] = [];

export const STUDENT_SUBJECT_PERF: any[] = [];

export const STUDENT_RECENT_RESULTS: any[] = [];

export const STUDENT_TODAY_SCHEDULE: any[] = [];

export const PARENT_CHILDREN_LEDGER: any[] = [];

export const PARENT_RECENT_MARKS: any[] = [];

export const LIBRARIAN_CATEGORY_DATA: any[] = [];

export const LIBRARIAN_RECENT_LOANS: any[] = [];

export const LIBRARIAN_LOW_STOCK: any[] = [];

export const MOCK_BOOKS: any[] = [];

export const MOCK_STUDENTS_LIST: any[] = [];

export const BURSAR_REVENUE_TRENDS: any[] = [];

export const BURSAR_FEE_DISTRIBUTION: any[] = [];

export const BURSAR_RECENT_COLLECTIONS: any[] = [];

export const BURSAR_CLASS_REVENUE: any[] = [];

export const ADMIN_CLASS_SUMMARY: any[] = [];

export const ADMIN_GOVERNANCE_LOGS: any[] = [];
