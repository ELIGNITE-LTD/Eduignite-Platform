"use client";

import { HigherSectionPage } from "@/components/higher/higher-section-page";

export default function HigherStudentsPage() {
  return (
    <HigherSectionPage
      stepKey="students"
      title="Students"
      description="Students enrolled in your programmes, year by year."
      primaryAction={{ label: "Back to setup steps", href: "/dashboard/higher/setup" }}
    />
  );
}
