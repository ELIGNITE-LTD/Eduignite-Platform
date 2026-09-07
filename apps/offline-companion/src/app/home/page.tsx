"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, LogOut, ScanLine, ShieldCheck, Wrench } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { UpdateBanner } from "@/components/update-banner";

const AUTHORIZED_ROLES = ["SCHOOL_ADMIN", "SUB_ADMIN"];

/**
 * The app's entire feature surface: an update banner and two entry points
 * (activate/renew, device replacement). By design there is nothing else
 * here — no dashboard, no messaging, no student/teacher features (see
 * wave3-contract.md — this app exists so a school doesn't need the full
 * EduIgnite Mobile app just to run the QR licensing flows).
 */
export default function HomePage() {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
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
        <header className="flex items-start justify-between">
          <div>
            <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-white shadow-lg">
              <ScanLine className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-black text-primary">Companion</h1>
            <p className="text-sm text-gray-500">{user?.school?.name || user?.name}</p>
          </div>
          <button
            type="button"
            onClick={() => logout().then(() => router.replace("/login/"))}
            aria-label="Sign out"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition hover:bg-gray-50"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </header>

        <UpdateBanner />

        {!isAuthorized ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Licensing actions are restricted to your school's administrator account.
          </div>
        ) : null}

        <div className="space-y-4">
          <Link
            href={isAuthorized ? "/activate/" : "#"}
            className={
              "block rounded-2xl bg-white p-5 shadow-xl transition hover:-translate-y-0.5" +
              (!isAuthorized ? " pointer-events-none opacity-50" : "")
            }
          >
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <p className="text-lg font-black text-primary">Activate / Renew License</p>
            <p className="mt-1 text-sm text-gray-500">
              Scan the offline desktop's QR code to activate a new install or renew an expiring license.
            </p>
          </Link>

          <Link
            href={isAuthorized ? "/device-replacement/" : "#"}
            className={
              "block rounded-2xl bg-white p-5 shadow-xl transition hover:-translate-y-0.5" +
              (!isAuthorized ? " pointer-events-none opacity-50" : "")
            }
          >
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
              <Wrench className="h-5 w-5 text-primary" />
            </div>
            <p className="text-lg font-black text-primary">Device Replacement</p>
            <p className="mt-1 text-sm text-gray-500">
              Authorized workflow for a hardware failure or upgrade — deactivates the old device, licenses the new
              one.
            </p>
          </Link>
        </div>
      </div>
    </main>
  );
}
