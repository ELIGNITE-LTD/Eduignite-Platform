"use client";

import { HigherSectionPage } from "@/components/higher/higher-section-page";

export default function HigherCourseUnitsPage() {
  return (
    <HigherSectionPage
      stepKey="course_units"
      title="Course units"
      description="What is taught in each programme, with credits and semester."
      primaryAction={{ label: "Back to setup steps", href: "/dashboard/higher/setup" }}
    />
  );
}
