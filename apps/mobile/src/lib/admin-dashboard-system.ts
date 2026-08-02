/**
 * Unified Admin Dashboard System
 * Comprehensive analytics, KPIs, and actionable insights for school administrators
 */

export interface DashboardKPI {
  id: string;
  label: string;
  value: number | string;
  trend?: "up" | "down" | "stable";
  trendPercentage?: number;
  icon: string;
  color: "primary" | "secondary" | "accent" | "success" | "warning" | "error";
  targetValue?: number;
  unit?: string;
}

export interface DashboardMetric {
  id: string;
  name: string;
  value: number;
  percentage: number;
  target: number;
  status: "on-track" | "at-risk" | "critical";
  description: string;
}

export interface DashboardAlert {
  id: string;
  type: "info" | "warning" | "error" | "success";
  title: string;
  message: string;
  actionUrl?: string;
  actionLabel?: string;
  createdAt: Date;
  dismissed: boolean;
}

export interface DashboardWidget {
  id: string;
  title: string;
  type: "kpi" | "chart" | "table" | "alert" | "list";
  position: number;
  size: "small" | "medium" | "large";
  enabled: boolean;
  refreshInterval?: number; // in seconds
}

export interface AdminDashboardConfig {
  userId: string;
  schoolId: string;
  widgets: DashboardWidget[];
  theme: "light" | "dark";
  autoRefresh: boolean;
  refreshInterval: number; // in seconds
  lastUpdated: Date;
}

// ============================================================================
// DASHBOARD KPI DEFINITIONS
// ============================================================================

export const DASHBOARD_KPIS = {
  TOTAL_STUDENTS: {
    id: "total-students",
    label: "Total Enrollment",
    icon: "users",
    color: "primary" as const,
  },
  ACTIVE_TEACHERS: {
    id: "active-teachers",
    label: "Active Teachers",
    icon: "user-check",
    color: "secondary" as const,
  },
  ATTENDANCE_RATE: {
    id: "attendance-rate",
    label: "Attendance Rate",
    icon: "check-circle",
    color: "success" as const,
    unit: "%",
  },
  AVERAGE_GPA: {
    id: "average-gpa",
    label: "Average GPA",
    icon: "trending-up",
    color: "primary" as const,
    unit: "/4.0",
  },
  HONOUR_ROLL_STUDENTS: {
    id: "honour-roll",
    label: "Honour Roll Students",
    icon: "award",
    color: "accent" as const,
  },
  AT_RISK_STUDENTS: {
    id: "at-risk",
    label: "At-Risk Students",
    icon: "alert-triangle",
    color: "warning" as const,
  },
  PENDING_FEES: {
    id: "pending-fees",
    label: "Pending Fee Payments",
    icon: "wallet",
    color: "error" as const,
  },
  LIBRARY_BOOKS: {
    id: "library-books",
    label: "Library Books",
    icon: "book",
    color: "primary" as const,
  },
};

// ============================================================================
// ALERT SYSTEM
// ============================================================================

export function generateDashboardAlerts(
  schoolData: any,
  academicData: any,
  financialData: any
): DashboardAlert[] {
  const alerts: DashboardAlert[] = [];

  // Attendance alert
  if (academicData.attendanceRate < 80) {
    alerts.push({
      id: `alert-attendance-${Date.now()}`,
      type: "warning",
      title: "Low Attendance Rate",
      message: `Current attendance is ${academicData.attendanceRate}%. Target is 90%.`,
      actionUrl: "/dashboard/attendance",
      actionLabel: "View Attendance",
      createdAt: new Date(),
      dismissed: false,
    });
  }

  // Academic performance alert
  if (academicData.averageGPA < 2.5) {
    alerts.push({
      id: `alert-academic-${Date.now()}`,
      type: "error",
      title: "Low Academic Performance",
      message: `Average GPA is ${academicData.averageGPA.toFixed(2)}. Consider academic support programs.`,
      actionUrl: "/dashboard/students",
      actionLabel: "View Students",
      createdAt: new Date(),
      dismissed: false,
    });
  }

  // Fee payment alert
  if (financialData.pendingFeePayments > financialData.totalStudents * 0.2) {
    alerts.push({
      id: `alert-fees-${Date.now()}`,
      type: "warning",
      title: "High Pending Fee Payments",
      message: `${financialData.pendingFeePayments} students have pending fee payments.`,
      actionUrl: "/dashboard/fees",
      actionLabel: "View Fees",
      createdAt: new Date(),
      dismissed: false,
    });
  }

  // Teacher absence alert
  if (academicData.absentTeachers > 0) {
    alerts.push({
      id: `alert-teachers-${Date.now()}`,
      type: "info",
      title: "Teacher Absence",
      message: `${academicData.absentTeachers} teacher(s) are absent today.`,
      actionUrl: "/dashboard/staff",
      actionLabel: "View Staff",
      createdAt: new Date(),
      dismissed: false,
    });
  }

  return alerts;
}

