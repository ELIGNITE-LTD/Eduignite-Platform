"use client";

import { useMemo } from "react";
import { useMyChildren } from "@/lib/hooks/useStudents";
import { useGrades } from "@/lib/hooks/useGrades";
import { useAttendanceSummary } from "@/lib/hooks/useAttendance";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { GraduationCap, Award, ClipboardCheck, ShieldCheck, Heart, Baby, Wallet, Activity, Coins, History, MapPin, Trophy, ChevronRight } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import Link from "next/link";

export function ParentDashboard() {
  const { data: childrenResp } = useMyChildren();
  const { data: gradesResp } = useGrades();
  const { data: attendanceSummary } = useAttendanceSummary();

  const children = childrenResp?.results ?? [];
  const grades = gradesResp?.results ?? [];

  const familyAverage = children.length > 0
    ? children.reduce((sum, child) => sum + (child.annual_average ?? 0), 0) / children.length
    : 0;

  const honourRollCount = children.filter((child) => child.is_on_honour_roll).length;
  const activeAcademicProfiles = children.filter((child) => (child.annual_average ?? 0) > 0).length;
  const familyAttendanceRate = Number.isFinite(Number(attendanceSummary?.attendance_percentage))
    ? `${Math.round(Number(attendanceSummary?.attendance_percentage))}%`
    : "Pending";

  const chartData = children.map((child) => ({
    name: child.user?.name?.split(" ")[0] ?? "Student",
    average: Number((child.annual_average ?? 0).toFixed(2)),
  }));

  const recentMarks = useMemo(() => (
    grades
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 8)
      .map((grade) => ({
        id: grade.id,
        student: grade.student,
        subject: grade.subject.name,
        score: grade.score,
        teacher: grade.teacher,
        dateLabel: new Date(grade.created_at).toLocaleDateString(),
      }))
  ), [grades]);

  const standingData = children.map((child) => {
    const average = Number((child.annual_average ?? 0).toFixed(2));
    const normalized = Math.max(0, Math.min(100, (average / 20) * 100));
    return {
      id: child.id,
      name: child.user?.name ?? "Student",
      average,
      normalized,
      className: child.student_class,
      honourRoll: child.is_on_honour_roll,
    };
  });

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary rounded-[1.5rem] shadow-xl border-2 border-white">
            <Heart className="w-8 h-8 text-secondary fill-secondary/20" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-primary font-headline tracking-tighter uppercase leading-none">Family Academic Hub</h1>
            <p className="text-muted-foreground text-sm mt-1">Verified family visibility into your children&apos;s real school activity.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" className="h-12 px-6 rounded-2xl font-bold border-primary/10 bg-white gap-2">
            <Link href="/dashboard/children"><Baby className="w-4 h-4 text-primary" /> Manage Children</Link>
          </Button>
          <Button asChild className="h-12 px-8 shadow-xl font-black uppercase tracking-widest text-[10px] gap-2 bg-primary text-white">
            <Link href="/dashboard/subscription"><Wallet className="w-4 h-4 text-secondary" /> Pay Licenses</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Children Enrolled", value: `${children.length} Student${children.length !== 1 ? "s" : ""}`, icon: GraduationCap, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Family GPA Mean", value: `${familyAverage.toFixed(2)} / 20`, icon: Award, color: "text-amber-600", bg: "bg-amber-50" },
          { label: "Honour Roll", value: `${honourRollCount} Child${honourRollCount !== 1 ? "ren" : ""}`, icon: ClipboardCheck, color: "text-purple-600", bg: "bg-purple-50" },
          { label: "Family Attendance", value: familyAttendanceRate, icon: ShieldCheck, color: "text-green-600", bg: "bg-green-50" },
        ].map((stat, i) => (
          <Card key={i} className="border-none shadow-sm group hover:shadow-md transition-all">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">{stat.label}</CardTitle>
              <div className={cn("p-2 rounded-lg", stat.bg)}>
                <stat.icon className={cn("w-4 h-4", stat.color)} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-primary">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <Card className="lg:col-span-8 border-none shadow-xl overflow-hidden rounded-[2.5rem] bg-white">
          <CardHeader className="bg-primary/5 p-8 border-b flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-xl font-black text-primary uppercase tracking-tighter flex items-center gap-2">
                <Award className="w-5 h-5 text-secondary" /> Family Performance Snapshot
              </CardTitle>
              <CardDescription>Annual averages pulled from the academic records of each linked child.</CardDescription>
            </div>
            <Badge variant="outline" className="border-primary/10 text-primary font-bold uppercase text-[9px] px-3">VERIFIED RECORDS</Badge>
          </CardHeader>
          <CardContent className="h-[350px] pt-10">
            {chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center px-6">
                <p className="text-sm text-muted-foreground">No linked children have academic averages recorded yet.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: "bold" }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} domain={[0, 20]} />
                  <RechartsTooltip contentStyle={{ borderRadius: "1rem", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }} />
                  <Bar name="Average" dataKey="average" fill="#264D73" radius={[12, 12, 0, 0]} maxBarSize={56} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-4 border-none shadow-xl overflow-hidden rounded-[2.5rem] bg-white flex flex-col">
          <CardHeader className="bg-primary p-8 text-white">
            <CardTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
              <Activity className="w-5 h-5 text-secondary" />
              Children Activity
            </CardTitle>
            <CardDescription className="text-white/60">Linked learners visible in your family account.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            {children.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-muted-foreground text-sm">No children linked to your account.</p>
              </div>
            ) : (
              <>
                {children.map((child, i) => (
                  <div key={i} className="p-6 border-b last:border-0 hover:bg-accent/10 transition-colors flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Avatar className="h-12 w-12 border-2 border-white shadow-sm ring-1 ring-accent">
                        <AvatarImage src={child.user?.avatar} />
                        <AvatarFallback>{child.user?.name?.charAt(0) ?? "S"}</AvatarFallback>
                      </Avatar>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-black text-primary uppercase leading-none">{child.user?.name}</p>
                          {child.is_on_honour_roll && <Trophy className="w-3.5 h-3.5 text-secondary" />}
                        </div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1.5">
                          <MapPin className="w-3 h-3 text-secondary" /> {child.student_class}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant="secondary" className="bg-green-100 text-green-700 border-none text-[8px] font-black h-5 px-2">
                        ACTIVE
                      </Badge>
                      {child.is_on_honour_roll && <Badge className="bg-primary text-secondary border-none text-[7px] font-black h-4 uppercase tracking-tighter">HONOUR ROLL</Badge>}
                    </div>
                  </div>
                ))}
                <div className="p-6 bg-accent/20">
                  <Button asChild variant="ghost" className="w-full text-[10px] font-black uppercase tracking-widest gap-2 hover:bg-white transition-all h-10">
                    <Link href="/dashboard/children">Access Children Dossiers <ChevronRight className="w-3.5 h-3.5" /></Link>
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <Card className="lg:col-span-7 border-none shadow-xl overflow-hidden rounded-[2rem] bg-white">
          <CardHeader className="bg-white border-b p-8 flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-black text-primary uppercase flex items-center gap-2">
                <History className="w-5 h-5 text-secondary" />
                Recent Academic Marks
              </CardTitle>
              <CardDescription>Latest assessments recorded for your linked children.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {recentMarks.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No marks have been recorded yet.</div>
            ) : (
              <Table>
                <TableBody>
                  {recentMarks.map((result) => (
                    <TableRow key={result.id} className="hover:bg-primary/5 transition-colors border-b last:border-0 h-16">
                      <TableCell className="pl-8 py-4">
                        <div className="space-y-0.5">
                          <p className="text-[11px] font-black text-primary uppercase leading-none">{result.student} • {result.subject}</p>
                          <p className="text-[9px] font-bold text-muted-foreground uppercase">{result.dateLabel} • {result.teacher}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right pr-8">
                        <div className="flex flex-col items-end">
                          <span className="text-sm font-black text-primary">{result.score}</span>
                          <span className="text-[8px] font-bold uppercase text-muted-foreground italic">Recorded mark</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
          <CardFooter className="bg-accent/10 p-4 border-t flex justify-center">
            <Button asChild variant="ghost" className="text-[10px] font-black uppercase gap-2 hover:bg-white transition-all">
              <Link href="/dashboard/grades">View Full Family Gradebook <ChevronRight className="w-3.5 h-3.5" /></Link>
            </Button>
          </CardFooter>
        </Card>

        <Card className="lg:col-span-5 border-none shadow-xl overflow-hidden rounded-[2.5rem] bg-white flex flex-col">
          <CardHeader className="bg-primary p-8 text-white">
            <CardTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
              <Coins className="w-5 h-5 text-secondary" />
              Children Standing Tracker
            </CardTitle>
            <CardDescription className="text-white/60">Real academic readiness by child, based on recorded annual averages.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 pt-8 space-y-8 px-8">
            {standingData.length === 0 ? (
              <div className="text-center">
                <p className="text-white/60 text-sm">No linked children are available yet.</p>
              </div>
            ) : (
              <>
                {standingData.map((child) => (
                  <div key={child.id} className="space-y-3">
                    <div className="flex justify-between items-end gap-4">
                      <div>
                        <p className="text-xs font-black text-white uppercase">{child.name}</p>
                        <p className="text-[10px] font-bold text-white/60 uppercase">{child.className}</p>
                      </div>
                      <p className="text-[10px] font-bold text-white/60 uppercase">{child.average.toFixed(2)} / 20</p>
                    </div>
                    <Progress value={child.normalized} className="h-2 rounded-full" />
                    <div className="flex justify-between text-[9px] font-black uppercase text-white/40 tracking-widest">
                      <span>{child.honourRoll ? "Honour roll active" : "Academic record available"}</span>
                      <span>{child.normalized.toFixed(0)}%</span>
                    </div>
                  </div>
                ))}
              </>
            )}
            <div className="pt-4 border-t border-white/10 flex flex-col items-center text-center gap-4">
              <div className="p-4 bg-white/10 rounded-2xl">
                <ShieldCheck className="w-8 h-8 text-secondary opacity-40" />
              </div>
              <p className="text-[10px] text-white/60 leading-relaxed italic font-medium">
                {activeAcademicProfiles} of {children.length} linked child{children.length === 1 ? "" : "ren"} already have academic averages recorded in the system.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
