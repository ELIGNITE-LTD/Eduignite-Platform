"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth, type UserRole } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { useSchoolSettings } from "@/lib/hooks/useSchools";
import { cn } from "@/lib/utils";
import { resolveMediaUrl } from "@/lib/media";
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  BookOpen,
  Calendar,
  ClipboardCheck,
  Award,
  LogOut,
  Heart,
  Globe,
  MessageSquare,
  Megaphone,
  MessageCircle,
  User,
  X,
  PenTool,
  FileEdit,
  Library,
  Coins,
  CreditCard,
  Settings2,
  Crown,
  Wallet,
  Quote,
  CalendarDays,
  PlaySquare,
  HandHeart,
  Network,
  Star,
  BarChart3,
  FileBadge,
  Sparkles,
  Trophy,
  Video,
  Medal,
  Bell,
  Boxes,
  Database,
  Map,
  Radar,
  History,
  Archive,
  QrCode,
  MonitorPlay,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolvePlatformLogoUrl } from "@/lib/platform-brand";

interface SidebarProps {
  onClose?: () => void;
}

const EXECUTIVE_ROLES: UserRole[] = ["SUPER_ADMIN", "CEO", "CTO", "COO", "INV", "DESIGNER"];
const BLOG_ROLES: UserRole[] = ["SUPER_ADMIN", "CEO", "CTO", "COO", "INV", "DESIGNER"];
const STAFF_ROLES: UserRole[] = ["TEACHER", "BURSAR", "LIBRARIAN"];

