"use client";

import Link from "next/link";
import {
  Award,
  ClipboardCheck,
  Coins,
  FileText,
  GraduationCap,
  HeartPulse,
  Megaphone,
  School,
  ShieldCheck,
  UserCheck,
  UserCog,
  Users,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { useMySchool, useHierarchyClasses } from "@/lib/hooks/useSchools";
import { useAllStudents, useStudentRegistrySummary } from "@/lib/hooks/useStudents";
import { useAttendanceSummary } from "@/lib/hooks/useAttendance";
import { useSchoolFeeSummary } from "@/lib/hooks/useFees";
import { useClassTeachers } from "@/lib/hooks/useClassTeachers";
import { useAnnouncements } from "@/lib/hooks/useAnnouncements";

const num = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Very simple home for the head of a basic (nursery/primary) school. */
export function BasicAdminHome() {
  const { user } = useAuth();
  const { language } = useI18n();
  const en = language === "en";
  const { data: school } = useMySchool();
  const schoolId = school?.id || user?.school?.id || "";
  const { data: studentsResp } = useAllStudents();
  const { data: registry } = useStudentRegistrySummary();
  const { data: attendance } = useAttendanceSummary();
  const { data: fees } = useSchoolFeeSummary();
  const { data: classes = [], isLoading: classesLoading } = useHierarchyClasses({ school_id: schoolId }, Boolean(schoolId));
  const { data: assignments = [], isLoading: assignmentsLoading } = useClassTeachers();
  const { data: announcementsResp } = useAnnouncements();

  const pupils = Math.max(
    num(registry?.active_enrollment),
    num(registry?.student_profiles),
    num(studentsResp?.count),
    num(school?.student_count)
  );

  const todayTotal = num(attendance?.today_total);
  const todayPresent = todayTotal - num(attendance?.today_absent);
  const attendanceRate = todayTotal > 0 ? Math.round((todayPresent / todayTotal) * 100) : null;

  const expected = num(fees?.school_totals?.total_expected);
  const collected = num(fees?.school_totals?.total_collected);
  const money = (value: number) => `${value.toLocaleString()} XAF`;

  const classRows = Array.isArray(classes) ? classes : [];
  const withTeacher = classRows.filter(
    (c) => c.class_master || assignments.some((a) => a.school_class === c.id)
  ).length;
  const withoutTeacher = Math.max(classRows.length - withTeacher, 0);
  const teacherInfoReady = !classesLoading && !assignmentsLoading;

  const announcements = (announcementsResp?.results ?? []).slice(0, 3);

  const stats = [
    { icon: GraduationCap, label: en ? "Pupils" : "Eleves", value: String(pupils), color: "bg-purple-50 text-purple-700", small: false },
    {
      icon: UserCheck,
      label:
        attendanceRate === null
          ? en ? "Attendance today (not taken yet)" : "Presences aujourd'hui (appel pas fait)"
          : en ? "Present today" : "Presents aujourd'hui",
      value: attendanceRate === null ? "-" : `${attendanceRate}%`,
      color: "bg-emerald-50 text-emerald-700",
      small: false,
    },
    {
      icon: Coins,
      label: en ? "Fees collected / expected" : "Frais payes / attendus",
      value: `${money(collected)} / ${money(expected)}`,
      color: "bg-amber-50 text-amber-700",
      small: true,
    },
    {
      icon: School,
      label: en ? "Classes with / without a class teacher" : "Classes avec / sans titulaire",
      value: teacherInfoReady ? `${withTeacher} / ${withoutTeacher}` : "-",
      color: withoutTeacher > 0 && teacherInfoReady ? "bg-rose-50 text-rose-700" : "bg-sky-50 text-sky-700",
      small: false,
    },
  ];

  const tiles = [
    { href: "/dashboard/students", icon: Users, label: en ? "Pupils" : "Eleves", color: "bg-purple-50 text-purple-700" },
    { href: "/dashboard/community", icon: UserCog, label: en ? "Classes & teachers" : "Classes et titulaires", color: "bg-sky-50 text-sky-700" },
    { href: "/dashboard/attendance", icon: ClipboardCheck, label: en ? "Attendance" : "Presences", color: "bg-emerald-50 text-emerald-700" },
    { href: "/dashboard/grades", icon: FileText, label: en ? "Marks & report cards" : "Notes et bulletins", color: "bg-rose-50 text-rose-700" },
    { href: "/dashboard/conduct", icon: ShieldCheck, label: en ? "Conduct" : "Conduite", color: "bg-indigo-50 text-indigo-700" },
    { href: "/dashboard/fees", icon: Coins, label: en ? "Fees" : "Frais scolaires", color: "bg-amber-50 text-amber-700" },
    { href: "/dashboard/announcements", icon: Megaphone, label: en ? "Announcements" : "Annonces", color: "bg-orange-50 text-orange-700" },
    { href: "/dashboard/academics/promotions", icon: Award, label: en ? "Promotion" : "Passage de classe", color: "bg-lime-50 text-lime-700" },
    { href: "/dashboard/health-records", icon: HeartPulse, label: en ? "Health & certificates" : "Sante et certificats", color: "bg-teal-50 text-teal-700" },
  ];

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h1 className="text-2xl font-bold text-primary sm:text-3xl">
          {en ? "Hello" : "Bonjour"}, {user?.name}
        </h1>
        <p className="text-sm text-muted-foreground">{school?.name || user?.school?.name}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map(({ icon: Icon, label, value, color, small }) => (
          <Card key={label} className="rounded-[2rem] border-none shadow-lg">
            <CardContent className="space-y-2 p-5">
              <span className={`inline-flex rounded-2xl p-3 ${color}`}>
                <Icon className="h-6 w-6" />
              </span>
              <p className={`${small ? "text-lg" : "text-3xl"} break-words font-black text-primary`}>{value}</p>
              <p className="text-sm text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {tiles.map(({ href, icon: Icon, label, color }) => (
          <Link key={href} href={href} className="block">
            <Card className="rounded-[2rem] border-none shadow-lg transition hover:shadow-xl">
              <CardContent className="flex min-h-[8.5rem] flex-col items-center justify-center gap-3 p-4 text-center">
                <span className={`rounded-2xl p-4 ${color}`}>
                  <Icon className="h-8 w-8" />
                </span>
                <span className="text-base font-bold text-primary">{label}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card className="rounded-[2rem] border-none bg-white shadow-xl">
        <CardContent className="space-y-3 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-primary">{en ? "Recent announcements" : "Annonces recentes"}</h2>
            <Link href="/dashboard/announcements" className="text-sm font-semibold text-primary underline">
              {en ? "See all" : "Tout voir"}
            </Link>
          </div>
          {announcements.length === 0 ? (
            <p className="text-sm text-muted-foreground">{en ? "No announcements yet." : "Aucune annonce pour le moment."}</p>
          ) : (
            announcements.map((a) => (
              <div key={a.id} className="rounded-2xl bg-accent/30 p-4">
                <p className="font-semibold text-primary">{a.title}</p>
                <p className="line-clamp-2 text-sm text-muted-foreground">{a.content}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
