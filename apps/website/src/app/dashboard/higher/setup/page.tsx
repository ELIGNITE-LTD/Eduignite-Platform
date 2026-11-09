"use client";

import { HigherSetupChecklist } from "@/components/higher/higher-setup-checklist";

export default function HigherSetupPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <div>
        <h1 className="font-headline text-2xl font-bold tracking-tight">Setup</h1>
        <p className="mt-1 text-sm text-muted-foreground">Follow these steps once. You can come back to any step later.</p>
      </div>
      <HigherSetupChecklist />
    </div>
  );
}
