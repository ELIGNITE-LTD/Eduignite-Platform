"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { RedeemFlow } from "@/components/companion/redeem-flow";

const AUTHORIZED_ROLES = ["SCHOOL_ADMIN", "SUB_ADMIN"];

export default function CompanionActivatePage() {
  const { user } = useAuth();
  const isAuthorized = AUTHORIZED_ROLES.includes(user?.role || "");

  if (!isAuthorized) {
    return (
      <div className="rounded-2xl border bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-black text-primary">Companion</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only your school's administrator can activate or renew the EduIgnite Offline license.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      <div>
        <Link href="/dashboard/companion" className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-primary">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Companion
        </Link>
        <h1 className="mt-2 text-3xl font-black text-primary">Activate / Renew License</h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Scan the QR code shown on the EduIgnite Offline desktop app to activate a new install or renew an expiring
          license. Requires an internet connection (mobile data is fine).
        </p>
      </div>

      <RedeemFlow
        allowedPurposes={["activation", "renewal"]}
        title="Scan Activation / Renewal QR"
        description="Point the camera at the desktop app's QR code."
      />
    </div>
  );
}
