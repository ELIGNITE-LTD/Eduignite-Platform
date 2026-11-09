"use client";

import { HigherSectionPage } from "@/components/higher/higher-section-page";

export default function HigherLecturersPage() {
  return (
    <HigherSectionPage
      stepKey="lecturers"
      title="Lecturers"
      description="The lecturers who teach course units and enter results."
      primaryAction={{ label: "Back to setup steps", href: "/dashboard/higher/setup" }}
    />
  );
}