export function DashboardSidebar({ onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout, platformSettings } = useAuth();
  const { t, language } = useI18n();
  const normalizedRole = ((user?.role || "").trim().toUpperCase() as UserRole) || undefined;

  const isSuperAdmin = EXECUTIVE_ROLES.includes(normalizedRole as UserRole);
  const isDesigner = normalizedRole === "DESIGNER";
  const isBursar = normalizedRole === "BURSAR";
  const isSchoolAdmin = normalizedRole === "SCHOOL_ADMIN" || normalizedRole === "SUB_ADMIN";
  const isTeacherRole = normalizedRole === "TEACHER";
  const { data: sidebarSchoolSettings } = useSchoolSettings(isTeacherRole ? (user?.school?.id || "") : "");
  const classMastersCanEditStudents = Boolean((sidebarSchoolSettings as any)?.class_masters_can_edit_students);
  const schoolLogo = resolveMediaUrl(user?.school?.logo);
  const userAvatar = resolveMediaUrl(user?.avatar);
  const platformLogo = resolvePlatformLogoUrl(platformSettings.logo);

  const routes = [
    {
      label: t("platformOverview"),
      icon: LayoutDashboard,
      href: "/dashboard",
      roles: EXECUTIVE_ROLES,
    },
    {
      label: language === "en" ? "Log Post" : "Poster un Log",
      icon: PenTool,
      href: "/dashboard/log-post",
      roles: BLOG_ROLES,
    },
    {
      label: t("founders"),
      icon: Crown,
      href: "/dashboard/founders",
      roles: EXECUTIVE_ROLES,
    },
    {
      label: t("schools"),
      icon: Globe,
      href: "/dashboard/schools",
      roles: ["SUPER_ADMIN", "CEO", "CTO", "COO"],
    },
    {
      label: t("supportRegistry"),
      icon: Heart,
      href: "/dashboard/support",
      roles: ["SUPER_ADMIN", "CEO", "CTO", "COO"],
    },
    {
      label: language === "en" ? "Flyer QR" : "QR Flyer",
      icon: QrCode,
      href: "/dashboard/flyer-qr",
      roles: ["SUPER_ADMIN", "CEO", "CTO"],
    },
    {
      label: language === "en" ? "Testimonials" : "Temoignages",
      icon: Quote,
      href: "/dashboard/testimonials",
      roles: ["SUPER_ADMIN", "CEO", "CTO"],
    },
    {
      label: language === "en" ? "Portfolio & Policy" : "Portfolio & Politique",
      icon: isDesigner ? Star : Settings2,
      href: "/dashboard/platform-settings",
      roles: ["SUPER_ADMIN", "CEO", "DESIGNER", "CTO", "COO", "INV"],
    },
    {
      label: language === "en" ? "Manage Settings" : "Gerer les Parametres",
      icon: Settings2,
      href: "/dashboard/settings",
      roles: ["SCHOOL_ADMIN"],
    },
    {
      label: language === "en" ? "Hierarchy & Sections" : "Hierarchie & Sections",
      icon: Network,
      href: "/dashboard/community",
      roles: ["SCHOOL_ADMIN"],
    },
    {
      label: "Enter Marks",
      icon: Award,
      href: "/dashboard/grades",
      roles: ["TEACHER"],
    },
    // Only when the school admin has granted class masters student-edit rights.
    ...(classMastersCanEditStudents
      ? [{
          label: language === "en" ? "Student Management" : "Gestion des eleves",
          icon: Users,
          href: "/dashboard/student-management",
          roles: ["TEACHER"] as UserRole[],
        }]
      : []),
    {
      label: language === "en" ? "Strategic Insights" : "Statistiques Strategiques",
      icon: BarChart3,
      href: "/dashboard/statistics",
      roles: ["SCHOOL_ADMIN"],
    },
    {
      label: language === "en" ? "Academic Calendar" : "Calendrier academique",
      icon: Calendar,
      href: "/dashboard/academics/years-and-terms",
      roles: ["SCHOOL_ADMIN", "SUB_ADMIN"],
    },
    {
      label: language === "en" ? "Promotions" : "Promotions",
      icon: Award,
      href: "/dashboard/academics/promotions",
      roles: ["SCHOOL_ADMIN", "SUB_ADMIN"],
    },
    {
      label: language === "en" ? "Performance Report" : "Rapport de Performance",
      icon: Trophy,
      href: "/dashboard/academics/performance",
      roles: ["SCHOOL_ADMIN", "SUB_ADMIN"],
    },
    {
      label: language === "en" ? "Academic Reward" : "Recompense Academique",
      icon: Trophy,
      href: "/dashboard/rewards",
      roles: ["SCHOOL_ADMIN", "SUB_ADMIN"],
    },
    // Community Portal is intentionally excluded from the desktop application.
    // The former footer actions now live here, alongside the other tabs.
    {
      label: language === "en" ? "Community" : "Communauté",
      icon: Users,
      href: "/dashboard/community-hub",
      roles: ["SCHOOL_ADMIN", "SUB_ADMIN", "TEACHER", "STUDENT", "PARENT", "BURSAR", "LIBRARIAN"],
    },
    {
      label: language === "en" ? "School Events" : "Événements",
      icon: CalendarDays,
      href: "/dashboard/school-events",
      roles: ["SCHOOL_ADMIN", "SUB_ADMIN", "TEACHER", "STUDENT", "PARENT", "BURSAR", "LIBRARIAN"],
    },
    {
      label: language === "en" ? "Training" : "Formation",
      icon: PlaySquare,
      href: "/dashboard/training",
      roles: ["SCHOOL_ADMIN", "SUB_ADMIN", "TEACHER", "STUDENT", "PARENT", "BURSAR", "LIBRARIAN"],
    },
    {
      label: language === "en" ? "Support Us" : "Soutien",
      icon: HandHeart,
      href: "/dashboard/support-us",
      roles: ["SCHOOL_ADMIN", "SUB_ADMIN", "TEACHER", "STUDENT", "PARENT", "BURSAR", "LIBRARIAN"],
    },
    {
      label: language === "en" ? "Testimony" : "Témoignage",
      icon: Quote,
      href: "/dashboard/testimony",
      roles: ["SCHOOL_ADMIN", "SUB_ADMIN", "TEACHER", "STUDENT", "PARENT", "BURSAR", "LIBRARIAN"],
    },
    {
      label: t("chat"),
      icon: MessageCircle,
      href: "/dashboard/chat",
      roles: [...EXECUTIVE_ROLES, "SCHOOL_ADMIN", "SUB_ADMIN", "TEACHER", "STUDENT", "PARENT", "BURSAR", "LIBRARIAN"],
    },
    {
      label: t("announcements"),
      icon: Megaphone,
      href: "/dashboard/announcements",
      roles: [...EXECUTIVE_ROLES, "SCHOOL_ADMIN", "SUB_ADMIN", "TEACHER", "STUDENT", "PARENT", "BURSAR", "LIBRARIAN"],
    },
    {
      label: language === "en" ? "Notifications" : "Notifications",
      icon: Bell,
      href: "/dashboard/notifications",
      roles: [...EXECUTIVE_ROLES, "SCHOOL_ADMIN", "SUB_ADMIN", "TEACHER", "STUDENT", "PARENT", "BURSAR", "LIBRARIAN"],
    },
    {
      label: "App Registry",
      icon: Boxes,
      href: "/dashboard/apps",
      roles: ["SUPER_ADMIN", "CEO", "CTO"],
    },
    {
      // The store where EduIgnite publishes apps. Available in every dashboard,
      // not just the school admin's — some apps are installed by individuals and
      // then appear in their own workspace.
      label: "App Store",
      icon: Boxes,
      href: "/dashboard/app-market",
      roles: [...EXECUTIVE_ROLES, "SCHOOL_ADMIN", "SUB_ADMIN", "TEACHER", "STUDENT", "PARENT", "BURSAR", "LIBRARIAN"],
    },
    {
      label: t("feedback"),
      icon: MessageSquare,
      href: "/dashboard/feedback",
      roles: ["SUPER_ADMIN", "CEO", "CTO", "COO", "SCHOOL_ADMIN", "SUB_ADMIN"],
    },
    {
      label: language === "en" ? "Draft" : "Brouillon",
      icon: Archive,
      href: "/dashboard/draft",
      roles: ["SUPER_ADMIN", "CEO", "CTO", "SCHOOL_ADMIN", "SUB_ADMIN"],
    },
    {
      label: t("overview"),
      icon: LayoutDashboard,
      href: "/dashboard",
      roles: ["SCHOOL_ADMIN", "SUB_ADMIN", "TEACHER", "STUDENT", "PARENT", "BURSAR", "LIBRARIAN"],
    },
    {
      label: t("grades"),
      icon: Award,
      href: "/dashboard/grades",
      roles: ["STUDENT", "SCHOOL_ADMIN", "SUB_ADMIN"],
    },
    {
      label: t("subscription"),
      icon: Wallet,
      href: "/dashboard/subscription",
      roles: ["SCHOOL_ADMIN", "SUB_ADMIN", "TEACHER", "STUDENT", "PARENT", "BURSAR", "LIBRARIAN"],
    },
    {
      label: language === "en" ? "Honour Roll" : "Tableau d'Honneur",
      icon: Trophy,
      href: "/dashboard/rewards",
      roles: ["STUDENT"],
    },
    {
      label: language === "en" ? "Recognition" : "Reconnaissance",
      icon: Medal,
      href: "/dashboard/rewards",
      roles: STAFF_ROLES,
    },
    {
      label: t("students"),
      icon: GraduationCap,
      href: "/dashboard/students",
      roles: ["SCHOOL_ADMIN", "SUB_ADMIN", "TEACHER"],
    },
    {
      label: language === "en" ? "AI Guidance Reports" : "Rapports IA d'orientation",
      icon: Sparkles,
      href: "/dashboard/students/guidance-reports",
      roles: ["SCHOOL_ADMIN", "SUB_ADMIN", "TEACHER"],
    },
    {
      label: language === "en" ? "Online Classes" : "Classes en Ligne",
      icon: Video,
      href: "/dashboard/live-classes",
      roles: ["TEACHER", "STUDENT"],
    },
    {
      label: t("idCards"),
      icon: CreditCard,
      href: "/dashboard/id-cards",
      roles: ["SCHOOL_ADMIN", "SUB_ADMIN", "STUDENT"],
    },
    {
      label: language === "en" ? "Transcripts" : "Releves de Notes",
      icon: FileBadge,
      href: "/dashboard/transcripts",
      roles: ["SCHOOL_ADMIN", "SUB_ADMIN", "STUDENT"],
    },
    {
      label: language === "en" ? "Previous Classes" : "Classes precedentes",
      icon: History,
      href: "/dashboard/class-history",
      roles: ["STUDENT"],
    },
    {
      label: isBursar ? (language === "en" ? "Fee Portal" : "Portail Frais") : (language === "en" ? "Fees & Finance" : "Frais & Finance"),
      icon: Coins,
      href: "/dashboard/fees",
      roles: ["BURSAR", "SCHOOL_ADMIN", "SUB_ADMIN", "STUDENT", "PARENT"],
    },
    {
      label: t("staff"),
      icon: Users,
      href: "/dashboard/staff",
      roles: ["SCHOOL_ADMIN", "SUB_ADMIN"],
    },
    {
      label: t("myChildren"),
      icon: Heart,
      href: "/dashboard/children",
      roles: ["PARENT"],
    },
    {
      label: isSchoolAdmin ? (language === "en" ? "Institutional Subjects" : "Matieres Institutionnelles") : t("courses"),
      icon: BookOpen,
      href: "/dashboard/courses",
      roles: ["SCHOOL_ADMIN", "SUB_ADMIN", "STUDENT", "TEACHER"],
    },
    {
      label: t("library"),
      icon: Library,
      href: "/dashboard/library",
      roles: ["STUDENT", "TEACHER", "BURSAR", "LIBRARIAN", "SCHOOL_ADMIN", "SUB_ADMIN"],
    },
    {
      label: t("assignments"),
      icon: FileEdit,
      href: "/dashboard/assignments",
      roles: ["TEACHER", "STUDENT"],
    },
    {
      label: t("exams"),
      icon: PenTool,
      href: "/dashboard/exams",
      roles: ["TEACHER", "STUDENT", "SCHOOL_ADMIN", "SUB_ADMIN"],
    },
    {
      label: language === "en" ? "Manage Online Exams" : "Gerer les examens en ligne",
      icon: MonitorPlay,
      href: "/dashboard/exams/manage",
      roles: ["TEACHER", "SCHOOL_ADMIN", "SUB_ADMIN"],
    },
    {
      label: language === "en" ? "AI Exam Generator" : "Generateur d'examens IA",
      icon: Sparkles,
      href: "/dashboard/exams/ai-generator",
      roles: ["TEACHER", "SCHOOL_ADMIN", "SUB_ADMIN"],
    },
    {
      label: language === "en" ? "Question Bank" : "Banque de questions",
      icon: Database,
      href: "/dashboard/exams/question-bank",
      roles: ["TEACHER", "SCHOOL_ADMIN", "SUB_ADMIN"],
    },
    {
      label: language === "en" ? "Skill Gap Analysis" : "Analyse des lacunes",
      icon: Radar,
      href: "/dashboard/grades/skill-gap",
      roles: ["TEACHER", "STUDENT", "SCHOOL_ADMIN", "SUB_ADMIN", "PARENT"],
    },
    {
      label: language === "en" ? "Career Orientation" : "Orientation professionnelle",
      icon: GraduationCap,
      href: "/dashboard/career-orientation",
      roles: ["TEACHER", "STUDENT", "SCHOOL_ADMIN", "SUB_ADMIN", "PARENT"],
    },
    {
      label: language === "en" ? "My Roadmap" : "Ma feuille de route",
      icon: Map,
      href: "/dashboard/roadmap",
      roles: ["STUDENT", "PARENT", "TEACHER", "SCHOOL_ADMIN", "SUB_ADMIN"],
    },
    {
      label: t("attendance"),
      icon: ClipboardCheck,
      href: "/dashboard/attendance",
      roles: ["TEACHER", "STUDENT", "PARENT", "SCHOOL_ADMIN", "SUB_ADMIN"],
    },
    {
      label: t("aiAssistant"),
      icon: Sparkles,
      href: "/dashboard/ai-assistant",
      roles: [...EXECUTIVE_ROLES, "SCHOOL_ADMIN", "SUB_ADMIN", "TEACHER", "STUDENT", "PARENT", "BURSAR", "LIBRARIAN"],
    },
    {
      label: "Feedback",
      icon: Sparkles,
      href: "/dashboard/ai-feedback",
      roles: ["TEACHER"],
    },
    {
      label: t("schedule"),
      icon: Calendar,
      href: "/dashboard/schedule",
      roles: ["TEACHER", "STUDENT", "PARENT", "SCHOOL_ADMIN", "SUB_ADMIN"],
    },
    {
      label: t("profile"),
      icon: User,
      href: "/dashboard/profile",
      roles: [...EXECUTIVE_ROLES, "SCHOOL_ADMIN", "SUB_ADMIN", "TEACHER", "STUDENT", "PARENT", "BURSAR", "LIBRARIAN"],
    },
  ];

  const filteredRoutes = routes.filter((route) => route.roles.includes(normalizedRole || ""));

  return (
    <div className="flex h-full w-full flex-col overflow-hidden border-r border-white/10 bg-primary text-white">
      <div className="shrink-0 p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 overflow-hidden">
            {!isSuperAdmin && schoolLogo ? (
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-white shadow-lg">
                <img src={schoolLogo} alt="School Logo" className="h-full w-full object-contain" />
              </div>
            ) : isSuperAdmin ? (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-1.5 shadow-sm">
                <img src={platformLogo} alt={`${platformSettings.name} logo`} className="h-full w-full object-contain" />
              </div>
            ) : null}
            <span className="min-w-0 truncate font-headline text-base font-bold uppercase tracking-tight sm:text-lg">
              {isSuperAdmin ? platformSettings.name || "Platform Board" : user?.school?.shortName || user?.school?.name || "Institution"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {onClose ? (
              <Button variant="ghost" size="icon" className="text-white md:hidden" onClick={onClose}>
                <X className="h-5 w-5" />
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="scrollbar-thin scrollbar-thumb-white/10 flex-1 overflow-y-auto px-2 sm:px-3">
        <div className="space-y-1 py-2">
          {filteredRoutes.map((route) => (
            <Link
              key={route.href}
              href={route.href}
              onClick={() => onClose?.()}
              className={cn(
                "group flex min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-200 hover:bg-white/10",
                pathname === route.href ? "bg-white/20 text-white" : "text-white/60"
              )}
            >
              <route.icon className={cn("h-5 w-5", pathname === route.href ? "text-secondary" : "text-white/60 group-hover:text-white")} />
              <span className="min-w-0 break-words text-sm font-medium leading-snug">{route.label}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-auto shrink-0 border-t border-white/10 bg-primary p-4">
        <Link
          href="/dashboard/profile"
          onClick={() => onClose?.()}
          className="group mb-4 flex min-w-0 items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-white/5"
        >
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border-2 border-transparent bg-secondary group-hover:border-white/20">
            <img src={userAvatar} alt={user?.name} className="h-full w-full object-cover" />
          </div>
          <div className="flex flex-col overflow-hidden">
            <span className="truncate text-sm font-semibold text-white">{user?.name}</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">{user?.role}</span>
          </div>
        </Link>
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-white/60 hover:bg-white/10 hover:text-white"
          onClick={logout}
        >
          <LogOut className="h-4 w-4" />
          <span>{t("logout")}</span>
        </Button>
      </div>
    </div>
  );
}
