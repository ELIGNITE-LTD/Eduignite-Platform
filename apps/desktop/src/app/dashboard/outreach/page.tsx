"use client";

import { hasExecutiveModule } from "@/lib/executive-modules";
import { useAuth } from "@/lib/auth-context";
import { OutreachManager } from "@/components/outreach/manager";
import { useTr } from "@/components/school-website/shared";

/** Founders' outreach: email schools about EduIgnite. Access is enforced by the server. */
export default function OutreachPage() {
  const { user } = useAuth();
  const tr = useTr();

  if (hasExecutiveModule(user as any, "outreach")) return <OutreachManager />;

  return (
    <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
      {tr("Outreach is not available for your account.", "La prospection n'est pas disponible pour votre compte.")}
    </p>
  );
}
