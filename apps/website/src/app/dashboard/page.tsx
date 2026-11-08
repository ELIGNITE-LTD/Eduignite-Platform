"use client";

import dynamic from "next/dynamic";
import { useAuth } from "@/lib/auth-context";
import { Loader2 } from "lucide-react";
import { DashboardErrorBoundary } from "@/components/error-boundary";
import { ExploreAndRefer } from "@/components/dashboard/explore-and-refer";

// Every one of these pulls in its own Recharts usage. Loading all seven
// statically meant every student/parent/teacher/librarian/bursar/admin/
// executive downloaded the JS for the six dashboards they'd never see, on
// the single most-visited page in the app (the landing page after login).
// next/dynamic ensures only the resolved role's chunk is fetched.
const dashboardLoading = (
  <div className="flex h-[60vh] items-center justify-center">
    <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
  </div>
);

const ExecutiveDashboard = dynamic(() => import("./components/executive-dashboard").then((m) => m.ExecutiveDashboard), { loading: () => dashboardLoading });
const AdminDashboard = dynamic(() => import("./components/admin-dashboard").then((m) => m.AdminDashboard), { loading: () => dashboardLoading });
const TeacherDashboard = dynamic(() => import("./components/teacher-dashboard").then((m) => m.TeacherDashboard), { loading: () => dashboardLoading });
const StudentDashboard = dynamic(() => import("./components/student-dashboard").then((m) => m.StudentDashboard), { loading: () => dashboardLoading });
const ParentDashboard = dynamic(() => import("./components/parent-dashboard").then((m) => m.ParentDashboard), { loading: () => dashboardLoading });
const LibrarianDashboard = dynamic(() => import("./components/librarian-dashboard").then((m) => m.LibrarianDashboard), { loading: () => dashboardLoading });
const BursarDashboard = dynamic(() => import("./components/bursar-dashboard").then((m) => m.BursarDashboard), { loading: () => dashboardLoading });
const DefaultDashboard = dynamic(() => import("./components/default-dashboard").then((m) => m.DefaultDashboard), { loading: () => dashboardLoading });

export default function DashboardPage() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <p className="text-sm text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const role = user?.role;

  // Determine which dashboard to render based on user role
  let DashboardComponent;
  let moduleName = "Unknown";

  switch (role) {
    case "SUPER_ADMIN":
    case "CEO":
    case "CTO":
    case "COO":
    case "INV":
    case "DESIGNER":
    case "SYSTEM_DEV":
      DashboardComponent = ExecutiveDashboard;
      moduleName = "ExecutiveDashboard";
      break;

    case "SCHOOL_ADMIN":
    case "SUB_ADMIN":
      DashboardComponent = AdminDashboard;
      moduleName = "AdminDashboard";
      break;

    case "TEACHER":
      DashboardComponent = TeacherDashboard;
      moduleName = "TeacherDashboard";
      break;

    case "STUDENT":
      DashboardComponent = StudentDashboard;
      moduleName = "StudentDashboard";
      break;

    case "PARENT":
      DashboardComponent = ParentDashboard;
      moduleName = "ParentDashboard";
      break;

    case "LIBRARIAN":
      DashboardComponent = LibrarianDashboard;
      moduleName = "LibrarianDashboard";
      break;

    case "BURSAR":
      DashboardComponent = BursarDashboard;
      moduleName = "BursarDashboard";
      break;

    default:
      DashboardComponent = DefaultDashboard;
      moduleName = "DefaultDashboard";
  }

  return (
    <DashboardErrorBoundary moduleName={moduleName}>
      <DashboardComponent />
      {/* Everyone gets these, whatever their role: the public site, and their
          own link for inviting another school. */}
      <div className="mt-6 md:mt-8">
        <ExploreAndRefer />
      </div>
    </DashboardErrorBoundary>
  );
}
