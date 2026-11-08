"use client";

import { useAuth } from "@/lib/auth-context";
import { SchoolWebsiteManager } from "@/components/school-website/manager";
import { FounderSitesPanel } from "@/components/school-website/founder-panel";
import { useTr } from "@/components/school-website/shared";

/**
 * Public website management for a school (SCHOOL_ADMIN edits, SUB_ADMIN views)
 * and the founders' oversight list (CEO/CTO). Named school-website to stay apart
 * from the EduIgnite marketing-site CMS ("Public Website" in platform settings).
 * Access is enforced by the server; this page only chooses what to show.
 */
export default function SchoolWebsitePage() {
  const { user } = useAuth();
  const tr = useTr();
  const role = user?.role;

  if (role === "CEO" || role === "CTO") return <FounderSitesPanel />;
  if (role === "SCHOOL_ADMIN" || role === "SUB_ADMIN") return <SchoolWebsiteManager />;

  return (
    <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
      {tr("Only the school administration manages the school website.", "Seule l'administration de l'ecole gere le site de l'ecole.")}
    </p>
  );
}
