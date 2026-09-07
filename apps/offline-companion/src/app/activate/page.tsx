"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { RedeemFlow } from "@/components/redeem-flow";

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
        <div>
          <Link href="/home/" className="inline-flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-primary">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Companion
          </Link>
          <h1 className="mt-2 text-2xl font-black text-primary">Activate / Renew License</h1>
          <p className="mt-2 text-sm text-gray-500">
            Scan the QR code shown on the EduIgnite Offline desktop app to activate a new install or renew an
            expiring license. Requires an internet connection (mobile data is fine).
          </p>
        </div>

        {!isAuthorized ? (
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <p className="text-sm text-gray-500">
              Only your school's administrator can activate or renew the EduIgnite Offline license.
            </p>
          </div>
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
