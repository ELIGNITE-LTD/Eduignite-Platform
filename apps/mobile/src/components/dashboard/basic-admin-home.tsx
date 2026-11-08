"use client";

import Link from "next/link";
import {
  Award,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Coins,
  FileText,
  GraduationCap,
  Plus,
  School,
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
import { HomeGreeting, MoreLinks, SectionTitle, StatRow, TaskTiles } from "@/components/dashboard/basic-home-ui";

const num = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Calm home for the head of a nursery/primary school: greeting, 4 numbers, today, 6 tiles. */
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
  const feesRate = expected > 0 ? `${Math.round((collected / expected) * 100)}%` : "-";

  const classRows = Array.isArray(classes) ? classes : [];
  const withTeacher = classRows.filter(
    (c) => c.class_master || assignments.some((a) => a.school_class === c.id)
  ).length;
  const withoutTeacher = Math.max(classRows.length - withTeacher, 0);
  const ready = !classesLoading && !assignmentsLoading;

  const stats = [
    { icon: GraduationCap, label: en ? "Pupils" : "Eleves", value: String(pupils), tone: "bg-purple-50 text-purple-700" },
    { icon: School, label: en ? "Classes" : "Classes", value: ready ? String(classRows.length) : "-", tone: "bg-sky-50 text-sky-700" },
    { icon: UserCheck, label: en ? "Present today" : "Presents aujourd'hui", value: attendanceRate === null ? "-" : `${attendanceRate}%`, tone: "bg-emerald-50 text-emerald-700" },
    { icon: Coins, label: en ? "Fees collected" : "Frais payes", value: feesRate, tone: "bg-amber-50 text-amber-700" },
  ];

  const tiles = [
    { href: "/dashboard/students", icon: Users, label: en ? "Pupils" : "Eleves", tone: "bg-purple-50 text-purple-700" },
    { href: "/dashboard/classes", icon: UserCog, label: en ? "Classes" : "Classes", tone: "bg-sky-50 text-sky-700" },
    { href: "/dashboard/subjects", icon: BookOpen, label: en ? "Subjects" : "Matieres", tone: "bg-teal-50 text-teal-700" },
    { href: "/dashboard/attendance", icon: ClipboardCheck, label: en ? "Attendance" : "Presences", tone: "bg-emerald-50 text-emerald-700" },
    { href: "/dashboard/grades", icon: FileText, label: en ? "Marks & report cards" : "Notes et bulletins", tone: "bg-rose-50 text-rose-700" },
    { href: "/dashboard/fees", icon: Coins, label: en ? "Fees" : "Frais scolaires", tone: "bg-amber-50 text-amber-700" },
  ];

  const more = [
    { href: "/dashboard/conduct", label: en ? "Conduct" : "Conduite" },
    { href: "/dashboard/announcements", label: en ? "Announcements" : "Annonces" },
    { href: "/dashboard/academics/promotions", label: en ? "Move pupils to the next class" : "Passage de classe" },
    { href: "/dashboard/health-records", label: en ? "Health & certificates" : "Sante et certificats" },
  ];

  // The "Today" section: what needs doing, never a wall of widgets.
  const todo: Array<{ key: string; icon: typeof Award; text: string; cta: string; href: string; tone: string }> = [];
  if (ready && classRows.length === 0) {
    todo.push({
      key: "first-class",
      icon: Plus,
      text: en ? "You have no class yet. Add your first class to get started." : "Vous n'avez pas encore de classe. Ajoutez la premiere pour commencer.",
      cta: en ? "Add a class" : "Ajouter une classe",
      href: "/dashboard/classes?add=class",
      tone: "bg-primary text-white",
    });
  } else if (ready && withoutTeacher > 0) {
    todo.push({
      key: "no-teacher",
      icon: UserCog,
      text: en
        ? `${withoutTeacher} ${withoutTeacher === 1 ? "class has" : "classes have"} no class teacher yet.`
        : `${withoutTeacher} ${withoutTeacher === 1 ? "classe n'a" : "classes n'ont"} pas encore de titulaire.`,
      cta: en ? "Assign" : "Affecter",
      href: "/dashboard/classes",
      tone: "bg-rose-50 text-rose-700",
    });
  }
  if (attendanceRate === null && classRows.length > 0) {
    todo.push({
      key: "attendance",
      icon: ClipboardCheck,
      text: en ? "Today's attendance has not been taken yet." : "L'appel d'aujourd'hui n'a pas encore ete fait.",
      cta: en ? "Take attendance" : "Faire l'appel",
      href: "/dashboard/attendance",
      tone: "bg-emerald-50 text-emerald-700",
    });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-20">
      <HomeGreeting
        greeting={en ? "Hello" : "Bonjour"}
        name={user?.name}
        context={school?.name || user?.school?.name}
        badge={
          <Link href="/dashboard/classes?add=class" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-bold text-white shadow-sm hover:opacity-90">
            <Plus className="h-4 w-4" />
            {en ? "Add class" : "Ajouter une classe"}
          </Link>
        }
      />

      <StatRow stats={stats} />

      <section className="space-y-3">
        <SectionTitle>{en ? "Today" : "Aujourd'hui"}</SectionTitle>
        {todo.length === 0 ? (
          <Card className="rounded-3xl border-none shadow-sm">
            <CardContent className="flex items-center gap-3 p-5">
              <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" />
              <p className="text-sm font-semibold text-primary">{en ? "All good. Nothing needs your attention today." : "Tout est en ordre. Rien d'urgent aujourd'hui."}</p>
            </CardContent>
          </Card>
        ) : (
          todo.map(({ key, icon: Icon, text, cta, href, tone }) => (
            <Card key={key} className="rounded-3xl border-none shadow-sm">
              <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${tone}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <p className="text-sm font-semibold text-primary sm:text-base">{text}</p>
                </div>
                <Link href={href} className="inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-5 text-sm font-bold text-white shadow-sm hover:opacity-90">
                  {cta}
                </Link>
              </CardContent>
            </Card>
          ))
        )}
      </section>

      <section className="space-y-3">
        <SectionTitle>{en ? "What would you like to do?" : "Que voulez-vous faire ?"}</SectionTitle>
        <TaskTiles tiles={tiles} />
      </section>

      <MoreLinks label={en ? "More" : "Plus"} links={more} />
    </div>
  );
}