// ============================================================================
// DASHBOARD METRICS CALCULATION
// ============================================================================

export interface SchoolAnalyticsData {
  totalStudents: number;
  activeTeachers: number;
  attendanceRate: number;
  averageGPA: number;
  honourRollCount: number;
  atRiskCount: number;
  pendingFeePayments: number;
  totalLibraryBooks: number;
  absentTeachers: number;
}

export function calculateDashboardMetrics(data: SchoolAnalyticsData): DashboardMetric[] {
  return [
    {
      id: "enrollment",
      name: "Student Enrollment",
      value: data.totalStudents,
      percentage: 85, // Example: 85% of capacity
      target: Math.round(data.totalStudents / 0.85),
      status: data.totalStudents > 500 ? "on-track" : "at-risk",
      description: "Current enrollment vs. target capacity",
    },
    {
      id: "attendance",
      name: "Attendance Rate",
      value: data.attendanceRate,
      percentage: data.attendanceRate,
      target: 90,
      status: data.attendanceRate >= 90 ? "on-track" : data.attendanceRate >= 80 ? "at-risk" : "critical",
      description: "Daily attendance percentage",
    },
    {
      id: "academic-performance",
      name: "Academic Performance",
      value: Math.round(data.averageGPA * 100) / 100,
      percentage: (data.averageGPA / 4.0) * 100,
      target: 3.0,
      status: data.averageGPA >= 3.0 ? "on-track" : data.averageGPA >= 2.5 ? "at-risk" : "critical",
      description: "Average GPA across all students",
    },
    {
      id: "fee-collection",
      name: "Fee Collection Rate",
      value: Math.round(((data.totalStudents - data.pendingFeePayments) / data.totalStudents) * 100),
      percentage: ((data.totalStudents - data.pendingFeePayments) / data.totalStudents) * 100,
      target: 95,
      status: data.pendingFeePayments < data.totalStudents * 0.1 ? "on-track" : data.pendingFeePayments < data.totalStudents * 0.2 ? "at-risk" : "critical",
      description: "Percentage of fees collected",
    },
  ];
}

// ============================================================================
// DASHBOARD WIDGET CONFIGURATION
// ============================================================================

export const DEFAULT_DASHBOARD_WIDGETS: DashboardWidget[] = [
  {
    id: "kpi-enrollment",
    title: "Total Enrollment",
    type: "kpi",
    position: 1,
    size: "small",
    enabled: true,
    refreshInterval: 3600,
  },
  {
    id: "kpi-attendance",
    title: "Attendance Rate",
    type: "kpi",
    position: 2,
    size: "small",
    enabled: true,
    refreshInterval: 1800,
  },
  {
    id: "kpi-gpa",
    title: "Average GPA",
    type: "kpi",
    position: 3,
    size: "small",
    enabled: true,
    refreshInterval: 3600,
  },
  {
    id: "kpi-fees",
    title: "Pending Fees",
    type: "kpi",
    position: 4,
    size: "small",
    enabled: true,
    refreshInterval: 3600,
  },
  {
    id: "chart-attendance-trend",
    title: "Attendance Trend",
    type: "chart",
    position: 5,
    size: "medium",
    enabled: true,
    refreshInterval: 3600,
  },
  {
    id: "chart-gpa-distribution",
    title: "GPA Distribution",
    type: "chart",
    position: 6,
    size: "medium",
    enabled: true,
    refreshInterval: 3600,
  },
  {
    id: "alerts",
    title: "System Alerts",
    type: "alert",
    position: 7,
    size: "large",
    enabled: true,
    refreshInterval: 300,
  },
  {
    id: "recent-activities",
    title: "Recent Activities",
    type: "table",
    position: 8,
    size: "large",
    enabled: true,
    refreshInterval: 600,
  },
];

