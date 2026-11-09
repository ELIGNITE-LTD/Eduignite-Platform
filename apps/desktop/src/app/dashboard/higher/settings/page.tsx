"use client";

import { HigherSectionPage } from "@/components/higher/higher-section-page";

export default function HigherSettingsPage() {
  return (
    <HigherSectionPage
      title="Settings"
      description="Your institution profile, logo and contact details."
      primaryAction={{ label: "Open institution settings", href: "/dashboard/settings" }}
    />
  );
}
