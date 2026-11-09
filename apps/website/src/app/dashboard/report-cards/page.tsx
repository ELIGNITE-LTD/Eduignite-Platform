"use client";

import { useAuth } from "@/lib/auth-context";
import { ParentReportCards, PrincipalOnlyNotice, StaffReportCards } from "@/components/dashboard/basic-report-cards";

/**
 * Basic Education report cards: parents see their children's published cards; only the principal
 * side generates, prints and downloads them. Teachers enter marks but never generate cards (the
 * server refuses them too), so they get a friendly explanation instead of the tool.
 */
export default function ReportCardsPage() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role === "PARENT") return <ParentReportCards />;
  if (user.role === "SCHOOL_ADMIN" || user.role === "SUB_ADMIN") return <StaffReportCards />;
  if (user.role === "TEACHER") return <PrincipalOnlyNotice />;
  return null;
}
