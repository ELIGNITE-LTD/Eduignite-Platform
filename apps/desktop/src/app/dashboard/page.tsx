"use client";

import { useAuth } from "@/lib/auth-context";
import { Loader2 } from "lucide-react";
import { DashboardErrorBoundary } from "@/components/error-boundary";
import { ExecutiveDashboard } from "./components/executive-dashboard";
import { AdminDashboard } from "./components/admin-dashboard";
import { TeacherDashboard } from "./components/teacher-dashboard";
import { StudentDashboard } from "./components/student-dashboard";
import { ParentDashboard } from "./components/parent-dashboard";
import { LibrarianDashboard } from "./components/librarian-dashboard";
import { BursarDashboard } from "./components/bursar-dashboard";
import { DefaultDashboard } from "./components/default-dashboard";

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
    </DashboardErrorBoundary>
  );
}
