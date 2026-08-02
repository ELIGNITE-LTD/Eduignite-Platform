"use client";

import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { GraduationCap, Users, Coins, ShieldCheck, TrendingUp, FileDown } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { useMySchool } from "@/lib/hooks/useSchools";
import { useStudentRegistrySummary, useStudents } from "@/lib/hooks/useStudents";
import { useUsersBySchool } from "@/lib/hooks/useUsers";
import { useAttendanceRecords, useAttendanceSummary } from "@/lib/hooks/useAttendance";
import { useSchoolFeeSummary, useStudentSchoolFees } from "@/lib/hooks/useFees";
import { useClassStatistics } from "@/lib/hooks/useGrades";
import { resolveMediaUrl } from "@/lib/media";
import { normalizeList } from "@/lib/dashboard-adapters";

function formatMoney(value: number | string | undefined) {
  return `XAF ${Number(value || 0).toLocaleString()}`;
}

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function AdminDashboard() {
  const { user } = useAuth();
  const { data: schoolProfile, isLoading: schoolProfileLoading } = useMySchool();
  const schoolId = schoolProfile?.id || user?.school?.id || "";
  const { data: studentsResp, isLoading: studentsLoading } = useStudents({ page_size: 500 });
  const { data: registrySummary, isLoading: registrySummaryLoading } = useStudentRegistrySummary();
  const { data: staffResp, isLoading: staffLoading } = useUsersBySchool(schoolId, {
    role: "SCHOOL_ADMIN,SUB_ADMIN,TEACHER,BURSAR,LIBRARIAN",
    page_size: 500,
  });
  const { data: attendanceResp, isLoading: attendanceLoading } = useAttendanceRecords({ limit: 500 });
  const { data: attendanceSummary } = useAttendanceSummary();
  const { data: schoolFeeSummary } = useSchoolFeeSummary();
  const { data: schoolFeeRecordsResp } = useStudentSchoolFees({ page_size: 20 });
  const { data: classStatsResp, isLoading: classStatsLoading } = useClassStatistics(undefined, Boolean(schoolId));

  const studentRows = normalizeList(studentsResp);
  const staffRows = normalizeList(staffResp);
  const attendanceRows = attendanceResp?.results ?? [];
  const attendanceClassSummary = Array.isArray(attendanceSummary?.class_summary) ? attendanceSummary.class_summary : [];
  const schoolFeeRecords = schoolFeeRecordsResp?.results ?? [];
  const gradeClassRows = Array.isArray(classStatsResp?.classes) ? classStatsResp.classes : [];

  const totalStudents = Math.max(
    toNumber(registrySummary?.active_enrollment),
    toNumber(registrySummary?.student_profiles),
    studentsResp?.count ?? 0,
    studentRows.length,
    toNumber(schoolProfile?.student_count)
  );
  const totalStaff = Math.max(
    staffResp?.count ?? 0,
    staffRows.length,
    toNumber(schoolProfile?.teacher_count)
  );

  const attendanceByClass = attendanceRows.reduce((acc: Record<string, { present: number; total: number }>, record) => {
    const className = record.student?.student_class || "Unassigned";
    if (!acc[className]) {
      acc[className] = { present: 0, total: 0 };
    }
    acc[className].total += 1;
    if (["Present", "Late", "present", "late"].includes(record.status)) {
      acc[className].present += 1;
    }
    return acc;
  }, {});

  const classSummary = useMemo(
    () => {
      if (gradeClassRows.length) {
        return gradeClassRows
          .map((row) => {
            const students = Number(row.students ?? row.student_count ?? 0);
            const average = Number(row.averageMark ?? row.average_mark ?? 0);
            return {
              className: row.name,
              students,
              average: Number(average.toFixed(2)),
          attendance: attendanceClassSummary.find((item) => item.class_name === row.name)?.attendance_percentage ?? (attendanceByClass[row.name]?.total
            ? Math.round((attendanceByClass[row.name].present / attendanceByClass[row.name].total) * 100)
            : 0),
              enrollmentShare: totalStudents ? Math.round((students / totalStudents) * 100) : 0,
              teachers: Number(row.teachers ?? row.teacher_count ?? 0),
              performance: Number(row.performance ?? 0),
              passRate: Number(row.pass_rate ?? row.passRate ?? 0),
            };
          })
          .sort((left, right) => right.average - left.average);
      }

      return Object.values(
        studentRows.reduce((acc: Record<string, { className: string; students: number; averageTotal: number; averageCount: number }>, student) => {
          const className = student.student_class || "Unassigned";
          if (!acc[className]) {
            acc[className] = { className, students: 0, averageTotal: 0, averageCount: 0 };
          }
          acc[className].students += 1;
          const average = Number(student.annual_average ?? 0);
          if (!Number.isNaN(average) && average > 0) {
            acc[className].averageTotal += average;
            acc[className].averageCount += 1;
          }
          return acc;
        }, {})
      )
        .map((row) => ({
          className: row.className,
          students: row.students,
          average: row.averageCount ? Number((row.averageTotal / row.averageCount).toFixed(2)) : 0,
          attendance: attendanceClassSummary.find((item) => item.class_name === row.className)?.attendance_percentage ?? (attendanceByClass[row.className]?.total
            ? Math.round((attendanceByClass[row.className].present / attendanceByClass[row.className].total) * 100)
            : 0),
          enrollmentShare: totalStudents ? Math.round((row.students / totalStudents) * 100) : 0,
        }))
        .sort((left, right) => right.students - left.students);
    },
    [attendanceByClass, attendanceClassSummary, gradeClassRows, studentRows, totalStudents]
  );

  const performanceSeries = classSummary.slice(0, 8).map((row) => ({
    name: row.className,
    performance: row.average,
  }));

  const governanceLogs = [
    ...studentRows.slice(0, 3).map((student) => ({
      action: "Student admitted",
      actor: student.user?.name || student.admission_number,
      time: student.admission_date || "Recent",
      status: "Success",
    })),
    ...schoolFeeRecords.slice(0, 2).map((record) => ({
      action: "School fee updated",
      actor: record.student_name || record.student_matricule || "Learner",
      time: record.last_recorded_at || record.modified || "Recent",
      status: "Success",
    })),
  ].slice(0, 5);

  const totalRevenue = Number(schoolFeeSummary?.school_totals?.total_collected || 0);
  const averageAttendance =
    Number.isFinite(Number(attendanceSummary?.attendance_percentage))
      ? Math.round(Number(attendanceSummary?.attendance_percentage))
      : classSummary.length > 0
      ? Math.round(classSummary.reduce((sum, row) => sum + row.attendance, 0) / classSummary.length)
      : 0;
  const statsLoading = studentsLoading || staffLoading || registrySummaryLoading || schoolProfileLoading || classStatsLoading;
  const schoolName = schoolProfile?.name || user?.school?.name || "Institution Dashboard";
  const principalName = schoolProfile?.principal || user?.school?.principal || "School Leadership";
  const schoolLogo = resolveMediaUrl(schoolProfile?.logo || user?.school?.logo) || "";

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4 sm:items-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-[1.5rem] border-4 border-white bg-primary p-3 shadow-xl">
            {schoolLogo ? (
              <img src={schoolLogo} alt="School" className="h-full w-full object-contain" />
            ) : null}
          </div>
          <div>
            <h1 className="font-headline text-2xl font-bold uppercase leading-tight tracking-tighter text-primary sm:text-3xl">
              {schoolName}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge className="h-5 border-none bg-secondary px-3 text-[9px] font-black uppercase tracking-widest text-primary">Admin Node</Badge>
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">• Principal: {principalName}</span>
            </div>
          </div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row md:w-auto">
          <Button variant="outline" className="h-11 w-full gap-2 rounded-xl border-primary/10 bg-white px-6 font-bold shadow-sm sm:w-auto">
            <FileDown className="h-4 w-4 text-primary" /> Reports
          </Button>
          <Button className="h-11 w-full gap-2 rounded-xl px-8 text-[10px] font-black uppercase tracking-widest shadow-xl sm:w-auto">
            <ShieldCheck className="h-4 w-4" /> Verify Node
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Active Enrollment", value: totalStudents, isLoading: statsLoading, icon: GraduationCap, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Staff Registry", value: totalStaff, isLoading: statsLoading, icon: Users, color: "text-purple-600", bg: "bg-purple-50" },
          { label: "Total Revenue", value: formatMoney(totalRevenue), isLoading: false, icon: Coins, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Attendance Health", value: `${averageAttendance}%`, isLoading: attendanceLoading, icon: ShieldCheck, color: "text-primary", bg: "bg-primary/5" },
        ].map((stat) => (
          <Card key={stat.label} className="group border-none shadow-sm transition-all hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{stat.label}</CardTitle>
              <div className={cn("rounded-lg p-2", stat.bg)}>
                <stat.icon className={cn("h-4 w-4", stat.color)} />
              </div>
            </CardHeader>
            <CardContent>
              {stat.isLoading ? (
                <div className="h-8 w-20 animate-pulse rounded bg-gray-200" />
              ) : (
                <div className="text-2xl font-black text-primary">{typeof stat.value === "number" ? stat.value.toLocaleString() : stat.value}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <Card className="overflow-hidden rounded-[2rem] border-none bg-white shadow-xl sm:rounded-[2.5rem] lg:col-span-8">
          <CardHeader className="flex flex-col gap-4 border-b bg-primary/5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl font-black uppercase tracking-tighter text-primary">
                <TrendingUp className="h-5 w-5 text-secondary" /> Pedagogical Performance
              </CardTitle>
              <CardDescription>Average annual performance from the real student records grouped by class.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="h-[300px] pt-6 sm:h-[350px] sm:pt-10">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={performanceSeries}>
                <defs>
                  <linearGradient id="colorAdminPerf" x1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#264D73" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#264D73" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: "bold" }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                <RechartsTooltip contentStyle={{ borderRadius: "1rem", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }} />
                <Area name="Average Score" type="monotone" dataKey="performance" stroke="#264D73" strokeWidth={4} fill="url(#colorAdminPerf)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="flex flex-col overflow-hidden rounded-[2rem] border-none bg-white shadow-xl sm:rounded-[2.5rem] lg:col-span-4">
          <CardHeader className="bg-primary p-5 text-white sm:p-8">
            <CardTitle className="flex items-center gap-2 text-xl font-black uppercase tracking-tight">
              <ShieldCheck className="h-5 w-5 text-secondary" />
              Governance Log
            </CardTitle>
            <CardDescription className="text-white/60">Recent administrative actions.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            {governanceLogs.length ? (
              governanceLogs.map((log, index) => (
                <div key={`${log.action}-${index}`} className="flex items-center justify-between border-b p-6 transition-colors last:border-0 hover:bg-accent/10">
                  <div className="space-y-1">
                    <p className="text-xs font-black uppercase text-primary">{log.action}</p>
                    <p className="text-[10px] font-bold text-muted-foreground">{log.actor} • {log.time}</p>
                  </div>
                  <Badge className={cn("h-5 border-none px-2 text-[8px] font-black uppercase", log.status === "Success" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700")}>
                    {log.status}
                  </Badge>
                </div>
              ))
            ) : (
              <div className="p-6 text-sm text-muted-foreground">Governance activity will appear here as admissions, billing, and staff actions happen.</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden rounded-[2rem] border-none bg-white shadow-xl sm:rounded-[2.5rem]">
        <CardHeader className="border-b bg-white p-5 sm:p-8">
          <CardTitle className="flex items-center gap-2 text-xl font-black uppercase tracking-tighter text-primary">
            <GraduationCap className="h-5 w-5 text-secondary" />
            Academic Stream Summary
          </CardTitle>
          <CardDescription>Live class enrollment, performance, attendance, and school share distribution.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-accent/10 text-[9px] font-black uppercase tracking-widest">
              <TableRow>
                <TableHead className="py-4 pl-8">Class</TableHead>
                <TableHead className="text-center">Students</TableHead>
                <TableHead className="text-center">Average</TableHead>
                <TableHead className="text-center">Attendance</TableHead>
                <TableHead className="pr-8 text-right">Enrollment Share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {classSummary.map((row) => (
                <TableRow key={row.className} className="h-16 border-b transition-colors last:border-0 hover:bg-primary/5">
                  <TableCell className="pl-8 text-xs font-black uppercase text-primary">{row.className}</TableCell>
                  <TableCell className="text-center text-sm font-bold">{row.students}</TableCell>
                  <TableCell className="text-center">
                    <Badge className={cn("border-none text-[10px] font-black", row.average >= 15 ? "bg-green-100 text-green-700" : row.average >= 12 ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700")}>
                      {row.average}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center text-sm font-bold">{row.attendance}%</TableCell>
                  <TableCell className="pr-8 text-right">
                    <Progress value={row.enrollmentShare} className="ml-auto h-1.5 w-20" />
                    <span className="mt-1 block text-[9px] font-black text-muted-foreground">{row.enrollmentShare}%</span>
                  </TableCell>
                </TableRow>
              ))}
              {!classSummary.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-20 text-center text-sm text-muted-foreground">
                    Class metrics will appear here once students are registered and activity is recorded.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
