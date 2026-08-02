"use client";

import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useGrades, useAnnualResults } from "@/lib/hooks/useGrades";
import { useAttendanceSummary, useMyAttendance } from "@/lib/hooks/useAttendance";
import { useMyLoans } from "@/lib/hooks/useLibrary";
import { useMyStudentProfile } from "@/lib/hooks/useStudents";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Award, ClipboardCheck, ListChecks, BookMarked, ShieldCheck, TrendingUp, BookOpen, Activity, Zap, ChevronRight, Sparkles, Clock, Building2, Hash } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import Link from "next/link";

export function StudentDashboard() {
  const { user } = useAuth();
  const { data: gradesResp } = useGrades();
  const { data: annualResp } = useAnnualResults();
  const { data: attendanceResp } = useMyAttendance();
  const { data: attendanceSummary } = useAttendanceSummary();
  const { data: myLoansResp } = useMyLoans();
  const { data: studentProfile } = useMyStudentProfile();

  const annualAvg = user?.annual_avg ?? annualResp?.results?.[0]?.annual_average ?? 0;
  const annualAvgDisplay = Number(annualAvg).toFixed(2);
  const attendanceRecords = attendanceResp?.results ?? [];
  const presentAttendance = attendanceRecords.filter((record: any) => ["present", "late", "Present", "Late"].includes(record.status)).length;
  const attendanceRate = Number.isFinite(Number(attendanceSummary?.attendance_percentage))
    ? Math.round(Number(attendanceSummary?.attendance_percentage))
    : attendanceRecords.length ? Math.round((presentAttendance / attendanceRecords.length) * 100) : 0;
  const attendanceTotal = Number(attendanceSummary?.total_records ?? attendanceRecords.length);
  const attendancePresent = Number((attendanceSummary?.present ?? 0) + (attendanceSummary?.late ?? 0)) || presentAttendance;
  const activeLoans = myLoansResp?.results ?? [];
  const grades = gradesResp?.results ?? [];
  const profile = studentProfile as any;
  // A learner who finished the final class has left it, so the account says
  // "Graduated" rather than keeping them in the class they completed.
  const hasGraduated = Boolean(profile?.is_graduated);
  const enrolledClassName =
    profile?.school_class_name ||
    profile?.student_class ||
    (user as any)?.class ||
    (user as any)?.student_class ||
    "Class not assigned";
  const currentClassName = hasGraduated ? "Graduated" : enrolledClassName;
  const currentSubSchoolName =
    profile?.sub_school_name ||
    profile?.school_class?.sub_school?.name ||
    (user as any)?.sub_school_name ||
    "Main school";
  const admissionNumber = profile?.admission_number || "Pending";
  const studentMatricule = profile?.user?.matricule || user?.matricule || admissionNumber || user?.id;

  const recentResults = grades.slice(0, 5).map((grade) => ({
    subject: grade.subject.name,
    score: grade.score,
    coefficient: grade.subject.coefficient,
    comment: grade.comment,
    date: new Date(grade.created_at).toLocaleDateString(),
  }));

  const subjectPerf = Object.entries(
    grades.reduce((acc, grade) => {
      const name = grade.subject.name;
      if (!acc[name]) acc[name] = { total: 0, count: 0 };
      acc[name].total += Number(grade.score);
      acc[name].count += 1;
      return acc;
    }, {} as Record<string, { total: number; count: number }>)
  ).map(([subject, data]) => ({
    name: subject,
    score: parseFloat((data.total / data.count).toFixed(1)),
  }));

  const performanceTimeline = grades
    .slice()
    .reverse()
    .slice(-8)
    .map((grade, index) => ({
      name: grade.sequence?.name || `Mark ${index + 1}`,
      performance: Number(grade.score),
    }));

  const learningSnapshot = useMemo(
    () => [
      {
        title: "Latest Evaluated Subject",
        value: recentResults[0]?.subject || "No marks yet",
        detail: recentResults[0] ? `${recentResults[0].score}/20 recorded on ${recentResults[0].date}` : "Marks will appear here once teachers enter results.",
        icon: Sparkles,
      },
      {
        title: "Attendance Standing",
        value: `${attendanceRate}%`,
        detail: attendanceTotal
          ? `${attendancePresent} attended sessions out of ${attendanceTotal}.`
          : "Attendance history has not been recorded yet.",
        icon: ClipboardCheck,
      },
      {
        title: "Library Status",
        value: `${activeLoans.length} active`,
        detail: activeLoans.length
          ? `Next return date: ${new Date(activeLoans[0].due_date).toLocaleDateString()}`
          : "No active library loans are linked to your account.",
        icon: BookMarked,
      },
      {
        title: "Academic Standing",
        value: annualAvg > 0 ? `${annualAvgDisplay}/20` : "Pending",
        detail: annualResp?.results?.[0]?.is_on_honour_roll
          ? "You are currently on the honour roll."
          : "Your annual standing updates as grades are recorded.",
        icon: Activity,
      },
    ],
    [activeLoans, annualAvg, annualAvgDisplay, annualResp?.results, attendancePresent, attendanceRate, attendanceRecords.length, attendanceTotal, recentResults]
  );

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4 sm:items-center">
          <Avatar className="h-16 w-16 shrink-0 border-4 border-white shadow-xl ring-4 ring-primary/5 md:h-20 md:w-20">
            <AvatarImage src={user?.avatar} alt={user?.name} />
            <AvatarFallback className="bg-primary/5 text-2xl font-black text-primary">{user?.name?.charAt(0)}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="font-headline text-2xl font-bold uppercase leading-tight tracking-tighter text-primary sm:text-3xl">Welcome, {user?.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge className="h-5 border-primary/10 bg-primary/5 px-3 text-[10px] font-black uppercase tracking-widest text-primary">
                {currentClassName}
              </Badge>
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground">
                Matricule: {studentMatricule}
              </span>
            </div>
          </div>
        </div>
        <div className="flex w-full items-center gap-3 rounded-xl border border-green-100 bg-green-50 px-4 py-2 shadow-sm sm:w-fit">
          <ShieldCheck className="h-5 w-5 text-green-600" />
          <p className="text-xs font-bold text-green-700">Student Node Active</p>
        </div>
      </div>

      <Card className="overflow-hidden border-none bg-gradient-to-r from-primary via-primary to-primary/90 text-white shadow-xl">
        <CardContent className="grid gap-4 p-5 sm:grid-cols-3 sm:p-6">
          <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
            <div className="flex items-center gap-3">
              <BookOpen className="h-5 w-5 text-secondary" />
              <p className="text-[10px] font-black uppercase tracking-widest text-white/70">
                {hasGraduated ? "Standing" : "Current Class"}
              </p>
            </div>
            <p className="mt-3 text-2xl font-black leading-tight">{currentClassName}</p>
            {hasGraduated ? (
              <p className="mt-1 text-[11px] font-semibold text-white/60">
                Completed {enrolledClassName}
              </p>
            ) : null}
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-secondary" />
              <p className="text-[10px] font-black uppercase tracking-widest text-white/70">Sub-School</p>
            </div>
            <p className="mt-3 text-2xl font-black leading-tight">{currentSubSchoolName}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
            <div className="flex items-center gap-3">
              <Hash className="h-5 w-5 text-secondary" />
              <p className="text-[10px] font-black uppercase tracking-widest text-white/70">Admission No.</p>
            </div>
            <p className="mt-3 text-2xl font-black leading-tight">{admissionNumber}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Term Average", value: `${annualAvgDisplay} / 20`, icon: Award, color: "text-amber-600", bg: "bg-amber-50" },
          { label: "Attendance Integrity", value: `${attendanceRate}%`, icon: ClipboardCheck, color: "text-purple-600", bg: "bg-purple-50" },
          { label: "Results Recorded", value: `${grades.length} Marks`, icon: ListChecks, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Library Loans", value: `${activeLoans.length} Volumes`, icon: BookMarked, color: "text-emerald-600", bg: "bg-emerald-50" },
        ].map((stat) => (
          <Card key={stat.label} className="group border-none shadow-sm transition-all hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{stat.label}</CardTitle>
              <div className={cn("rounded-lg p-2", stat.bg)}>
                <stat.icon className={cn("h-4 w-4", stat.color)} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-primary">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <Card className="overflow-hidden rounded-[2rem] border-none bg-white shadow-xl sm:rounded-[2.5rem] lg:col-span-8">
          <CardHeader className="flex flex-col gap-4 border-b bg-primary/5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl font-black uppercase tracking-tighter text-primary">
                <TrendingUp className="h-5 w-5 text-secondary" /> Performance Velocity
              </CardTitle>
              <CardDescription>Your real recorded marks over time, based on the latest grade entries.</CardDescription>
            </div>
            <Badge variant="outline" className="border-primary/10 px-3 text-[9px] font-bold uppercase text-primary">VERIFIED RECORDS</Badge>
          </CardHeader>
          <CardContent className="h-[300px] pt-6 sm:h-[350px] sm:pt-10">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={performanceTimeline.length ? performanceTimeline : [{ name: "No Data", performance: 0 }]}>
                <defs>
                  <linearGradient id="colorStudentPerf" x1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#264D73" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#264D73" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: "bold" }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                <RechartsTooltip contentStyle={{ borderRadius: "1rem", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }} />
                <Area name="Recorded Score" type="monotone" dataKey="performance" stroke="#264D73" strokeWidth={4} fill="url(#colorStudentPerf)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="flex flex-col overflow-hidden rounded-[2rem] border-none bg-primary text-white shadow-xl sm:rounded-[2.5rem] lg:col-span-4">
          <CardHeader className="p-5 sm:p-8">
            <CardTitle className="flex items-center gap-2 text-xl font-black uppercase tracking-tight">
              <BookOpen className="h-5 w-5 text-secondary" />
              Subject Proficiency
            </CardTitle>
            <CardDescription className="text-white/60">Average subject performance from your real marks.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 pt-6 sm:pt-10">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={subjectPerf.length ? subjectPerf : [{ name: "No Data", score: 0 }]}>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: "bold", fill: "#fff" }} />
                <YAxis hide />
                <RechartsTooltip />
                <Bar dataKey="score" radius={[10, 10, 0, 0]} barSize={20} fill="#67D0E4" />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-6 space-y-3">
              {subjectPerf.slice(0, 3).map((item) => (
                <div key={item.name} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/10 p-3">
                  <span className="text-[10px] font-black uppercase tracking-widest">{item.name}</span>
                  <Badge className="border-none bg-secondary font-black text-primary">{item.score}</Badge>
                </div>
              ))}
              {!subjectPerf.length ? <p className="text-sm text-white/60">Subject averages will appear once marks are entered.</p> : null}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <Card className="overflow-hidden rounded-[2rem] border-none bg-white shadow-xl lg:col-span-7">
          <CardHeader className="flex flex-col gap-3 border-b bg-white p-5 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg font-black uppercase text-primary">
                <Clock className="h-5 w-5 text-secondary" />
                Learning Snapshot
              </CardTitle>
              <CardDescription>Live academic status built from your real records, not a placeholder timetable.</CardDescription>
            </div>
            <Badge className="h-7 border-none bg-secondary px-4 font-black text-primary">LIVE STATUS</Badge>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableBody>
                {learningSnapshot.map((item) => (
                  <TableRow key={item.title} className="h-16 border-b transition-colors last:border-0 hover:bg-primary/5">
                    <TableCell className="py-4 pl-8">
                      <div className="flex items-center gap-4">
                        <div className="rounded-xl bg-accent/30 p-2.5 text-primary">
                          <item.icon className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-xs font-black uppercase text-primary">{item.title}</p>
                          <p className="text-[10px] font-bold text-muted-foreground">{item.detail}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="pr-8 text-right text-xs font-black uppercase text-primary">{item.value}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-[2rem] border-none bg-white shadow-xl sm:rounded-[2.5rem] lg:col-span-5">
          <CardHeader className="flex flex-col gap-3 border-b bg-white p-5 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg font-black uppercase text-primary">
                <Zap className="h-5 w-5 text-secondary" />
                Recent Results
              </CardTitle>
              <CardDescription>Latest marks registered in your dossier.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableBody>
                {recentResults.map((result, index) => (
                  <TableRow key={`${result.subject}-${index}`} className="h-16 border-b hover:bg-primary/5 last:border-0">
                    <TableCell className="pl-8">
                      <div className="space-y-0.5">
                        <p className="text-[11px] font-black uppercase leading-none text-primary">{result.subject}</p>
                        <p className="text-[9px] font-bold uppercase text-muted-foreground">{result.date}</p>
                      </div>
                    </TableCell>
                    <TableCell className="pr-8 text-right">
                      <div className="flex flex-col items-end">
                        <span className="text-sm font-black text-primary">
                          {result.score} <span className="text-[10px] opacity-40">/ 20</span>
                        </span>
                        <span className="text-[8px] font-bold uppercase text-secondary">{result.comment ? "Reviewed" : "Pending"}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!recentResults.length ? (
                  <TableRow>
                    <TableCell colSpan={2} className="h-20 text-center text-sm text-muted-foreground">
                      Results will appear here as teachers publish your marks.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
          <CardFooter className="flex justify-center border-t bg-accent/10 p-4">
            <Button asChild variant="ghost" className="gap-2 text-[10px] font-black uppercase transition-all hover:bg-white">
              <Link href="/dashboard/grades">Access Full Report Card <ChevronRight className="h-3.5 w-3.5" /></Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
