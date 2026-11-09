"use client";

import { HigherSectionPage } from "@/components/higher/higher-section-page";

export default function HigherDepartmentsPage() {
  return (
    <HigherSectionPage
      stepKey="departments"
      title="Departments"
      description="The departments of your institution, such as Computer Science or Law."
      primaryAction={{ label: "Back to setup steps", href: "/dashboard/higher/setup" }}
    />
  );
}
