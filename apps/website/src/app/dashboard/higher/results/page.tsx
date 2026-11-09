"use client";

import { HigherSectionPage } from "@/components/higher/higher-section-page";

export default function HigherResultsPage() {
  return (
    <HigherSectionPage
      stepKey="grading"
      title="Results"
      description="Results by course unit and semester, and the grading scale you use."
      primaryAction={{ label: "Back to setup steps", href: "/dashboard/higher/setup" }}
    />
  );
}
