"use client";

import { HigherSectionPage } from "@/components/higher/higher-section-page";

export default function HigherFinancePage() {
  return (
    <HigherSectionPage
      title="Finance"
      description="Tuition and payments. Fees are collected per programme and academic year."
      primaryAction={{ label: "Open fees and payments", href: "/dashboard/fees" }}
    />
  );
}
