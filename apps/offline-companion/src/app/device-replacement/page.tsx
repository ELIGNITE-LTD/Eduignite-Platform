"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { RedeemFlow } from "@/components/redeem-flow";
import { AppHeader } from "@/components/app-header";
import { Card } from "@/components/ui/card";

const AUTHORIZED_ROLES = ["SCHOOL_ADMIN", "SUB_ADMIN"];

export default function DeviceReplacementPage() {
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
          title="Device Replacement"
          subtitle={
            "Use this after a genuine hardware failure or upgrade. On the new computer, start EduIgnite Offline and choose \"Replace Device\" to generate a single-use challenge QR, then scan it here. The old device's license will be deactivated by the server."
          }
          backHref="/activate/"
          backLabel="Back to Activate"
        />

        {!isAuthorized ? (
          <Card className="p-6">
            <p className="text-sm text-gray-500">
              Only your school&rsquo;s administrator can request a device replacement.
            </p>
          </Card>
        ) : (
          <RedeemFlow
            allowedPurposes={["device_replacement"]}
            title="Scan Device Replacement QR"
            description="Point the camera at the new device's replacement challenge QR code."
          />
        )}
      </div>
    </main>
  );
}
