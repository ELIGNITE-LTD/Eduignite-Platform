
"use client";

import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  GraduationCap, 
  Coins, 
  Calendar, 
  ShieldCheck, 
  Download, 
  Printer,
  ChevronRight,
  UserCheck,
  UserPlus,
  BookOpen,
  Award,
  Clock,
  Building2,
  PieChart,
  ArrowUpRight,
  TrendingDown,
  Activity,
  Zap,
  Info,
  FileText,
  MapPin,
  QrCode,
  X,
  History,
  Lock,
  Globe,
  Scale,
  CheckCircle2,
  Filter,
  UserRoundCheck,
  UserRoundX,
  UserCog,
  LayoutGrid,
  Search,
  Smartphone,
  FileDown,
  Save,
  Loader2
} from "lucide-react";
import { 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  PieChart as RePieChart,
  Pie,
  Legend
} from "recharts";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSchoolSettings, useUpdateSchoolSettings } from "@/lib/hooks/useSchools";
import { useStudents } from "@/lib/hooks/useStudents";
import { useUsers } from "@/lib/hooks/useUsers";
import { resolvePlatformLogoUrl } from "@/lib/platform-brand";
import { useAttendanceRecords } from "@/lib/hooks/useAttendance";
import { useRevenueReport, useFeeStructures } from "@/lib/hooks/useFees";
import { useAnnualResults, useClassStatistics, usePeriodStatistics } from "@/lib/hooks/useGrades";

// --- CONSTANTS & MOCK DATA ---
const ACADEMIC_YEARS = ["2023 / 2024", "2022 / 2023"];
const TERMS = ["Term 1", "Term 2", "Term 3"];
const SCHOOL_SETTING_TERMS = [
  { value: "First", label: "First Term" },
  { value: "Second", label: "Second Term" },
  { value: "Third", label: "Third Term" },
] as const;
const SCHOOL_TERM_TO_FILTER: Record<string, string> = {
  First: "Term 1",
  Second: "Term 2",
  Third: "Term 3",
};
const SECTIONS = ["Anglophone Section", "Francophone Section", "Technical Section"];

const getUserSchoolId = (account: unknown): string => {
  const userRecord = account as {
    school?: string | { id?: string | null; logo?: string | null; name?: string | null } | null;
    school_id?: string | null;
    schoolId?: string | null;
  } | null;
  const school = userRecord?.school;
  if (typeof school === "string") return school;
  return school?.id || userRecord?.school_id || userRecord?.schoolId || "";
};

const getAcademicCalendarError = (error: any): string => {
  const status = error?.response?.status;
  const data = error?.response?.data;
  const fieldMessages = [
    data?.academic_year?.[0],
    data?.term?.[0],
    data?.school?.[0],
    data?.non_field_errors?.[0],
    typeof data?.detail === "string" ? data.detail : null,
  ].filter(Boolean);

  if (fieldMessages.length > 0) return String(fieldMessages[0]);
  if (status === 401) return "Your login session expired. Please sign in again, then save the academic year.";
  if (status === 403) return "Your account is not allowed to update this school's academic calendar.";
  if (status === 404) return "The school settings record was missing. Refresh the page and try again so EduIgnite can create it automatically.";
  if (status >= 500) return "The server could not save the academic year right now. Please try again after a moment.";
  if (error?.code === "ERR_NETWORK") return "You appear to be offline. The academic year will be saved automatically once you're back online.";
  return error?.message || "Could not update the academic calendar.";
};

