"use client";

import { HigherSectionPage } from "@/components/higher/higher-section-page";

export default function HigherProgrammesPage() {
  return (
    <HigherSectionPage
      stepKey="programmes"
      title="Programmes"
      description="The degrees and diplomas you award, and how many years each lasts."
      primaryAction={{ label: "Back to setup steps", href: "/dashboard/higher/setup" }}
    />
  );
}
