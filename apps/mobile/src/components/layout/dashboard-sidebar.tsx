"use client";

import { useRoleLabel } from "@/lib/role-labels";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth, type UserRole } from "@/lib/auth-context";
import { roleDescription } from "@/lib/role-info";
import { canAccessModule } from "@/lib/executive-modules";
import { useI18n } from "@/lib/i18n-context";
import { useSchoolSettings } from "@/lib/hooks/useSchools";
import { useEducationCategory } from "@/lib/hooks/useEducationCategory";
import type { EducationCategory } from "@/lib/cameroon-education-system";
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
  ClipboardList,
  CalendarDays,
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
  Gift,
  Handshake,
  Wallet,
  Quote,
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
  ScanLine,
  TrendingUp,
  MessageSquareText,
  Shapes,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolvePlatformLogoUrl } from "@/lib/platform-brand";

import { useRouteAccess } from "@/lib/hooks/useRegistry";

interface SidebarProps {
  onClose?: () => void;
}

const EXECUTIVE_ROLES: UserRole[] = ["SUPER_ADMIN", "CEO", "CTO", "COO", "INV", "DESIGNER", "SYSTEM_DEV"];
const BLOG_ROLES: UserRole[] = ["SUPER_ADMIN", "CEO", "CTO", "COO", "INV", "DESIGNER", "SYSTEM_DEV"];
const STAFF_ROLES: UserRole[] = ["TEACHER", "BURSAR", "LIBRARIAN"];

const MODULE_BY_HREF: Record<string, string> = {
  "/dashboard/log-post": "log_post",
  "/dashboard/apps": "app_registry",
  "/dashboard/partners": "partners",
  "/academy/admin": "academy",
  "/dashboard/schools": "schools",
  "/dashboard/support": "support",
  "/dashboard/flyer-qr": "flyer_qr",
  "/dashboard/testimonials": "testimonials",
  "/dashboard/platform-settings": "portfolio_policy",
  "/dashboard/community": "community",
  "/dashboard/announcements": "announcements",
  "/dashboard/surveys": "surveys",
  "/dashboard/feedback": "feedback",
  "/dashboard/draft": "draft",
  "/dashboard/ai-economics": "ai_economics",
};

/**
 * The full role-filtered navigation registry. Shared by the (legacy) sidebar
 * and the mobile Workspace grid so both always expose the same tabs.
 */
// Menu entries may carry an optional `categories` list; entries without one
// show for every school. Presentation only: the server enforces access.
const showsForCategory = (route: object, category: EducationCategory) => {
  const categories = (route as { categories?: EducationCategory[] }).categories;
  return !categories?.length || categories.includes(category);
};