export default function StatisticsPage() {
  const { user, platformSettings } = useAuth();
  const platformLogo = resolvePlatformLogoUrl(platformSettings.logo);
  const { t, language } = useI18n();
  const { toast } = useToast();
  const schoolId = getUserSchoolId(user);
  const { data: schoolSettings } = useSchoolSettings(schoolId);
  const updateSchoolSettingsMutation = useUpdateSchoolSettings();
  const { data: studentsData } = useStudents({ limit: 500 });
  const { data: staffData } = useUsers({ role: "SCHOOL_ADMIN,SUB_ADMIN,TEACHER,BURSAR,LIBRARIAN", limit: 300 });
  const { data: attendanceData } = useAttendanceRecords({ limit: 500 });
  const { data: revenueReport } = useRevenueReport();
  const { data: feeStructuresData } = useFeeStructures({ limit: 200 });
  const { data: annualResultsData } = useAnnualResults({ limit: 500 });
  const { data: classStatsResp } = useClassStatistics(undefined, Boolean(schoolId));
  
  // Filters
  const [filters, setFilters] = useState({
    year: ACADEMIC_YEARS[0],
    term: TERMS[0],
    section: "all",
    class: "all"
  });
  const [academicCalendarForm, setAcademicCalendarForm] = useState({
    academic_year: "",
    term: "First",
  });

  const [previewReport, setPreviewReport] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const selectedTermNumber = Number(String(filters.term || "").replace(/\D/g, "")) || 1;
  const periodStatsParams = useMemo(() => ({
    scope: "TERM" as const,
    term: selectedTermNumber,
    academic_year: filters.year,
  }), [filters.year, selectedTermNumber]);
  const { data: periodStats } = usePeriodStatistics(periodStatsParams, Boolean(schoolId && filters.year));

  const availableSections = useMemo(
    () => (schoolSettings?.sections?.filter(Boolean)?.length ? schoolSettings.sections : SECTIONS),
    [schoolSettings]
  );
  const academicYearOptions = useMemo(() => {
    const current = schoolSettings?.academic_year?.trim();
    return Array.from(new Set([current, ...ACADEMIC_YEARS].filter(Boolean))) as string[];
  }, [schoolSettings?.academic_year]);

  useEffect(() => {
    if (!schoolSettings) return;
    const academicYear = schoolSettings.academic_year || "";
    const term = schoolSettings.term || "First";
    setAcademicCalendarForm({ academic_year: academicYear, term });
    setFilters((current) => ({
      ...current,
      year: academicYear || current.year,
      term: SCHOOL_TERM_TO_FILTER[term] || current.term,
    }));
  }, [schoolSettings]);

  const handleSaveAcademicCalendar = async () => {
    if (!schoolId) {
      toast({ variant: "destructive", title: "School unavailable", description: "Your account is not linked to a school." });
      return;
    }
    const academicYear = academicCalendarForm.academic_year.trim();
    if (!/^\d{4}\s*[-/]\s*\d{4}$/.test(academicYear)) {
      toast({ variant: "destructive", title: "Invalid academic year", description: "Use a Cameroon school-year format such as 2025-2026." });
      return;
    }
    try {
      await updateSchoolSettingsMutation.mutateAsync({
        id: schoolId,
        data: {
          academic_year: academicYear.replace(/\s+/g, ""),
          term: academicCalendarForm.term,
        },
      });
      toast({ title: "Academic year updated", description: "Institutional Intelligence now uses the active school year and term." });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: getAcademicCalendarError(error),
      });
    }
  };

  const studentRows = studentsData?.results || [];
  const staffRows = staffData?.results || [];
  const attendanceRows = attendanceData?.results || [];
  const annualRows = annualResultsData?.results || [];
  const feeStructureRows = feeStructuresData?.results || [];
  const gradeClassRows = Array.isArray(classStatsResp?.classes) ? classStatsResp.classes : [];

  const performanceByClass = useMemo(() => {
    if (gradeClassRows.length) {
      return gradeClassRows
        .map((row) => {
          const className = row.name;
          const students = Number(row.students ?? row.student_count ?? 0);
          const average = Number(row.averageMark ?? row.average_mark ?? 0);
          const attendanceForClass = attendanceRows.reduce(
            (acc: { present: number; total: number }, record: any) => {
              const recordClass = record.student?.student_class || record.student?.school_class_name || "Unassigned";
              if (recordClass !== className) return acc;
              acc.total += 1;
              if (["Present", "Late", "present", "late"].includes(record.status)) {
                acc.present += 1;
              }
              return acc;
            },
            { present: 0, total: 0 }
          );
          const expectedPerStudent = feeStructureRows.reduce((sum: number, fee: any) => sum + Number(fee.amount || 0), 0);
          const revenueShare =
            Number(revenueReport?.total_collected || 0) > 0 && studentRows.length > 0
              ? (Number(revenueReport?.total_collected || 0) * students) / studentRows.length
              : 0;
          return {
            name: className,
            students,
            annualTotal: 0,
            annualCount: Number(row.graded_students ?? 0),
            revenue: Math.round(revenueShare),
            arrears: Math.max(Math.round((expectedPerStudent * students) - revenueShare), 0),
            attendancePresent: attendanceForClass.present,
            attendanceTotal: attendanceForClass.total,
            average: Number(average.toFixed(2)),
            attendance: attendanceForClass.total > 0 ? Math.round((attendanceForClass.present / attendanceForClass.total) * 100) : 0,
            performance: Number(row.performance ?? 0),
            passRate: Number(row.pass_rate ?? row.passRate ?? 0),
            teachers: Number(row.teachers ?? row.teacher_count ?? 0),
            marksEntered: Number(row.marks_entered ?? row.marksEntered ?? 0),
          };
        })
        .sort((a: any, b: any) => b.average - a.average);
    }

    const grouped = studentRows.reduce((acc: Record<string, any>, student: any) => {
      const className = student.student_class || "Unassigned";
      if (!acc[className]) {
        acc[className] = {
          name: className,
          students: 0,
          annualTotal: 0,
          annualCount: 0,
          revenue: 0,
          arrears: 0,
          attendancePresent: 0,
          attendanceTotal: 0,
        };
      }

      acc[className].students += 1;
      const average = Number(student.annual_average || 0);
      if (!Number.isNaN(average) && average > 0) {
        acc[className].annualTotal += average;
        acc[className].annualCount += 1;
      }

      return acc;
    }, {});

    attendanceRows.forEach((record: any) => {
      const className = record.student?.student_class || "Unassigned";
      if (!grouped[className]) {
        grouped[className] = {
          name: className,
          students: 0,
          annualTotal: 0,
          annualCount: 0,
          revenue: 0,
          arrears: 0,
          attendancePresent: 0,
          attendanceTotal: 0,
        };
      }
      grouped[className].attendanceTotal += 1;
      if (["Present", "Late", "present", "late"].includes(record.status)) {
        grouped[className].attendancePresent += 1;
      }
    });

    const expectedPerStudent = feeStructureRows.reduce((sum: number, fee: any) => sum + Number(fee.amount || 0), 0);

    return Object.values(grouped)
      .map((row: any) => {
        const average = row.annualCount > 0 ? row.annualTotal / row.annualCount : 0;
        const expected = expectedPerStudent * row.students;
        const revenueShare =
          Number(revenueReport?.total_collected || 0) > 0 && studentRows.length > 0
            ? (Number(revenueReport?.total_collected || 0) * row.students) / studentRows.length
            : 0;

        return {
          ...row,
          average: Number(average.toFixed(2)),
          attendance: row.attendanceTotal > 0 ? Math.round((row.attendancePresent / row.attendanceTotal) * 100) : 0,
          revenue: Math.round(revenueShare),
          arrears: Math.max(Math.round(expected - revenueShare), 0),
        };
      })
      .sort((a: any, b: any) => b.average - a.average);
  }, [attendanceRows, feeStructureRows, gradeClassRows, revenueReport?.total_collected, studentRows]);

  const staffCounts = useMemo(() => {
    const counts = {
      total: staffRows.length,
      teachers: 0,
      schoolAdmins: 0,
      subAdmins: 0,
      bursars: 0,
      librarians: 0,
    };

    staffRows.forEach((staff: any) => {
      if (staff.role === "TEACHER") counts.teachers += 1;
      if (staff.role === "SCHOOL_ADMIN") counts.schoolAdmins += 1;
      if (staff.role === "SUB_ADMIN") counts.subAdmins += 1;
      if (staff.role === "BURSAR") counts.bursars += 1;
      if (staff.role === "LIBRARIAN") counts.librarians += 1;
    });

    return counts;
  }, [staffRows]);

  const staffBreakdown = useMemo(
    () => [
      {
        key: "total",
        label: "Total Staff",
        value: staffCounts.total,
        detail: "All staff accounts currently linked to the school",
        icon: Users,
        accent: "bg-primary text-white",
      },
      {
        key: "teachers",
        label: "Teachers",
        value: staffCounts.teachers,
        detail: "Instructional staff teaching registered classes",
        icon: GraduationCap,
        accent: "bg-blue-50 text-blue-700",
      },
      {
        key: "schoolAdmins",
        label: "School Admins",
        value: staffCounts.schoolAdmins,
        detail: "Primary school leadership accounts",
        icon: ShieldCheck,
        accent: "bg-emerald-50 text-emerald-700",
      },
      {
        key: "subAdmins",
        label: "Sub Admins",
        value: staffCounts.subAdmins,
        detail: "Delegated sub-school administrators",
        icon: UserCog,
        accent: "bg-amber-50 text-amber-700",
      },
      {
        key: "bursars",
        label: "Bursars",
        value: staffCounts.bursars,
        detail: "Financial operations staff",
        icon: Coins,
        accent: "bg-purple-50 text-purple-700",
      },
      {
        key: "librarians",
        label: "Librarians",
        value: staffCounts.librarians,
        detail: "Library and resource managers",
        icon: BookOpen,
        accent: "bg-cyan-50 text-cyan-700",
      },
    ],
    [staffCounts]
  );

  const staffDirectory = useMemo(
    () =>
      [...staffRows]
        .map((staff: any) => ({
          id: staff.id,
          name: staff.name,
          avatar: staff.avatar,
          role: staff.role,
          roleLabel: `${staff.role || ""}`
            .toLowerCase()
            .split("_")
            .map((segment: string) => segment.charAt(0).toUpperCase() + segment.slice(1))
            .join(" "),
          subSchool: staff.sub_school?.name || "Main school",
          email: staff.email || "No email",
        }))
        .sort((a, b) => {
          if (a.role === b.role) return a.name.localeCompare(b.name);
          return a.role.localeCompare(b.role);
        }),
    [staffRows]
  );

  const studentMeritList = useMemo(() => {
    if (periodStats?.top_students?.length) {
      return periodStats.top_students.map((item: any) => ({
        id: item.student_id,
        name: item.student_name || "Student",
        avg: Number(item.average || 0),
        class: item.class_name || "Unassigned",
        rank: item.rank,
        status: item.average >= Number(platformSettings?.honourRollThreshold || 12) ? "Perfect" : "Merit",
      }));
    }

    const meritSource = annualRows.length > 0
      ? annualRows.map((item: any) => ({
          id: item.student,
          name: item.student_name || "Student",
          avg: Number(item.annual_average || 0),
          class: studentRows.find((student: any) => student.id === item.student)?.student_class || "Unassigned",
        }))
      : studentRows.map((student: any) => ({
          id: student.id,
          name: student.user?.name || "Student",
          avg: Number(student.annual_average || 0),
          class: student.student_class || "Unassigned",
        }));

    return meritSource
      .filter((item: any) => item.avg > 0)
      .sort((a: any, b: any) => b.avg - a.avg)
      .slice(0, 10)
      .map((item: any) => ({
        ...item,
        status: item.avg >= Number(platformSettings?.honourRollThreshold || 12) ? "Perfect" : "Merit",
      }));
  }, [annualRows, periodStats?.top_students, platformSettings?.honourRollThreshold, studentRows]);

  const lowPerformanceList = useMemo(
    () => (periodStats?.bottom_students || []).map((item: any) => ({
      id: item.student_id,
      name: item.student_name || "Student",
      avg: Number(item.average || 0),
      class: item.class_name || "Unassigned",
      rank: item.rank,
      status: item.status || "REVIEW",
    })),
    [periodStats?.bottom_students]
  );
  const periodClassRows = periodStats?.classes || [];
  const periodSubSchoolRows = periodStats?.sub_schools || [];
  const topPeriodStudentAverage = Number(periodStats?.top_students?.[0]?.average || 0);
  const lowestPeriodStudentAverage = Number(lowPerformanceList?.[0]?.avg || 0);
  const segmentDelta = topPeriodStudentAverage && lowestPeriodStudentAverage
    ? (topPeriodStudentAverage - lowestPeriodStudentAverage).toFixed(2)
    : "0.00";

  const attendanceAlerts = useMemo(
    () =>
      performanceByClass
        .filter((row: any) => row.attendance > 0 && row.attendance < 75)
        .slice(0, 8)
        .map((row: any) => ({
          className: row.name,
          name: row.name,
          class: `${row.students} students`,
          attendance: row.attendance,
          rate: row.attendance,
          students: row.students,
          status: row.attendance < 60 ? "Critical" : "Monitor",
        })),
    [performanceByClass]
  );

  // Strategic Metrics
  const legacyStats = useMemo(() => ({
    globalAvg: "0",
    highestSchool: "0",
    lowestSchool: "0",
    passRate: "0%",
    totalAssessments: "0",
    totalStudents: "0",
    totalRevenue: "0",
    totalArrears: "0",
    collectionRate: "0%",
    expectedIntake: "0",
    avgFeePerStudent: "0",
    overallAttendance: "0%",
    perfectAttendaceCount: 0,
    criticalLowAttendance: 0,
    staffPresence: "0%",
    studentTeacherRatio: "0:0",
    topSection: "—",
    bottomSection: "—",
    topClass: "—",
    bottomClass: "—",
    growthIndex: "0%"
  }), []);

  const stats = useMemo(() => {
    const totalStudents = studentRows.length;
    const totalStaff = staffRows.length;
    const totalTeachers = staffCounts.teachers;
    const expectedPerStudent = feeStructureRows.reduce((sum: number, fee: any) => sum + Number(fee.amount || 0), 0);
    const expectedIntake = expectedPerStudent * totalStudents;
    const totalRevenue = Number(revenueReport?.total_collected || 0);
    const totalArrears = Math.max(expectedIntake - totalRevenue, 0);
    const liveSummary = periodStats?.summary;
    const globalAverage =
      liveSummary?.ranked_students
        ? Number(liveSummary.school_average || 0)
        : totalStudents > 0
          ? studentRows.reduce((sum: number, student: any) => sum + Number(student.annual_average || 0), 0) / totalStudents
          : 0;
    const passCount = liveSummary?.ranked_students
      ? Number(liveSummary.pass_count || 0)
      : studentRows.filter((student: any) => Number(student.annual_average || 0) >= 10).length;
    const passRate = liveSummary?.ranked_students
      ? Number(liveSummary.pass_rate || 0)
      : totalStudents > 0 ? (passCount / totalStudents) * 100 : 0;
    const averageAttendance =
      performanceByClass.length > 0
        ? performanceByClass.reduce((sum: number, row: any) => sum + Number(row.attendance || 0), 0) / performanceByClass.length
        : 0;
    const topClass = performanceByClass[0];
    const bottomClass = performanceByClass[performanceByClass.length - 1];

    return {
      globalAvg: globalAverage.toFixed(2),
      highestSchool: (topClass?.average || 0).toFixed(2),
      lowestSchool: (bottomClass?.average || 0).toFixed(2),
      passRate: `${passRate.toFixed(0)}%`,
      totalAssessments: `${annualRows.length || studentRows.length}`,
      totalStudents: `${totalStudents}`,
      totalRevenue: `${Math.round(totalRevenue)}`,
      totalArrears: `${Math.round(totalArrears)}`,
      collectionRate: `${expectedIntake > 0 ? ((totalRevenue / expectedIntake) * 100).toFixed(0) : "0"}%`,
      expectedIntake: `${Math.round(expectedIntake)}`,
      avgFeePerStudent: `${Math.round(expectedPerStudent).toLocaleString()} XAF`,
      overallAttendance: `${averageAttendance.toFixed(0)}%`,
      perfectAttendaceCount: studentRows.filter((student: any) => Number(student.annual_average || 0) >= Number(platformSettings?.honourRollThreshold || 12)).length,
      criticalLowAttendance: attendanceAlerts.filter((alert: any) => alert.status === "Critical").length,
      staffPresence: totalStaff > 0 ? `${totalStaff} staff` : "0 staff",
      studentTeacherRatio: `${totalStudents}:${Math.max(totalTeachers, 1)}`,
      topSection: topClass?.name || "â€”",
      bottomSection: bottomClass?.name || "â€”",
      topClass: topClass?.name || "â€”",
      bottomClass: bottomClass?.name || "â€”",
      growthIndex: totalStudents > 0 ? `${Math.min(100, Math.max(0, passRate - 50)).toFixed(0)}%` : "0%",
    };
  }, [annualRows.length, attendanceAlerts, feeStructureRows, periodStats?.summary, performanceByClass, platformSettings?.honourRollThreshold, revenueReport?.total_collected, staffCounts.teachers, staffRows, studentRows]);

  const handleGenerateReport = (scope: string) => {
    setPreviewReport({
      title: `${scope.toUpperCase()} STRATEGIC AUDIT`,
      scope,
      date: new Date().toLocaleDateString(),
      filters: { ...filters }
    });
  };

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-700">
      {/* 1. STRATEGIC HEADER */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary rounded-[1.5rem] shadow-2xl border-4 border-white">
            <BarChart3 className="w-8 h-8 text-secondary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-primary font-headline tracking-tighter uppercase leading-none">Institutional Intelligence</h1>
            <p className="text-muted-foreground text-sm mt-1">Global oversight of pedagogical, financial, and operational velocity.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 bg-white p-2 rounded-[2rem] shadow-sm border border-primary/5">
          <div className="flex items-center gap-2 px-3 border-r">
            <Calendar className="w-4 h-4 text-primary/40" />
            <Select value={filters.year} onValueChange={(v) => setFilters({...filters, year: v})}>
              <SelectTrigger className="w-[120px] border-none h-9 text-xs font-bold focus:ring-0 uppercase"><SelectValue /></SelectTrigger>
              <SelectContent>{academicYearOptions.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 px-3 border-r">
            <Clock className="w-4 h-4 text-primary/40" />
            <Select value={filters.term} onValueChange={(v) => setFilters({...filters, term: v})}>
              <SelectTrigger className="w-[100px] border-none h-9 text-xs font-bold focus:ring-0 uppercase"><SelectValue /></SelectTrigger>
              <SelectContent>{TERMS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 px-3 border-r">
            <Globe className="w-4 h-4 text-primary/40" />
            <Select value={filters.section} onValueChange={(v) => setFilters({...filters, section: v})}>
              <SelectTrigger className="w-[150px] border-none h-9 text-xs font-bold focus:ring-0 uppercase"><SelectValue placeholder="All Sections" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Entire Node</SelectItem>
                {availableSections.map((section) => <SelectItem key={section} value={section}>{section}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button 
            className="h-10 px-6 rounded-xl bg-primary text-white font-black uppercase text-[10px] tracking-widest gap-2 shadow-xl hover:bg-primary/90"
            onClick={() => handleGenerateReport('Full Institutional')}
          >
            <Printer className="w-4 h-4" /> Download All
          </Button>
        </div>
      </div>

      {["SCHOOL_ADMIN", "SUB_ADMIN"].includes(user?.role || "") ? (
        <Card className="border border-primary/10 bg-white shadow-sm">
          <CardContent className="grid gap-4 p-5 md:grid-cols-[1fr_220px_auto] md:items-end">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Active Academic Year
              </Label>
              <Input
                value={academicCalendarForm.academic_year}
                onChange={(event) => setAcademicCalendarForm((current) => ({ ...current, academic_year: event.target.value }))}
                placeholder="2025-2026"
                className="h-11 rounded-xl border-primary/10 font-bold"
              />
              <p className="text-xs text-muted-foreground">
                This is the official year used by dashboards, reports, receipts, and school records.
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Active Term
              </Label>
              <Select
                value={academicCalendarForm.term}
                onValueChange={(value) => setAcademicCalendarForm((current) => ({ ...current, term: value }))}
              >
                <SelectTrigger className="h-11 rounded-xl border-primary/10 font-bold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCHOOL_SETTING_TERMS.map((term) => (
                    <SelectItem key={term.value} value={term.value}>{term.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleSaveAcademicCalendar}
              disabled={updateSchoolSettingsMutation.isPending}
              className="h-11 rounded-xl bg-primary px-6 font-black uppercase tracking-widest text-white"
            >
              {updateSchoolSettingsMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Year
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* 2. CORE PERFORMANCE TILES */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-none shadow-sm bg-primary text-white overflow-hidden relative group cursor-pointer" onClick={() => handleGenerateReport('Pedagogical Peak')}>
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform"><TrendingUp className="w-16 h-16"/></div>
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-black uppercase opacity-60 tracking-[0.2em]">Global Average</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-secondary">{stats.globalAvg} <span className="text-sm opacity-40">/ 20</span></div>
            <p className="text-[9px] font-bold mt-2 uppercase flex items-center gap-1"><ArrowUpRight className="w-3 h-3" /> {stats.growthIndex} Growth</p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white group hover:ring-2 hover:ring-primary/10 transition-all cursor-pointer" onClick={() => handleGenerateReport('Financial Absorption')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.2em]">Net Intake</CardTitle>
            <Coins className="w-4 h-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-primary">{stats.totalRevenue} <span className="text-xs font-bold text-muted-foreground">XAF</span></div>
            <p className="text-[9px] font-bold text-emerald-600 uppercase mt-1">{stats.collectionRate} Efficiency</p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white group hover:ring-2 hover:ring-primary/10 transition-all cursor-pointer" onClick={() => handleGenerateReport('Presence Velocity')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.2em]">Presence Mean</CardTitle>
            <UserCheck className="w-4 h-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-primary">{stats.overallAttendance}</div>
            <p className="text-[9px] font-bold text-muted-foreground uppercase mt-1">{stats.perfectAttendaceCount} Perfect Logs</p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white group hover:ring-2 hover:ring-primary/10 transition-all cursor-pointer" onClick={() => handleGenerateReport('Institutional Rank')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.2em]">Excellence Peak</CardTitle>
            <Award className="w-4 h-4 text-secondary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-primary">{stats.highestSchool}</div>
            <p className="text-[9px] font-bold text-muted-foreground uppercase mt-1">High watermark score</p>
          </CardContent>
        </Card>
      </div>

      {/* 3. MAIN ANALYTICS DOMAINS */}
      <Tabs defaultValue="pedagogy" className="w-full">
        <TabsList className="grid grid-cols-4 w-full md:w-[1000px] mb-8 bg-white shadow-sm border h-auto p-1.5 rounded-[2rem]">
          <TabsTrigger value="pedagogy" className="gap-2 py-3 rounded-[1.5rem] font-bold transition-all"><Award className="w-4 h-4"/> Academic Audit</TabsTrigger>
          <TabsTrigger value="finance" className="gap-2 py-3 rounded-[1.5rem] font-bold transition-all"><Coins className="w-4 h-4"/> Financial Matrix</TabsTrigger>
          <TabsTrigger value="staff" className="gap-2 py-3 rounded-[1.5rem] font-bold transition-all"><UserCog className="w-4 h-4"/> Staff Structure</TabsTrigger>
          <TabsTrigger value="attendance" className="gap-2 py-3 rounded-[1.5rem] font-bold transition-all"><Activity className="w-4 h-4"/> Presence Audit</TabsTrigger>
        </TabsList>

        {/* ACADEMIC AUDIT */}
        <TabsContent value="pedagogy" className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <Card className="lg:col-span-8 border-none shadow-xl rounded-[2.5rem] bg-white overflow-hidden">
              <CardHeader className="bg-primary/5 p-8 border-b flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-black text-primary uppercase flex items-center gap-2"><TrendingUp className="w-5 h-5 text-secondary" /> Performance Variance by Class</CardTitle>
                  <CardDescription>Visualizing average marks across active cohorts.</CardDescription>
                </div>
                <Button variant="outline" size="sm" className="rounded-xl h-9 gap-2 font-bold" onClick={() => handleGenerateReport('Class Performance')}>
                  <Printer className="w-3.5 h-3.5" /> Print
                </Button>
              </CardHeader>
              <CardContent className="h-[400px] pt-10">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={performanceByClass}>
                    <defs>
                      <linearGradient id="colorAvg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#264D73" stopOpacity={0.15}/>
                        <stop offset="95%" stopColor="#264D73" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                    <Area type="monotone" dataKey="average" stroke="#264D73" strokeWidth={4} fill="url(#colorAvg)" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="lg:col-span-4 border-none shadow-xl rounded-[2.5rem] bg-primary text-white flex flex-col">
              <CardHeader className="p-8">
                <CardTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2"><Scale className="w-5 h-5 text-secondary"/> Range Analysis</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 flex-1 px-8">
                {[
                  { label: "Whole School Peak", value: stats.highestSchool, color: "text-secondary" },
                  { label: "Top Class Avg", value: periodClassRows[0] ? `${Number(periodClassRows[0].average || 0).toFixed(2)} (${periodClassRows[0].name})` : "0.00", color: "text-white" },
                  { label: "Lower Bound Peak", value: lowestPeriodStudentAverage ? lowestPeriodStudentAverage.toFixed(2) : "0.00", color: "text-red-400" },
                  { label: "Segment Delta", value: `${segmentDelta} Points`, color: "text-white/60" },
                ].map((item, i) => (
                  <div key={i} className="flex justify-between items-center py-3 border-b border-white/10 last:border-0">
                    <span className="text-[10px] font-black uppercase tracking-widest opacity-60">{item.label}</span>
                    <span className={cn("text-lg font-black", item.color)}>{item.value}</span>
                  </div>
                ))}
              </CardContent>
              <CardFooter className="bg-white/5 p-6 border-t border-white/5">
                 <Button variant="ghost" className="w-full text-white/40 hover:text-white uppercase text-[9px] font-black tracking-widest gap-2" onClick={() => handleGenerateReport('Statistical Range')}>
                   <FileDown className="w-3.5 h-3.5" /> Download Detail
                 </Button>
              </CardFooter>
            </Card>
          </div>

          <Card className="border-none shadow-xl rounded-[2.5rem] bg-white overflow-hidden">
            <CardHeader className="p-8 border-b flex items-center justify-between">
              <div>
                <CardTitle className="text-xl font-black text-primary uppercase">Institutional Merit List</CardTitle>
                <CardDescription>Top students based on current term aggregate averages.</CardDescription>
              </div>
              <Button variant="ghost" className="text-primary gap-2 font-bold" onClick={() => handleGenerateReport('Academic Merit')}>
                <Printer className="w-4 h-4" /> Print Registry
              </Button>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader className="bg-accent/10 uppercase text-[10px] font-black">
                  <TableRow>
                    <TableHead className="pl-8 py-4">Global Rank</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead className="text-center">Mean Score</TableHead>
                    <TableHead className="text-right pr-8">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {studentMeritList.map((s, i) => (
                    <TableRow key={i} className="hover:bg-accent/5">
                      <TableCell className="pl-8"><Badge className="bg-primary/5 text-primary border-none font-black h-7 w-7 rounded-full flex items-center justify-center p-0">0{i+1}</Badge></TableCell>
                      <TableCell className="font-bold text-sm text-primary uppercase">{s.name}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px] font-bold uppercase">{s.class}</Badge></TableCell>
                      <TableCell className="text-center font-black text-primary text-lg">{s.avg.toFixed(2)}</TableCell>
                      <TableCell className="text-right pr-8">
                        <Badge className={cn("text-[8px] font-black uppercase px-2 h-5 border-none", s.status === 'Perfect' ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700")}>
                          {s.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            <Card className="border-none shadow-xl rounded-[2.5rem] bg-white overflow-hidden">
              <CardHeader className="p-8 border-b">
                <CardTitle className="text-xl font-black text-primary uppercase">Students Requiring Review</CardTitle>
                <CardDescription>Lowest current-period averages for guidance and remediation planning.</CardDescription>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader className="bg-red-50 uppercase text-[10px] font-black">
                    <TableRow>
                      <TableHead className="pl-8 py-4">Rank</TableHead>
                      <TableHead>Student</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead className="text-right pr-8">Average</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lowPerformanceList.length > 0 ? lowPerformanceList.map((student) => (
                      <TableRow key={student.id} className="hover:bg-red-50/50">
                        <TableCell className="pl-8 font-black text-muted-foreground">{student.rank || "-"}</TableCell>
                        <TableCell className="font-bold text-primary uppercase text-xs">{student.name}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px] font-bold uppercase">{student.class}</Badge></TableCell>
                        <TableCell className="text-right pr-8 font-black text-red-600">{student.avg.toFixed(2)}/20</TableCell>
                      </TableRow>
                    )) : (
                      <TableRow>
                        <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                          No period statistics are available yet for the selected term.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="border-none shadow-xl rounded-[2.5rem] bg-white overflow-hidden">
              <CardHeader className="p-8 border-b">
                <CardTitle className="text-xl font-black text-primary uppercase">Term Summary by Class</CardTitle>
                <CardDescription>Real class averages and pass rates for the selected Cameroon term.</CardDescription>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader className="bg-accent/10 uppercase text-[10px] font-black">
                    <TableRow>
                      <TableHead className="pl-8 py-4">Class</TableHead>
                      <TableHead className="text-center">Ranked</TableHead>
                      <TableHead className="text-center">Average</TableHead>
                      <TableHead className="text-right pr-8">Pass Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {periodClassRows.length > 0 ? periodClassRows.map((row) => (
                      <TableRow key={row.name} className="hover:bg-accent/5">
                        <TableCell className="pl-8 font-black text-primary uppercase text-xs">{row.name}</TableCell>
                        <TableCell className="text-center font-bold">{row.ranked_students}/{row.students}</TableCell>
                        <TableCell className="text-center font-black text-primary">{Number(row.average || 0).toFixed(2)}</TableCell>
                        <TableCell className="text-right pr-8 font-black">{row.pass_rate}%</TableCell>
                      </TableRow>
                    )) : (
                      <TableRow>
                        <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                          No class-level term statistics are available yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {periodSubSchoolRows.length > 1 ? (
            <Card className="border-none shadow-xl rounded-[2.5rem] bg-white overflow-hidden">
              <CardHeader className="p-8 border-b">
                <CardTitle className="text-xl font-black text-primary uppercase">Sub-School Performance</CardTitle>
                <CardDescription>Section-level analysis for bilingual, technical, mixed, and manually added sub-schools.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-4">
                {periodSubSchoolRows.map((row) => (
                  <div key={row.name} className="rounded-2xl border bg-primary/5 p-5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{row.name}</p>
                    <p className="mt-2 text-3xl font-black text-primary">{Number(row.average || 0).toFixed(2)}</p>
                    <p className="mt-1 text-xs font-bold text-muted-foreground">
                      {row.ranked_students}/{row.students} ranked • {row.pass_rate}% pass
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        {/* FINANCIAL MATRIX */}
        <TabsContent value="finance" className="space-y-8 animate-in fade-in slide-in-from-bottom-2 mt-0">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="border-none shadow-sm bg-white p-6 rounded-3xl space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Aggregate intake</p>
                <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600"><Coins className="w-4 h-4"/></div>
              </div>
              <div className="text-3xl font-black text-primary">{stats.totalRevenue} XAF</div>
              <p className="text-[9px] font-bold text-emerald-600 uppercase flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5"/> +14.2% Growth</p>
            </Card>
            <Card className="border-none shadow-sm bg-white p-6 rounded-3xl space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">System Arrears</p>
                <div className="p-2 bg-red-50 rounded-lg text-red-600"><TrendingDown className="w-4 h-4"/></div>
              </div>
              <div className="text-3xl font-black text-primary">{stats.totalArrears} XAF</div>
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between text-[9px] font-bold uppercase text-muted-foreground"><span>Absorption Rate</span><span>82%</span></div>
                <Progress value={82} className="h-1.5 [&>div]:bg-primary" />
              </div>
            </Card>
            <Card className="border-none shadow-sm bg-primary text-white p-6 rounded-3xl flex flex-col justify-center cursor-pointer group" onClick={() => handleGenerateReport('Revenue Audit')}>
               <div className="flex justify-between items-start">
                 <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40">Expected Intake</p>
                 <Printer className="w-4 h-4 opacity-40 group-hover:opacity-100 transition-opacity" />
               </div>
               <div className="text-3xl font-black text-secondary">{stats.expectedIntake} XAF</div>
               <p className="text-[9px] font-bold mt-2 opacity-60 uppercase">Institutional Node Target</p>
            </Card>
          </div>

          <Card className="border-none shadow-xl rounded-[2.5rem] bg-white overflow-hidden">
            <CardHeader className="p-8 border-b flex items-center justify-between">
              <div>
                <CardTitle className="text-xl font-black text-primary uppercase">Revenue Performance Matrix</CardTitle>
                <CardDescription>Intake vs Outstanding debt across cohorts.</CardDescription>
              </div>
              <Button variant="outline" size="sm" className="rounded-xl h-10 gap-2 font-bold" onClick={() => handleGenerateReport('Financial Matrix')}>
                <Download className="w-4 h-4" /> Export Matrix
              </Button>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader className="bg-accent/10 uppercase text-[10px] font-black">
                  <TableRow>
                    <TableHead className="pl-8 py-4">Class Level</TableHead>
                    <TableHead className="text-center">Collected</TableHead>
                    <TableHead className="text-center">Arrears</TableHead>
                    <TableHead className="text-right pr-8">Velocity %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {performanceByClass.map((c) => (
                    <TableRow key={c.name} className="hover:bg-accent/5">
                      <TableCell className="pl-8 font-black text-primary text-sm uppercase">{c.name}</TableCell>
                      <TableCell className="text-center font-black text-primary">{c.revenue}</TableCell>
                      <TableCell className="text-center font-black text-red-600">{c.arrears}</TableCell>
                      <TableCell className="text-right pr-8">
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-xs font-black text-primary">82%</span>
                          <div className="w-20 h-1 bg-accent rounded-full overflow-hidden">
                            <div className="h-full bg-primary" style={{ width: '82%' }} />
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* STAFF STRUCTURE */}
        <TabsContent value="staff" className="space-y-8 animate-in fade-in slide-in-from-bottom-2 mt-0">
          <div className="flex justify-between items-center bg-white p-6 rounded-3xl border shadow-sm">
            <div className="space-y-1">
              <h3 className="text-xl font-black text-primary uppercase">School Staff Structure</h3>
              <p className="text-xs text-muted-foreground">Live breakdown of the staff accounts currently active under this school.</p>
            </div>
            <Button variant="secondary" className="gap-2 rounded-xl h-11" onClick={() => handleGenerateReport('Staff Structure')}>
              <Printer className="w-4 h-4" /> Download Staff Report
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {staffBreakdown.map((item) => (
              <Card key={item.key} className="border-none shadow-xl bg-white rounded-[2.5rem] overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between pb-4">
                  <div>
                    <CardTitle className="text-sm font-black uppercase tracking-widest text-muted-foreground">{item.label}</CardTitle>
                    <CardDescription>{item.detail}</CardDescription>
                  </div>
                  <div className={cn("rounded-2xl p-3 shadow-sm", item.accent)}>
                    <item.icon className="w-5 h-5" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-4xl font-black text-primary">{item.value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="border-none shadow-xl rounded-[2.5rem] bg-white overflow-hidden">
            <CardHeader className="p-8 border-b flex items-center justify-between">
              <div>
                <CardTitle className="text-xl font-black text-primary uppercase">Staff Directory</CardTitle>
                <CardDescription>Every staff account, grouped by role and connected to its current sub-school assignment.</CardDescription>
              </div>
              <Badge variant="outline" className="border-primary/10 px-3 py-1 text-[10px] font-black uppercase text-primary">
                {staffCounts.total} total staff
              </Badge>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {staffDirectory.length === 0 ? (
                <div className="p-10 text-center text-sm text-muted-foreground">
                  No staff accounts are registered for this school yet.
                </div>
              ) : (
                <Table>
                  <TableHeader className="bg-accent/10 uppercase text-[10px] font-black">
                    <TableRow>
                      <TableHead className="pl-8 py-4">Staff Member</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Sub School</TableHead>
                      <TableHead className="text-right pr-8">Contact</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {staffDirectory.map((member) => (
                      <TableRow key={member.id} className="hover:bg-accent/5">
                        <TableCell className="pl-8">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10 border border-primary/10">
                              <AvatarImage src={member.avatar} />
                              <AvatarFallback>{member.name.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-black text-primary uppercase text-xs">{member.name}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="border-primary/10 text-[10px] font-bold uppercase text-primary">
                            {member.roleLabel}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-bold text-primary text-xs uppercase">{member.subSchool}</TableCell>
                        <TableCell className="text-right pr-8 text-xs text-muted-foreground">{member.email}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ATTENDANCE AUDIT */}
        <TabsContent value="attendance" className="space-y-8 animate-in fade-in slide-in-from-bottom-2 mt-0">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <Card className="lg:col-span-8 border-none shadow-xl rounded-[2.5rem] bg-white overflow-hidden">
              <CardHeader className="bg-primary p-8 text-white flex flex-row items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-white/10 rounded-2xl text-secondary"><CheckCircle2 className="w-8 h-8" /></div>
                  <div>
                    <CardTitle className="text-xl font-black uppercase tracking-tight">Attendance Audit</CardTitle>
                    <CardDescription className="text-white/60">Node-wide pedagogical presence analysis.</CardDescription>
                  </div>
                </div>
                <Button variant="ghost" className="text-white hover:bg-white/10 gap-2 font-bold" onClick={() => handleGenerateReport('Presence Audit')}>
                  <Printer className="w-4 h-4" /> Print Log
                </Button>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader className="bg-accent/30 uppercase text-[10px] font-black">
                    <TableRow>
                      <TableHead className="pl-8 py-4">Class Level</TableHead>
                      <TableHead className="text-center">Mean Presence</TableHead>
                      <TableHead className="text-right pr-8">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {performanceByClass.map((c) => (
                      <TableRow key={c.name} className="hover:bg-accent/5">
                        <TableCell className="pl-8 font-black text-primary text-sm uppercase">{c.name}</TableCell>
                        <TableCell className="text-center font-black text-lg">{c.attendance}%</TableCell>
                        <TableCell className="text-right pr-8">
                          <Badge className={cn("text-[8px] font-black border-none h-5 px-2", c.attendance >= 90 ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700")}>
                            {c.attendance >= 90 ? 'OPTIMAL' : 'MONITOR'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <div className="lg:col-span-4 space-y-6">
              <Card className="border-none shadow-sm rounded-[2rem] bg-red-50 p-8 space-y-6">
                <div className="flex items-center justify-between border-b border-red-100 pb-2">
                  <h4 className="text-sm font-black text-red-900 uppercase">Alerts</h4>
                  <Smartphone className="w-4 h-4 text-red-400" />
                </div>
                <div className="space-y-3">
                  {attendanceAlerts.map((a, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-white/50 rounded-xl border border-red-100">
                      <div>
                        <p className="text-xs font-black text-primary uppercase">{a.className}</p>
                        <p className="text-[9px] font-bold text-muted-foreground uppercase">{a.class} • {a.rate}%</p>
                      </div>
                      <Badge variant="destructive" className="text-[8px] h-5 px-2">{a.status}</Badge>
                    </div>
                  ))}
                </div>
                <Button className="w-full h-11 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold gap-2">
                  <Smartphone className="w-4 h-4" /> Notify Guardians
                </Button>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* STRATEGIC DOSSIER DIALOG (PDF DEMO) */}
      <Dialog open={!!previewReport} onOpenChange={() => setPreviewReport(null)}>
        <DialogContent className="sm:max-w-5xl max-h-[95vh] p-0 border-none shadow-2xl rounded-[2.5rem] overflow-hidden flex flex-col">
          <DialogHeader className="bg-primary p-8 text-white no-print shrink-0 relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-white/10 rounded-2xl text-secondary"><FileText className="w-8 h-8" /></div>
                <div>
                  <DialogTitle className="text-2xl font-black uppercase tracking-tight">{previewReport?.title}</DialogTitle>
                  <DialogDescription className="text-white/60">Verified institutional data dossier • {previewReport?.date}</DialogDescription>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setPreviewReport(null)} className="text-white/40 hover:text-white"><X className="w-6 h-6" /></Button>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto bg-muted p-4 md:p-10 print:p-0 print:bg-white no-scrollbar">
            <div id="printable-strategic-audit" className="bg-white p-8 md:p-16 border-2 border-black/10 shadow-sm relative flex flex-col space-y-12 font-serif text-black print:border-none print:shadow-none min-w-[800px] mx-auto">
               
               <div className="grid grid-cols-3 gap-2 items-start text-center border-b-2 border-black pb-6">
                  <div className="space-y-0.5 text-[8px] uppercase font-bold">
                    <p>Republic of Cameroon</p>
                    <p>Peace - Work - Fatherland</p>
                    <div className="h-px bg-black w-10 mx-auto my-1" />
                    <p>Ministry of Secondary Education</p>
                  </div>
                  <div className="flex flex-col items-center">
                    {user?.school?.logo ? <img src={user.school.logo} alt="School" className="w-20 h-20 object-contain" /> : null}
                  </div>
                  <div className="space-y-0.5 text-[8px] uppercase font-bold">
                    <p>République du Cameroun</p>
                    <p>Paix - Travail - Patrie</p>
                    <div className="h-px bg-black w-10 mx-auto my-1" />
                    <p>Min. des Enseignements Secondaires</p>
                  </div>
               </div>

               <div className="text-center space-y-2">
                  <h2 className="font-black text-2xl md:text-3xl uppercase tracking-tighter text-primary leading-tight">{user?.school?.name || "INSTITUTIONAL NODE"}</h2>
                  <p className="text-[10px] md:text-xs font-bold uppercase opacity-60 tracking-[0.3em] underline underline-offset-4 decoration-double">STRATEGIC DOSSIER: {previewReport?.scope}</p>
               </div>

               <div className="grid grid-cols-2 gap-12 pt-4">
                  <section className="space-y-4">
                    <h4 className="text-xs font-black uppercase text-primary border-b border-black/10 pb-1 flex items-center gap-2"><Users className="w-4 h-4"/> Global Context</h4>
                    <div className="space-y-3">
                       <div className="flex justify-between text-xs font-bold"><span className="opacity-60">1. Total Enrollment:</span><span>{stats.totalStudents}</span></div>
                       <div className="flex justify-between text-xs font-bold"><span className="opacity-60">2. Staff Strength:</span><span>{stats.staffPresence}</span></div>
                       <div className="flex justify-between text-xs font-bold"><span className="opacity-60">3. Growth Index:</span><span className="text-green-600">{stats.growthIndex}</span></div>
                       <div className="flex justify-between text-xs font-bold"><span className="opacity-60">4. Global Mean:</span><span>{stats.globalAvg} / 20</span></div>
                       <div className="flex justify-between text-xs font-bold"><span className="opacity-60">5. Success Rate:</span><span className="text-green-600 font-black">{stats.passRate}</span></div>
                    </div>
                  </section>

                  <section className="space-y-4">
                    <h4 className="text-xs font-black uppercase text-primary border-b border-black/10 pb-1 flex items-center gap-2"><Coins className="w-4 h-4"/> Financial Matrix</h4>
                    <div className="space-y-3">
                       <div className="flex justify-between text-xs font-bold"><span className="opacity-60">6. Collected Intake:</span><span>{stats.totalRevenue} XAF</span></div>
                       <div className="flex justify-between text-xs font-bold"><span className="opacity-60">7. Active Arrears:</span><span className="text-red-600">{stats.totalArrears} XAF</span></div>
                       <div className="flex justify-between text-xs font-bold"><span className="opacity-60">8. Target Velocity:</span><span>{stats.collectionRate}</span></div>
                       <div className="flex justify-between text-xs font-bold"><span className="opacity-60">9. Avg Fee/Student:</span><span>{stats.avgFeePerStudent}</span></div>
                       <div className="flex justify-between text-xs font-bold"><span className="opacity-60">10. Node Security:</span><span className="text-green-600">VERIFIED</span></div>
                    </div>
                  </section>
               </div>

               <section className="pt-8 border-t border-black/5">
                  <h4 className="text-xs font-black uppercase text-primary border-b border-black/10 pb-1 mb-4">Class Level Performance Audit</h4>
                  <Table className="border-collapse border-2 border-black/5">
                    <TableHeader className="bg-black/5">
                       <TableRow>
                          <TableHead className="text-[10px] font-black uppercase text-black">Class Stream</TableHead>
                          <TableHead className="text-center text-[10px] font-black uppercase text-black">Average</TableHead>
                          <TableHead className="text-center text-[10px] font-black uppercase text-black">Revenue (XAF)</TableHead>
                          <TableHead className="text-right text-[10px] font-black uppercase text-black pr-6">Presence %</TableHead>
                       </TableRow>
                    </TableHeader>
                    <TableBody>
                       {performanceByClass.map((c, i) => (
                         <TableRow key={i} className="border-b border-black/5">
                            <TableCell className="font-black text-xs uppercase">{c.name}</TableCell>
                            <TableCell className="text-center font-bold text-xs">{c.average}</TableCell>
                            <TableCell className="text-center font-bold text-xs">{c.revenue}</TableCell>
                            <TableCell className="text-right pr-6 font-black text-sm text-primary">{c.attendance}%</TableCell>
                         </TableRow>
                       ))}
                    </TableBody>
                  </Table>
               </section>

               <div className="pt-12 border-t border-black/5 flex justify-between items-end">
                  <div className="flex flex-col items-center gap-2 text-center">
                    <QrCode className="w-20 h-20 opacity-10" />
                    <p className="text-[8px] font-black uppercase text-muted-foreground opacity-40 leading-tight">Institutional<br/>Strategic Data QR</p>
                  </div>
                  <div className="text-center space-y-6 w-48">
                    <div className="h-14 w-full mx-auto bg-primary/5 rounded-xl border-b-2 border-black/40 relative flex items-center justify-center overflow-hidden shadow-inner">
                       <SignatureSVG className="w-full h-full text-primary/20 p-2" />
                    </div>
                    <p className="text-[10px] font-black uppercase text-primary tracking-widest leading-none">The Principal</p>
                  </div>
               </div>

               <div className="text-center pt-6 border-t border-black/5">
                  <div className="flex items-center justify-center gap-3">
                    <img src={platformLogo} alt="EduIgnite logo" className="w-4 h-4 object-contain opacity-20" />
                    <p className="text-[8px] font-black uppercase text-muted-foreground opacity-30 tracking-[0.4em]">
                      Verified Strategic Intelligence • Secure Node Record • {new Date().getFullYear()}
                    </p>
                  </div>
               </div>
            </div>
          </div>

          <DialogFooter className="bg-accent/10 p-8 border-t no-print flex flex-col sm:flex-row gap-4 shrink-0">
            <Button variant="outline" className="flex-1 rounded-2xl h-14 font-black uppercase tracking-widest text-xs" onClick={() => setPreviewReport(null)}>
              Dismiss Audit
            </Button>
            <Button 
              className="flex-1 rounded-2xl h-14 shadow-2xl font-black uppercase tracking-widest text-xs gap-3 bg-primary text-white hover:bg-primary/90 transition-all active:scale-95" 
              onClick={() => { window.print(); setPreviewReport(null); }}
            >
              <Printer className="w-4 h-4" /> Finalize & Print Dossier
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SignatureSVG({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 40" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 25C15 25 20 15 25 15C30 15 35 30 40 30C45 30 50 10 55 10C60 10 65 35 70 35C75 35 80 20 85 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M15 30L85 10" stroke="currentColor" strokeWidth="1" strokeOpacity="0.3" strokeDasharray="2 2" />
    </svg>
  );
}
