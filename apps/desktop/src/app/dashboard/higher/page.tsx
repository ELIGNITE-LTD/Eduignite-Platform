"use client";

import { useAuth } from "@/lib/auth-context";
import { HigherAdminHome, HigherBursarHome, HigherLecturerHome, HigherParentHome, HigherStudentHome } from "@/components/higher/higher-role-homes";

export default function HigherOverviewPage() {
  const { user } = useAuth();
  const role = String(user?.role || "").toUpperCase();
  if (role === "STUDENT") return <HigherStudentHome />;
  if (role === "BURSAR") return <HigherBursarHome />;
  if (role === "PARENT") return <HigherParentHome />;
  if (role === "TEACHER") return <HigherLecturerHome />;
  return <HigherAdminHome />;
}