// ============================================================================
// DASHBOARD CONFIGURATION MANAGEMENT
// ============================================================================

export function createDefaultDashboardConfig(userId: string, schoolId: string): AdminDashboardConfig {
  return {
    userId,
    schoolId,
    widgets: DEFAULT_DASHBOARD_WIDGETS,
    theme: "light",
    autoRefresh: true,
    refreshInterval: 300, // 5 minutes
    lastUpdated: new Date(),
  };
}

export function updateDashboardWidget(
  config: AdminDashboardConfig,
  widgetId: string,
  updates: Partial<DashboardWidget>
): AdminDashboardConfig {
  return {
    ...config,
    widgets: config.widgets.map(w =>
      w.id === widgetId ? { ...w, ...updates } : w
    ),
    lastUpdated: new Date(),
  };
}

export function reorderDashboardWidgets(
  config: AdminDashboardConfig,
  widgetIds: string[]
): AdminDashboardConfig {
  const widgetMap = new Map(config.widgets.map(w => [w.id, w]));
  const reorderedWidgets = widgetIds
    .map((id, index) => {
      const widget = widgetMap.get(id);
      return widget ? { ...widget, position: index + 1 } : null;
    })
    .filter((w): w is DashboardWidget => w !== null);

  return {
    ...config,
    widgets: reorderedWidgets,
    lastUpdated: new Date(),
  };
}

// ============================================================================
// ANALYTICS DATA AGGREGATION
// ============================================================================

export interface AnalyticsDataPoint {
  date: Date;
  value: number;
  label: string;
}

export function generateAttendanceTrendData(days: number = 30): AnalyticsDataPoint[] {
  const data: AnalyticsDataPoint[] = [];
  for (let i = days; i > 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    data.push({
      date,
      value: Math.floor(Math.random() * 20) + 80, // 80-100%
      label: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    });
  }
  return data;
}

export function generateGPADistributionData(): Array<{ grade: string; count: number; percentage: number }> {
  const total = 500; // Example total students
  return [
    { grade: "A (18-20)", count: 75, percentage: 15 },
    { grade: "B (16-17)", count: 125, percentage: 25 },
    { grade: "C (14-15)", count: 150, percentage: 30 },
    { grade: "D (12-13)", count: 100, percentage: 20 },
    { grade: "E (10-11)", count: 40, percentage: 8 },
    { grade: "F (0-9)", count: 10, percentage: 2 },
  ];
}

export function generateRevenueData(months: number = 12): AnalyticsDataPoint[] {
  const data: AnalyticsDataPoint[] = [];
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  
  for (let i = 0; i < months; i++) {
    const date = new Date();
    date.setMonth(date.getMonth() - (months - i - 1));
    data.push({
      date,
      value: Math.floor(Math.random() * 5000000) + 10000000, // 10M - 15M XAF
      label: monthNames[date.getMonth()],
    });
  }
  return data;
}

// ============================================================================
// EXPORT DASHBOARD SYSTEM
// ============================================================================

export default {
  DASHBOARD_KPIS,
  generateDashboardAlerts,
  calculateDashboardMetrics,
  DEFAULT_DASHBOARD_WIDGETS,
  createDefaultDashboardConfig,
  updateDashboardWidget,
  reorderDashboardWidgets,
  generateAttendanceTrendData,
  generateGPADistributionData,
  generateRevenueData,
};
