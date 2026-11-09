"use client";

import { useRoleLabel } from "@/lib/role-labels";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth, type UserRole } from "@/lib/auth-context";
import { roleDescription } from "@/lib/role-info";
import { canAccessModule, canOpenExecutiveRoute } from "@/lib/executive-modules";
import { useI18n } from "@/lib/i18n-context";
import { useSchoolSettings } from "@/lib/hooks/useSchools";
import { useEducationCategory } from "@/lib/hooks/useEducationCategory";
import type { EducationCategory } from "@/lib/cameroon-education-system";
import { useMemo } from "react";
import { useMyApps } from "@/lib/hooks/useRegistry";
import { isRouteAvailable } from "@/lib/api/services/registry";
import { cn } from "@/lib/utils";
import { resolveMediaUrl } from "@/lib/media";
import { useMySiteStatus } from "@/lib/hooks/usePublicSite";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  LayoutDashboard,
  Building2,
  KeyRound,
  Boxes,
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
  ScrollText,
  Handshake,
  Gift,
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
  Database,
  Map,
  Radar,
  History,
  Archive,
  QrCode,
  ClipboardList,
  MonitorPlay,
  TrendingUp,
  CalendarDays,
  MessageSquareText,
  Shapes,
  ExternalLink,
  Headset,
  LifeBuoy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolvePlatformLogoUrl } from "@/lib/platform-brand";

interface SidebarProps {
  onClose?: () => void;
}

const EXECUTIVE_ROLES: UserRole[] = ["SUPER_ADMIN", "CEO", "CTO", "COO", "INV", "DESIGNER", "SYSTEM_DEV"];
const BLOG_ROLES: UserRole[] = ["SUPER_ADMIN", "CEO", "CTO", "COO", "INV", "DESIGNER", "SYSTEM_DEV"];
const STAFF_ROLES: UserRole[] = ["TEACHER", "BURSAR", "LIBRARIAN"];

// Menu entries may carry an optional `categories` list; entries without one
// show for every school. Presentation only: the server enforces access.
const showsForCategory = (route: object, category: EducationCategory) => {
  const categories = (route as { categories?: EducationCategory[] }).categories;
  return !categories?.length || categories.includes(category);
};

// Higher education: school staff get only the higher menu plus these shared
// tabs, so no secondary-only screen (classes, sections, promotion, sequences,
// report cards, ...) shows up. Presentation only: the server enforces access.
const HIGHER_SHARED_HREFS = [
  "/dashboard/profile",
  "/dashboard/help",
  "/dashboard/chat",
  "/dashboard/announcements",
  "/dashboard/notifications",
  "/dashboard/subscription",
];
const hiddenForHigher = (route: object, role: string | undefined, category: EducationCategory) => {
  if (category !== "higher" || !role || !["SCHOOL_ADMIN", "SUB_ADMIN", "TEACHER"].includes(role)) return false;
  const { href, categories } = route as { href: string; categories?: EducationCategory[] };
  if (categories?.includes("higher")) return false;
  return !HIGHER_SHARED_HREFS.includes(href);
};

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
  ["/dashboard/hierarchy", "Hierarchy & Sections", "Hierarchie & Sections"],
  ["/dashboard/attendance", "Attendance", "Presences"],
  ["/dashboard/grades", "Marks & report cards", "Notes et bulletins"],
  ["/dashboard/grades/nursery", "Nursery ratings", "Evaluations maternelle"],
  ["/dashboard/grades/comments", "Report comments", "Appreciations du bulletin"],
  ["/dashboard/conduct", "Conduct", "Conduite"],
  ["/dashboard/fees", "Fees", "Frais scolaires"],
  ["/dashboard/schedule", "Timetable", "Emploi du temps"],
  ["/dashboard/announcements", "Announcements", "Annonces"],
  ["/dashboard/school-events", "School events", "Evenements"],
  ["/dashboard/school-website", "School website", "Site web de l'ecole"],
  ["/dashboard/admissions", "Admissions", "Admissions"],
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
  ["/dashboard/help", "Help / Customer Care", "Aide / Service Client"],
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

// Executive activities the founders assign (see lib/executive-modules). A nav
// item here is only shown to a non-primary executive when its module is in
// their allowed_modules. CEO/CTO and non-executive roles are never gated by
// this. Items not listed here are default tabs (overview, profile, chat, etc.).
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
  "/dashboard/customer-care": "customer_care",
};