export function useDashboardRoutes() {
  const { user } = useAuth();
  const educationCategory = useEducationCategory();
  const { t, language } = useI18n();
  const { canOpen } = useRouteAccess();
  const normalizedRole = ((user?.role || "").trim().toUpperCase() as UserRole) || undefined;

  const isDesigner = normalizedRole === "DESIGNER";
  const isBursar = normalizedRole === "BURSAR";
  const isSchoolAdmin = normalizedRole === "SCHOOL_ADMIN" || normalizedRole === "SUB_ADMIN";

  const isTeacherRole = normalizedRole === "TEACHER";
  const { data: sidebarSchoolSettings } = useSchoolSettings(isTeacherRole ? (user?.school?.id || "") : "");
  const classMastersCanEditStudents = Boolean((sidebarSchoolSettings as any)?.class_masters_can_edit_students);
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
      roles: EXECUTIVE_ROLES,
    },
    {
      label: t("supportRegistry"),
      icon: Heart,
      href: "/dashboard/support",
      roles: EXECUTIVE_ROLES,
    },
    {
      label: language === "en" ? "Flyer QR" : "QR Flyer",
      icon: QrCode,
      href: "/dashboard/flyer-qr",
      roles: EXECUTIVE_ROLES,
    },
    {
      label: language === "en" ? "Testimonials" : "Temoignages",
      icon: Quote,
      href: "/dashboard/testimonials",
      roles: EXECUTIVE_ROLES,
    },
    {
      label: language === "en" ? "Portfolio & Policy" : "Portfolio & Politique",
      icon: isDesigner ? Star : Settings2,
      href: "/dashboard/platform-settings",
      roles: ["SUPER_ADMIN", "CEO", "DESIGNER", "CTO", "COO", "INV", "SYSTEM_DEV"],
    },
    {
      label: language === "en" ? "Manage Settings" : "Gerer les Parametres",
      icon: Settings2,
      href: "/dashboard/settings",
      roles: ["SCHOOL_ADMIN"],
    },
    {
      // EduIgnite Offline companion: QR-based license activation, renewal
      // and device replacement for the school's offline desktop install.
      label: language === "en" ? "Companion" : "Compagnon",
      icon: ScanLine,
      href: "/dashboard/companion",
      roles: ["SCHOOL_ADMIN", "SUB_ADMIN"],
    },
    {
      label: language === "en" ? "Hierarchy & Sections" : "Hierarchie & Sections",
      icon: Network,
      href: "/dashboard/community",
      roles: ["SCHOOL_ADMIN"],
      categories: ["secondary", "higher"] as EducationCategory[],
    },
    {
      label: language === "en" ? "Sections" : "Sections",
      icon: Network,
      href: "/dashboard/sections",
      roles: ["SCHOOL_ADMIN", "SUB_ADMIN"] as UserRole[],
      categories: ["basic"] as EducationCategory[],
    },
    {
      label: language === "en" ? "Classes" : "Classes",
      icon: Network,
      href: "/dashboard/classes",
      roles: ["SCHOOL_ADMIN", "SUB_ADMIN"] as UserRole[],
      categories: ["basic"] as EducationCategory[],
    },
    {
      label: language === "en" ? "Subjects" : "Matieres",
      icon: BookOpen,
      href: "/dashboard/subjects",
      roles: ["SCHOOL_ADMIN", "SUB_ADMIN"] as UserRole[],
      categories: ["basic"] as EducationCategory[],
    },
    {
      label: language === "en" ? "Class Home" : "Ma classe",
      icon: LayoutDashboard,
      href: "/dashboard",
      roles: ["TEACHER"] as UserRole[],
      categories: ["basic"] as EducationCategory[],
    },
    {
      label: language === "en" ? "Marks" : "Notes",
      icon: Award,
      href: "/dashboard/class-marks",
      roles: ["TEACHER"] as UserRole[],
      categories: ["basic"] as EducationCategory[],
    },
    {
      label: language === "en" ? "Conduct" : "Conduite",
      icon: ClipboardList,
      href: "/dashboard/conduct",
      roles: ["TEACHER", "SCHOOL_ADMIN", "SUB_ADMIN"] as UserRole[],
      categories: ["basic"] as EducationCategory[],
    },
    {
      label: language === "en" ? "Report Cards" : "Bulletins",
      icon: FileBadge,
      href: "/dashboard/report-cards",
      roles: ["TEACHER"] as UserRole[],
      categories: ["basic"] as EducationCategory[],
    },
    {
      label: language === "en" ? "My Pupils" : "Mes eleves",
      icon: GraduationCap,
      href: "/dashboard/my-class",
      roles: ["TEACHER"] as UserRole[],
      categories: ["basic"] as EducationCategory[],
    },
    {
      label: language === "en" ? "Report Cards" : "Bulletins",
      icon: FileBadge,
      href: "/dashboard/report-cards",
      roles: ["PARENT"] as UserRole[],
      categories: ["basic"] as EducationCategory[],
    },
    {
      label: language === "en" ? "Health Records" : "Sante des eleves",
      icon: Heart,
      href: "/dashboard/health-records",
      roles: ["TEACHER", "SCHOOL_ADMIN", "SUB_ADMIN"] as UserRole[],
      categories: ["basic"] as EducationCategory[],
    },
    {
      label: language === "en" ? "Certificates" : "Certificats",
      icon: FileBadge,
      href: "/dashboard/certificates",
      roles: ["TEACHER", "SCHOOL_ADMIN", "SUB_ADMIN"] as UserRole[],
      categories: ["basic"] as EducationCategory[],
    },
    {
      label: "Enter Marks",
      icon: Award,
      href: "/dashboard/grades",
      roles: ["TEACHER"],
      categories: ["secondary", "higher"] as EducationCategory[],
    },
    {
      label: language === "en" ? "Nursery Ratings" : "Evaluations maternelle",
      icon: Shapes,
      href: "/dashboard/grades/nursery",
      roles: ["TEACHER", "SCHOOL_ADMIN", "SUB_ADMIN"],
      categories: ["basic"] as EducationCategory[],
    },
    {
      label: language === "en" ? "Report Comments" : "Appreciations du bulletin",
      icon: MessageSquareText,
      href: "/dashboard/grades/comments",
      roles: ["TEACHER", "SCHOOL_ADMIN", "SUB_ADMIN"],
      categories: ["basic"] as EducationCategory[],
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
    {
      label: language === "en" ? "School Events" : "Événements",
      icon: CalendarDays,
      href: "/dashboard/school-events",
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
      label: language === "en" ? "Surveys" : "Sondages",
      icon: ClipboardList,
      href: "/dashboard/surveys",
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
      roles: EXECUTIVE_ROLES,
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
      // Everyone who can introduce a school (everyone except students).
      label: "Refer & Earn",
      icon: Gift,
      href: "/dashboard/referrals",
      roles: [...EXECUTIVE_ROLES, "SCHOOL_ADMIN", "SUB_ADMIN", "TEACHER", "PARENT", "BURSAR", "LIBRARIAN"],
    },
    {
      // Part J: the partner workspace for a learner/staff/parent who activated
      // the partner programme on their own account; same login.
      label: "Partner workspace",
      icon: Handshake,
      href: "/dashboard/partner",
      roles: ["SCHOOL_ADMIN", "SUB_ADMIN", "TEACHER", "PARENT", "BURSAR", "LIBRARIAN"],
    },
    {
      label: t("feedback"),
      icon: MessageSquare,
      href: "/dashboard/feedback",
      roles: [...EXECUTIVE_ROLES, "SCHOOL_ADMIN", "SUB_ADMIN"],
    },
    {
      label: language === "en" ? "Draft" : "Brouillon",
      icon: Archive,
      href: "/dashboard/draft",
      roles: [...EXECUTIVE_ROLES, "SCHOOL_ADMIN", "SUB_ADMIN"],
    },
    {
      label: t("overview"),
      icon: LayoutDashboard,
      href: "/dashboard",
      roles: ["SCHOOL_ADMIN", "SUB_ADMIN", "STUDENT", "PARENT", "BURSAR", "LIBRARIAN"],
    },
    {
      label: t("overview"),
      icon: LayoutDashboard,
      href: "/dashboard",
      roles: ["TEACHER"] as UserRole[],
      categories: ["secondary", "higher"] as EducationCategory[],
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
      roles: ["SCHOOL_ADMIN", "SUB_ADMIN", "TEACHER", "STUDENT"],
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
      roles: ["SCHOOL_ADMIN", "SUB_ADMIN", "TEACHER", "STUDENT"],
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
      label: language === "en" ? "AI Credits" : "Credits IA",
      icon: Coins,
      href: "/dashboard/ai-credits",
      roles: ["SCHOOL_ADMIN", "SUB_ADMIN", "TEACHER", "STUDENT", "PARENT", "BURSAR", "LIBRARIAN"],
    },
    {
      label: language === "en" ? "AI Economics" : "Economie IA",
      icon: TrendingUp,
      href: "/dashboard/ai-economics",
      roles: [...EXECUTIVE_ROLES],
    },
    {
      label: "Feedback",
      icon: Sparkles,
      href: "/dashboard/ai-feedback",
      roles: ["SCHOOL_ADMIN", "SUB_ADMIN", "TEACHER"],
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

  // Role first, then registration: a feature whose app this school has not
  // registered never appears, in the menu or the Workspace grid.
  return arrangeBasicAdminMenu(
    routes.filter(
      (route) => route.roles.includes(normalizedRole || "") && showsForCategory(route, educationCategory) && !hiddenForBasic(route.href, normalizedRole, educationCategory) && canOpen(route.href) && canAccessModule(normalizedRole, (user as any)?.allowed_modules, MODULE_BY_HREF[route.href])
    ),
    normalizedRole,
    educationCategory,
    language
  );
}

// Basic (nursery/primary) schools: secondary-only tabs hidden for staff.
// Presentation only: the server enforces access.
const BASIC_HIDDEN_FOR_STAFF: Record<string, UserRole[]> = {
  "/dashboard/students/guidance-reports": ["TEACHER", "SCHOOL_ADMIN", "SUB_ADMIN"],
  "/dashboard/exams": ["TEACHER", "SCHOOL_ADMIN", "SUB_ADMIN"],
  "/dashboard/exams/manage": ["TEACHER", "SCHOOL_ADMIN", "SUB_ADMIN"],
  "/dashboard/exams/ai-generator": ["TEACHER", "SCHOOL_ADMIN", "SUB_ADMIN"],
  "/dashboard/exams/question-bank": ["TEACHER", "SCHOOL_ADMIN", "SUB_ADMIN"],
  "/dashboard/grades/skill-gap": ["TEACHER", "SCHOOL_ADMIN", "SUB_ADMIN", "PARENT"],
  "/dashboard/career-orientation": ["TEACHER", "SCHOOL_ADMIN", "SUB_ADMIN", "PARENT"],
  "/dashboard/roadmap": ["TEACHER", "SCHOOL_ADMIN", "SUB_ADMIN", "PARENT"],
  "/dashboard/students": ["TEACHER"],
  "/dashboard/live-classes": ["TEACHER"],
  "/dashboard/ai-assistant": ["TEACHER", "PARENT"],
  "/dashboard/ai-credits": ["TEACHER", "PARENT"],
  "/dashboard/ai-feedback": ["TEACHER"],
  "/dashboard/courses": ["TEACHER"],
  "/dashboard/library": ["TEACHER"],
  "/dashboard/assignments": ["TEACHER"],
};
const hiddenForBasic = (href: string, role: string | undefined, category: EducationCategory) =>
  category === "basic" && Boolean(role) && Boolean(BASIC_HIDDEN_FOR_STAFF[href]?.includes(role as UserRole));

// Basic (nursery/primary) schools: the head teacher / admin gets a short,
// ordered menu of what a primary school actually uses. Anything not listed
// here (exams, AI, courses, library, live classes, career, skill gap, ...) is
// hidden for SCHOOL_ADMIN / SUB_ADMIN. Presentation only: the server enforces
// access. Labels are [English, French].
const BASIC_ADMIN_MENU: Array<[string, string, string]> = [
  ["/dashboard", "Home", "Accueil"],
  ["/dashboard/students", "Pupils (add / import)", "Eleves (ajouter / importer)"],
  ["/dashboard/sections", "Sections", "Sections"],
  ["/dashboard/classes", "Classes", "Classes"],
  ["/dashboard/subjects", "Subjects", "Matieres"],
  ["/dashboard/attendance", "Attendance", "Presences"],
  ["/dashboard/grades", "Marks & report cards", "Notes et bulletins"],
  ["/dashboard/grades/nursery", "Nursery ratings", "Evaluations maternelle"],
  ["/dashboard/grades/comments", "Report comments", "Appreciations du bulletin"],
  ["/dashboard/conduct", "Conduct", "Conduite"],
  ["/dashboard/fees", "Fees", "Frais scolaires"],
  ["/dashboard/schedule", "Timetable", "Emploi du temps"],
  ["/dashboard/announcements", "Announcements", "Annonces"],
  ["/dashboard/school-events", "School events", "Evenements"],
  ["/dashboard/academics/years-and-terms", "Years & terms", "Annees et trimestres"],
  ["/dashboard/academics/promotions", "Promotion", "Passage de classe"],
  ["/dashboard/staff", "Staff", "Personnel"],
  ["/dashboard/id-cards", "ID cards", "Cartes scolaires"],
  ["/dashboard/health-records", "Health", "Sante des eleves"],
  ["/dashboard/certificates", "Certificates", "Certificats"],
  ["/dashboard/statistics", "Statistics", "Statistiques"],
  ["/dashboard/settings", "Settings", "Parametres"],
  ["/dashboard/subscription", "Subscription", "Abonnement"],
  ["/dashboard/partner", "Partner", "Partenaire"],
  ["/dashboard/referrals", "Refer & Earn", "Parrainage"],
  ["/dashboard/chat", "Messages", "Messages"],
  ["/dashboard/profile", "My profile", "Mon profil"],
];
function arrangeBasicAdminMenu<T extends { href: string; label: string }>(
  routes: T[],
  role: string | undefined,
  category: EducationCategory,
  language: string
): T[] {
  if (category !== "basic" || (role !== "SCHOOL_ADMIN" && role !== "SUB_ADMIN")) return routes;
  const seen = new Set<string>();
  const out: T[] = [];
  for (const [href, en, fr] of BASIC_ADMIN_MENU) {
    const route = routes.find((r) => r.href === href);
    if (!route || seen.has(href)) continue;
    seen.add(href);
    out.push({ ...route, label: language === "en" ? en : fr });
  }
  return out;
}

export function DashboardSidebar({ onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout, platformSettings } = useAuth();
  const { t } = useI18n();
  const { label: roleName } = useRoleLabel();
  const normalizedRole = ((user?.role || "").trim().toUpperCase() as UserRole) || undefined;
  const isSuperAdmin = EXECUTIVE_ROLES.includes(normalizedRole as UserRole);
  const schoolLogo = resolveMediaUrl(user?.school?.logo);
  const userAvatar = resolveMediaUrl(user?.avatar);
  const platformLogo = resolvePlatformLogoUrl(platformSettings.logo);
  const filteredRoutes = useDashboardRoutes();

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
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/50" title={roleDescription(user?.role)}>{roleName(user?.role, user)}</span>
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
