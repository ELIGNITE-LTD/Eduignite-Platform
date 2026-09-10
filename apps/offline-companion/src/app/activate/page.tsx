"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { RedeemFlow } from "@/components/redeem-flow";
import { AppHeader } from "@/components/app-header";
import { Card } from "@/components/ui/card";

const AUTHORIZED_ROLES = ["SCHOOL_ADMIN", "SUB_ADMIN"];

export default function ActivatePage() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login/");
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isAuthorized = AUTHORIZED_ROLES.includes(user?.role || "");

  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-sm space-y-6">
        <AppHeader
          title="Activate / Renew License"
          subtitle="Scan the QR code shown on the EduIgnite Offline desktop app to activate a new install or renew an expiring license. Requires an internet connection (mobile data is fine)."
          backHref="/workspace/"
        />

        {!isAuthorized ? (
          <Card className="p-6">
            <p className="text-sm text-gray-500">
              Only your school&rsquo;s administrator can activate or renew the EduIgnite Offline license.
            </p>
          </Card>
        ) : (
          <RedeemFlow
            allowedPurposes={["activation", "renewal"]}
            title="Scan Activation / Renewal QR"
            description="Point the camera at the desktop app's QR code."
          />
        )}
      </div>
    </main>
  );
}
