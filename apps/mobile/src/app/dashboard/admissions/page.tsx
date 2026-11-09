"use client";

import { useState } from "react";

import { AdmissionSettingsForm, ApplicationsPanel } from "@/components/admissions/admissions-panels";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";

/**
 * Admissions: online applications from the school's public site. The panels
 * are shared with the Enrollment tab of the school website manager.
 */
export default function AdmissionsPage() {
  const { user } = useAuth();
  const { language } = useI18n();
  const fr = language === "fr";
  const L = (en: string, frText: string) => (fr ? frText : en);
  const allowed = user?.role === "SCHOOL_ADMIN" || user?.role === "SUB_ADMIN";
  const [tab, setTab] = useState<"applications" | "settings">("applications");

  if (!allowed) {
    return <p className="p-6 text-sm text-muted-foreground">{L("Only the school administration can manage admissions.", "Seule l'administration de l'école peut gérer les admissions.")}</p>;
  }
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold">{L("Admissions", "Admissions")}</h1>
        <p className="text-sm text-muted-foreground">{L("Online applications from your public website.", "Demandes en ligne reçues depuis votre site public.")}</p>
      </div>
      <div role="tablist" className="flex gap-2 border-b">
        {(["applications", "settings"] as const).map((k) => (
          <button
            key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${tab === k ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
          >
            {k === "applications" ? L("Applications", "Demandes") : L("Settings", "Paramètres")}
          </button>
        ))}
      </div>
      {tab === "applications" ? <ApplicationsPanel fr={fr} /> : <AdmissionSettingsForm fr={fr} />}
    </div>
  );
}
