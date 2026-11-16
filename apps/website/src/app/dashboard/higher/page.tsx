"use client";

import { useAuth } from "@/lib/auth-context";
import { HigherSetupChecklist } from "@/components/higher/higher-setup-checklist";
import { HigherBursarHome, HigherParentHome, HigherStudentHome } from "@/components/higher/higher-role-homes";

export default function HigherOverviewPage() {
  const { user } = useAuth();
  const role = String(user?.role || "").toUpperCase();
  if (role === "STUDENT") return <HigherStudentHome />;
  if (role === "BURSAR") return <HigherBursarHome />;
  if (role === "PARENT") return <HigherParentHome />;
  const institution = user?.school?.shortName || user?.school?.name || "your institution";
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <div>
        <h1 className="font-headline text-2xl font-bold tracking-tight">Welcome to {institution}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Here is what to do next.</p>
      </div>
      <HigherSetupChecklist />
    </div>
  );
}
