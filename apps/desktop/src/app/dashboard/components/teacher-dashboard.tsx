"use client";

import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Users, Activity, ShieldCheck, TrendingUp, LayoutGrid, ListChecks, BookOpen, Award, Download, FileBadge, Signature as SignatureIcon, ClipboardCheck, Clock } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useStudents } from "@/lib/hooks/useStudents";
import { useGrades } from "@/lib/hooks/useGrades";
import { useAttendanceSessions, useAttendanceSummary } from "@/lib/hooks/useAttendance";
import { staffRemarksService } from "@/lib/api/services/staff-remarks.service";
import { getApiErrorMessage } from "@/lib/api/errors";
import { downloadBlob } from "@/lib/browser-download";

export function TeacherDashboard() {
  const { user, staffRemarks } = useAuth();
  const { toast } = useToast();
  const { data: studentsResp, isLoading: studentsLoading } = useStudents();
  const { data: gradesResp, isLoading: gradesLoading } = useGrades();
  const { data: sessionsResp, isLoading: sessionsLoading } = useAttendanceSessions();
  const { data: attendanceSummary } = useAttendanceSummary();

  const myRemarks = useMemo(() => staffRemarks.filter((remark) => remark.staffId === user?.id), [staffRemarks, user?.id]);

  const totalStudents = studentsResp?.count ?? 0;
  const grades = gradesResp?.results ?? [];
  const sessions = sessionsResp?.results ?? [];
  const totalGradesEntered = gradesResp?.count ?? grades.length;
  const totalSessionsHeld = Number(attendanceSummary?.sessions_count ?? sessionsResp?.count ?? sessions.length);
  const attendanceRate = Number(attendanceSummary?.attendance_percentage ?? 0);

  const classData = useMemo(() => {
    const grouped = grades.reduce((acc, grade: any) => {
      const className = grade.student_class || grade.student?.student_class || "Unassigned";
      if (!acc[className]) acc[className] = { total: 0, count: 0 };
      acc[className].total += Number(grade.score || 0);
      acc[className].count += 1;
      return acc;
    }, {} as Record<string, { total: number; count: number }>);

    return Object.entries(grouped)
      .map(([name, values]) => ({
        name,
        average: parseFloat((values.total / values.count).toFixed(1)),
      }))
      .sort((a, b) => b.average - a.average);
  }, [grades]);

  const performanceTimeline = grades
    .slice()
    .reverse()
    .slice(-8)
    .map((grade: any, index) => ({
      name: grade.sequence?.name || `Entry ${index + 1}`,
      performance: Number(grade.score || 0),
    }));

  const operationsSnapshot = useMemo(
    () => [
      {
        title: "Latest Grade Entry",
        value: grades[0]?.subject?.name || "No marks yet",
        detail: grades[0]
          ? `${grades[0].score}/20 for ${grades[0].student?.user?.name || "student"}`
          : "Grade activity will appear here once marks are entered.",
        icon: ListChecks,
      },
      {
        title: "Attendance Registry",
        value: `${totalSessionsHeld} sessions`,
        detail: sessions[0]?.date
          ? `Most recent recorded session: ${new Date(sessions[0].date).toLocaleDateString()} - attendance rate ${attendanceRate}%`
          : "No attendance sessions recorded yet.",
        icon: ClipboardCheck,
      },
      {
        title: "Learner Coverage",
        value: `${totalStudents} students`,
        detail: "This value comes from the real student registry linked to the school.",
        icon: Users,
      },
      {
        title: "Remarks Dossier",
        value: `${myRemarks.length} remarks`,
        detail: myRemarks.length
          ? `Latest by ${myRemarks[0].adminName} on ${myRemarks[0].date}`
          : "No formal administrative remarks in your dossier.",
        icon: Clock,
      },
    ],
    [attendanceRate, grades, myRemarks, sessions, totalSessionsHeld, totalStudents]
  );

  const recentGradeActivity = grades.slice(0, 6).map((grade: any) => ({
    student: grade.student?.user?.name || grade.student || "Student",
    subject: grade.subject?.name || "Subject",
    score: grade.score,
    date: new Date(grade.created_at).toLocaleDateString(),
  }));

  const handleDownloadRemark = async () => {
    if (!user?.id) {
      toast({
        variant: "destructive",
        title: "Download failed",
        description: "Your staff profile is not linked correctly yet.",
      });
      return;
    }

    try {
      const blob = await staffRemarksService.downloadReport(user.id);
      downloadBlob(blob, `${(user.name || "staff").replace(/\s+/g, "_").toLowerCase()}_remarks_report.pdf`);
      toast({ title: "Report downloaded", description: "Your official remarks dossier has been saved." });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Download failed",
        description: getApiErrorMessage(error, "Could not download the official remarks dossier."),
      });
    }
  };

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4 sm:items-center">
          <Avatar className="h-16 w-16 shrink-0 border-4 border-white shadow-xl ring-4 ring-primary/5 md:h-20 md:w-20">
            <AvatarImage src={user?.avatar} alt={user?.name} />
            <AvatarFallback className="bg-primary/5 text-2xl font-black text-primary">{user?.name?.charAt(0)}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl font-bold leading-tight tracking-tighter text-primary sm:text-3xl">Welcome back, {user?.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="h-5 border-none bg-primary/5 px-3 text-[10px] font-black uppercase text-primary">
                Pedagogical Lead
              </Badge>
              {user?.school ? <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">• {user.school.name}</span> : null}
            </div>
          </div>
        </div>
        <div className="flex w-full items-center gap-3 rounded-xl border border-green-100 bg-green-50 px-4 py-2 sm:w-fit">
          <ShieldCheck className="h-5 w-5 text-green-600" />
          <p className="text-xs font-bold text-green-700">Digital Node Sync Active</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total Students", value: totalStudents, isLoading: studentsLoading, icon: Users, color: "text-purple-600", bg: "bg-purple-50" },
          { label: "Grades Entered", value: totalGradesEntered, isLoading: gradesLoading, icon: ListChecks, color: "text-amber-600", bg: "bg-amber-50" },
          { label: "Sessions Held", value: totalSessionsHeld, isLoading: sessionsLoading, icon: Activity, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Admin Remarks", value: `${myRemarks.length} Notes`, isLoading: false, icon: BookOpen, color: "text-blue-600", bg: "bg-blue-50" },
        ].map((stat) => (
          <Card key={stat.label} className="group border-none shadow-sm transition-shadow hover:shadow-md">
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
        <Card className="overflow-hidden rounded-[2rem] border-none bg-white shadow-xl lg:col-span-8">
          <CardHeader className="flex flex-col gap-4 border-b bg-primary/5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl font-black uppercase tracking-tighter text-primary">
                <TrendingUp className="h-5 w-5 text-secondary" /> Performance Velocity
              </CardTitle>
              <CardDescription>Real recent grade scores over the latest recorded entries.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="h-[300px] pt-6 sm:h-[350px] sm:pt-10">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={performanceTimeline.length ? performanceTimeline : [{ name: "No Data", performance: 0 }]}>
                <defs>
                  <linearGradient id="colorPerf" x1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#264D73" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#264D73" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: "bold" }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                <RechartsTooltip contentStyle={{ borderRadius: "1rem", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }} />
                <Area name="Recorded Score" type="monotone" dataKey="performance" stroke="#264D73" strokeWidth={4} fill="url(#colorPerf)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="flex flex-col overflow-hidden rounded-[2rem] border-none bg-white shadow-xl lg:col-span-4">
          <CardHeader className="bg-primary p-5 text-white sm:p-8">
            <CardTitle className="flex items-center gap-2 text-xl font-black uppercase tracking-tight">
              <Activity className="h-5 w-5 text-secondary" />
              Class Performance
            </CardTitle>
            <CardDescription className="text-white/60">Average recorded scores per class.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 pt-6 sm:pt-10">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={classData.length ? classData : [{ name: "No Data", average: 0 }]}>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: "bold" }} />
                <YAxis hide />
                <RechartsTooltip />
                <Bar dataKey="average" radius={[10, 10, 0, 0]} barSize={25} fill="#67D0E4" />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-6 space-y-3">
              {classData.slice(0, 3).map((item) => (
                <div key={item.name} className="flex items-center justify-between rounded-xl border border-accent bg-accent/20 p-3">
                  <span className="text-xs font-bold uppercase text-primary">{item.name}</span>
                  <Badge variant="outline" className="border-primary/10 font-black text-primary">{item.average}</Badge>
                </div>
              ))}
              {!classData.length ? <p className="text-sm text-muted-foreground">Class performance appears once grades exist.</p> : null}
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
                Operational Snapshot
              </CardTitle>
              <CardDescription>Live teaching activity based on actual grades, attendance sessions, and staff records.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableBody>
                {operationsSnapshot.map((item) => (
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

        <Card className="overflow-hidden rounded-[2rem] border-none bg-white shadow-xl lg:col-span-5">
          <CardHeader className="flex flex-col gap-3 bg-secondary/20 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg font-black uppercase text-primary">
                <Award className="h-5 w-5 text-primary" />
                Admin Evaluation
              </CardTitle>
              <CardDescription>Official professional feedback from the principal.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            {myRemarks.length ? (
              <div className="space-y-4">
                {myRemarks.map((remark) => (
                  <div key={remark.id} className="animate-in fade-in zoom-in-95 space-y-4 rounded-2xl border border-accent bg-accent/30 p-6">
                    <p className="text-sm font-medium italic leading-relaxed text-primary">&ldquo;{remark.text}&rdquo;</p>
                    <div className="flex items-center justify-between border-t border-accent/50 pt-4">
                      <div className="flex items-center gap-2">
                        <SignatureIcon className="h-4 w-4 text-primary/40" />
                        <span className="text-[10px] font-black uppercase text-primary/60">{remark.adminName} • {remark.date}</span>
                      </div>
                      <Button variant="ghost" size="sm" className="h-8 gap-2 bg-white text-[10px] font-black uppercase shadow-sm" onClick={handleDownloadRemark}>
                        <Download className="h-3.5 w-3.5" /> PDF
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center space-y-4 py-12 text-center opacity-40">
                <FileBadge className="h-12 w-12" />
                <p className="text-xs font-bold uppercase tracking-widest">No formal remarks in dossier.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden rounded-[2rem] border-none bg-white shadow-xl">
        <CardHeader className="border-b bg-white p-5 sm:p-8">
          <CardTitle className="flex items-center gap-2 text-lg font-black uppercase text-primary">
            <Activity className="h-5 w-5 text-secondary" />
            Recent Grade Activity
          </CardTitle>
          <CardDescription>Latest grade entries from the real assessment registry.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableBody>
              {recentGradeActivity.map((item, index) => (
                <TableRow key={`${item.student}-${item.subject}-${index}`} className="h-16 border-b transition-colors last:border-0 hover:bg-primary/5">
                  <TableCell className="pl-8">
                    <div className="space-y-0.5">
                      <p className="text-[11px] font-black uppercase leading-none text-primary">{item.student}</p>
                      <p className="text-[9px] font-bold uppercase text-muted-foreground">{item.subject} • {item.date}</p>
                    </div>
                  </TableCell>
                  <TableCell className="pr-8 text-right">
                    <div className="flex flex-col items-end">
                      <span className="text-sm font-black text-primary">{item.score} <span className="text-[10px] opacity-40">/ 20</span></span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!recentGradeActivity.length ? (
                <TableRow>
                  <TableCell colSpan={2} className="h-20 text-center text-sm text-muted-foreground">
                    Grade activity will appear here once assessments are recorded.
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
