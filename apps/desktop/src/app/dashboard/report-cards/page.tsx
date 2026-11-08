"use client";

import { useAuth } from "@/lib/auth-context";
import { ParentReportCards, StaffReportCards } from "@/components/dashboard/basic-report-cards";

/** Basic Education report cards: parents see their children's, class teachers and admins a whole class. */
export default function ReportCardsPage() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role === "PARENT") return <ParentReportCards />;
  if (user.role === "TEACHER" || user.role === "SCHOOL_ADMIN" || user.role === "SUB_ADMIN") return <StaffReportCards />;
  return null;
}