export function DashboardSidebar({ onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout, platformSettings } = useAuth();
  const educationCategory = useEducationCategory();
  const { t, language } = useI18n();
  const { label: roleName } = useRoleLabel();
  const normalizedRole = ((user?.role || "").trim().toUpperCase() as UserRole) || undefined;

  const isSuperAdmin = EXECUTIVE_ROLES.includes(normalizedRole as UserRole);
  const isDesigner = normalizedRole === "DESIGNER";
  const isBursar = normalizedRole === "BURSAR";
  const isSchoolAdmin = normalizedRole === "SCHOOL_ADMIN" || normalizedRole === "SUB_ADMIN";
  const isTeacherRole = normalizedRole === "TEACHER";
  const { data: myApps } = useMyApps();
  // Every route any catalogue app claims, installed or not, so a route of an
  // app this school lacks is recognised as gated rather than as a core page.
  const allClaimedRoutes = useMemo(
    () => myApps?.claimed_routes ?? (myApps?.apps || []).flatMap((app) => app.routes),
    [myApps]
  );
  // Everyone in a school except its administrators (who manage the site from
  // their own tab) gets a link that opens the school's public page.
  const showsPublicWebsiteLink =
    Boolean(user?.school?.id) && ["TEACHER", "STUDENT", "PARENT", "BURSAR", "LIBRARIAN"].includes(normalizedRole || "");
  const { data: mySite, isLoading: mySiteLoading } = useMySiteStatus(showsPublicWebsiteLink);
  const publicWebsiteUrl = mySite?.is_live && mySite.slug ? `/schools/${mySite.slug}` : null;
  const { data: sidebarSchoolSettings } = useSchoolSettings(isTeacherRole ? (user?.school?.id || "") : "");
  const classMastersCanEditStudents = Boolean((sidebarSchoolSettings as any)?.class_masters_can_edit_students);
  const schoolLogo = resolveMediaUrl(user?.school?.logo);
  const userAvatar = resolveMediaUrl(user?.avatar);
  const platformLogo = resolvePlatformLogoUrl(platformSettings.logo);

  const routes = [
    // Higher education (universities, institutes): a short menu in plain words.
    // Presentation only: the server enforces access.
    {
      label: language === "en" ? "Overview" : "Vue d'ensemble",
      icon: LayoutDashboard,
      href: "/dashboard/higher",
      roles: ["SCHOOL_ADMIN", "SUB_ADMIN", "TEACHER", "BURSAR"] as UserRole[],
      categories: ["higher"] as EducationCategory[],
    },
    {
      label: language === "en" ? "Setup" : "Configuration",
      icon: ClipboardList,
      href: "/dashboard/higher/setup",
      roles: ["SCHOOL_ADMIN", "SUB_ADMIN"] as UserRole[],
      categories: ["higher"] as EducationCategory[],
    },
    {
      label: language === "en" ? "Departments" : "Departements",
      icon: Building2,
      href: "/dashboard/higher/departments",
      roles: ["SCHOOL_ADMIN", "SUB_ADMIN"] as UserRole[],
      categories: ["higher"] as EducationCategory[],
    },
    {
      label: language === "en" ? "Programmes" : "Filieres",
      icon: GraduationCap,
      href: "/dashboard/higher/programmes",
      roles: ["SCHOOL_ADMIN", "SUB_ADMIN"] as UserRole[],
      categories: ["higher"] as EducationCategory[],
    },
    {
      label: language === "en" ? "Course units" : "Unites d'enseignement",
      icon: BookOpen,
      href: "/dashboard/higher/course-units",
      roles: ["SCHOOL_ADMIN", "SUB_ADMIN", "TEACHER"] as UserRole[],
      categories: ["higher"] as EducationCategory[],
    },
    {
      label: language === "en" ? "Lecturers" : "Enseignants",
      icon: Users,
      href: "/dashboard/higher/lecturers",
      roles: ["SCHOOL_ADMIN", "SUB_ADMIN"] as UserRole[],
      categories: ["higher"] as EducationCategory[],
    },
    {
      label: language === "en" ? "Students" : "Etudiants",
      icon: Users,
      href: "/dashboard/higher/students",
      roles: ["SCHOOL_ADMIN", "SUB_ADMIN", "TEACHER"] as UserRole[],
      categories: ["higher"] as EducationCategory[],
    },
    {
      label: language === "en" ? "Results" : "Resultats",
      icon: Award,
      href: "/dashboard/higher/results",
      roles: ["SCHOOL_ADMIN", "SUB_ADMIN", "TEACHER"] as UserRole[],
      categories: ["higher"] as EducationCategory[],
    },
    {
      label: language === "en" ? "Finance" : "Finance",
      icon: Coins,
      href: "/dashboard/higher/finance",
      roles: ["SCHOOL_ADMIN", "SUB_ADMIN", "BURSAR"] as UserRole[],
      categories: ["higher"] as EducationCategory[],
    },
    {
      label: language === "en" ? "Settings" : "Parametres",
      icon: Settings2,
      href: "/dashboard/higher/settings",
      roles: ["SCHOOL_ADMIN"] as UserRole[],
      categories: ["higher"] as EducationCategory[],
    },
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
      // Open to everyone who can introduce a school, which is everyone except
      // students: they are the people a school exists to teach, and paying a
      // child to bring schools in is not a position to put them in.
      label: "Refer & Earn",
      icon: Gift,
      href: "/dashboard/referrals",
      roles: [
        ...EXECUTIVE_ROLES,
        "SCHOOL_ADMIN",
        "SUB_ADMIN",
        "TEACHER",
        "PARENT",
        "BURSAR",
        "LIBRARIAN",
      ],
    },
    {
      // Part J: a learner/staff/parent who activated the partner programme on
      // their own account reaches their partner workspace here, in the same
      // login. Non-partners who open it are shown how to activate. Executives
      // run the programme from the admin "Partners" console instead, so they
      // are not offered this personal workspace.
      label: "Partner workspace",
      icon: Handshake,
      href: "/dashboard/partner",
      roles: ["SCHOOL_ADMIN", "SUB_ADMIN", "TEACHER", "PARENT", "BURSAR", "LIBRARIAN"],
    },
    {
      label: t("founders"),
      icon: Crown,
      href: "/dashboard/founders",
      roles: EXECUTIVE_ROLES,
    },
    {
      // Founders only (CEO and CTO, equal rights): what every executive did.
      label: language === "en" ? "System Log" : "Journal du système",
      icon: ScrollText,
      href: "/dashboard/system-log",
      roles: ["CEO", "CTO"],
    },
    {
      // Founders (CEO/CTO, equal) always; other executives only when granted
      // the Customer Care module. The server enforces the same rule.
      label: language === "en" ? "Customer Care" : "Service Client",
      icon: Headset,
      href: "/dashboard/customer-care",
      roles: EXECUTIVE_ROLES,
    },
    {
      label: "Partners",
      icon: Handshake,
      href: "/dashboard/partners",
      roles: EXECUTIVE_ROLES,
    },
    {
      // EduIgnite Academy has its own admin console at /academy/admin — same
      // login, no separate account, but it lives outside /dashboard's route
      // tree entirely, so it needs its own explicit entry point here or it's
      // unreachable except by typing the URL. Gated to the same roles the
      // console itself recognizes (see canSeeAcademyCms in
      // academy/admin/_lib/permissions.ts) — COO runs it day-to-day,
      // CEO/CTO oversee and can also author courses directly.
      label: "Academy",
      icon: GraduationCap,
      href: "/academy/admin",
      roles: EXECUTIVE_ROLES,
    },
    {
      label: t("schools"),
      icon: Globe,
      href: "/dashboard/schools",
      roles: EXECUTIVE_ROLES,
    },
    {
      // The school's public website: the administrator manages it, a sub-admin
      // views it, and the founders oversee every school's publication status.
      label: language === "en" ? "School Website" : "Site web de l'ecole",
      icon: Globe,
      href: "/dashboard/school-website",
      roles: ["SCHOOL_ADMIN", "SUB_ADMIN", ...EXECUTIVE_ROLES] as UserRole[],
    },
    {
      // Online applications from the school's public website.
      label: "Admissions",
      icon: ClipboardList,
      href: "/dashboard/admissions",
      roles: ["SCHOOL_ADMIN", "SUB_ADMIN"] as UserRole[],
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
      label: language === "en" ? "Hierarchy & Sections" : "Hierarchie & Sections",
      icon: Network,
      href: "/dashboard/community",
      roles: ["SCHOOL_ADMIN"],
      categories: ["secondary"] as EducationCategory[],
    },
    {
      label: language === "en" ? "Hierarchy & Sections" : "Hierarchie & Sections",
      icon: Network,
      href: "/dashboard/hierarchy",
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
      roles: ["SCHOOL_ADMIN", "SUB_ADMIN"] as UserRole[],
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
      categories: ["secondary"] as EducationCategory[],
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
    {
      label: language === "en" ? "Community Portal" : "Portail Communautaire",
      icon: MessageCircle,
      href: "/dashboard/community",
      roles: EXECUTIVE_ROLES,
    },
    {
      // The school directory: students, staff, parents and events.
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
      categories: ["secondary"] as EducationCategory[],
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
      label: language === "fr" ? "Vue d'ensemble" : "Overview",
      icon: LayoutDashboard,
      href: "/dashboard",
      roles: ["PROPRIETOR"],
    },
    {
      label: language === "fr" ? "Mes écoles" : "My Schools",
      icon: Building2,
      href: "/dashboard/proprietor/schools",
      roles: ["PROPRIETOR"],
    },
    {
      label: language === "fr" ? "Comptes administrateurs" : "Admin Accounts",
      icon: KeyRound,
      href: "/dashboard/proprietor/admins",
      roles: ["PROPRIETOR"],
    },
    {
      // The customer side of Customer Care: write to EduIgnite and read the
      // answers. A different route from the staff dashboard on purpose.
      label: language === "en" ? "Help / Customer Care" : "Aide / Service Client",
      icon: LifeBuoy,
      href: "/dashboard/help",
      roles: ["PROPRIETOR", "SCHOOL_ADMIN", "SUB_ADMIN", "TEACHER", "STUDENT", "PARENT", "BURSAR", "LIBRARIAN"],
    },
    {
      label: t("profile"),
      icon: User,
      href: "/dashboard/profile",
      roles: ["PROPRIETOR", ...EXECUTIVE_ROLES, "SCHOOL_ADMIN", "SUB_ADMIN", "TEACHER", "STUDENT", "PARENT", "BURSAR", "LIBRARIAN"],
    },
  ];

  // Role first, then entitlement: a route an app owns only shows when the
  // school actually has that app. Routes no app claims belong to Core and are
  // always allowed, so an empty or failed registry response never blanks the
  // sidebar. This is presentation only — the server enforces the same rule.
  const roleRoutes = routes.filter(
    (route) =>
      route.roles.includes(normalizedRole || "") &&
      showsForCategory(route, educationCategory) && !hiddenForHigher(route, normalizedRole, educationCategory) && !hiddenForBasic(route.href, normalizedRole, educationCategory) &&
      canAccessModule(normalizedRole, (user as any)?.allowed_modules, MODULE_BY_HREF[route.href]) && canOpenExecutiveRoute(normalizedRole, (user as any)?.allowed_modules, route.href)
  );
  const filteredRoutes = arrangeBasicAdminMenu(
    roleRoutes.filter((route) => isRouteAvailable(route.href, myApps?.routes, allClaimedRoutes)),
    normalizedRole,
    educationCategory,
    language
  );

  // Uploaded apps contribute their own screens, which are not in the built-in
  // route list above. Each screen the caller's role may open becomes a nav
  // entry here, so an installed app appears in the menu of every account that
  // has it — teacher, admin or founder alike. The server enforces access
  // regardless; this is only what the person sees.
  const appRoutes = (myApps?.apps || [])
    .filter((app) => Array.isArray((app as any).screens) && (app as any).screens.length)
    .flatMap((app) =>
      (app as any).screens
        .filter(
          (screen: any) =>
            (!screen.roles?.length || screen.roles.includes(normalizedRole || "")) &&
            canOpenExecutiveRoute(normalizedRole, (user as any)?.allowed_modules, screen.route)
        )
        .map((screen: any) => ({
          href: screen.route as string,
          label: screen.title as string,
          appName: app.name as string,
        }))
    );

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
              {isSuperAdmin ? platformSettings.name || "Platform Board" : normalizedRole === "PROPRIETOR" ? (language === "fr" ? "Propriétaire" : "Proprietor") : user?.school?.shortName || user?.school?.name || "Institution"}
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

          {showsPublicWebsiteLink && (
            publicWebsiteUrl ? (
              <a
                href={publicWebsiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => onClose?.()}
                className="group flex min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 text-white/60 transition-all duration-200 hover:bg-white/10"
              >
                <Globe className="h-5 w-5 text-white/60 group-hover:text-white" />
                <span className="min-w-0 break-words text-sm font-medium leading-snug">
                  {language === "en" ? "Public Website" : "Site public"}
                </span>
                <ExternalLink className="ml-auto h-3.5 w-3.5 shrink-0 text-white/40" aria-hidden />
              </a>
            ) : (
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      role="link"
                      aria-disabled="true"
                      tabIndex={0}
                      className="flex min-w-0 cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-white/30"
                    >
                      <Globe className="h-5 w-5" />
                      <span className="min-w-0 break-words text-sm font-medium leading-snug">
                        {language === "en" ? "Public Website" : "Site public"}
                      </span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {mySiteLoading
                      ? language === "en" ? "Checking..." : "Verification..."
                      : language === "en"
                        ? "Your school website is not published yet"
                        : "Le site de votre ecole n'est pas encore publie"}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )
          )}

          {/* Screens contributed by installed uploaded apps. */}
          {appRoutes.length > 0 && (
            <div className="mt-3 border-t border-white/10 pt-3">
              <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-white/30">
                Apps
              </p>
              {appRoutes.map((route) => (
                <Link
                  key={route.href}
                  href={route.href}
                  onClick={() => onClose?.()}
                  className={cn(
                    "group flex min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-200 hover:bg-white/10",
                    pathname === route.href ? "bg-white/20 text-white" : "text-white/60"
                  )}
                >
                  <Boxes className={cn("h-5 w-5", pathname === route.href ? "text-secondary" : "text-white/60 group-hover:text-white")} />
                  <span className="min-w-0 break-words text-sm font-medium leading-snug">{route.label}</span>
                </Link>
              ))}
            </div>
          )}
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
