
"use client";

import { useAuth, type UserRole } from "@/lib/auth-context";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { MobileTopBar } from "@/components/mobile/mobile-top-bar";
import { MobileBottomNav } from "@/components/mobile/mobile-bottom-nav";
import { Loader2, Info, Lock, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import Link from "next/link";
import { getLicenseAccessState } from "@/lib/license";
import { ErrorBoundary } from "@/components/error-boundary";
import { NotificationWatcher } from "@/components/notification-watcher";
import { NativeDownloadBridge } from "@/components/native-download-bridge";

const EXECUTIVE_ROLES: UserRole[] = ["SUPER_ADMIN", "CEO", "CTO", "COO", "INV", "DESIGNER"];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user, isLoading, platformSettings } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-4">
        <Loader2 className="w-12 h-12 animate-spin text-primary opacity-20" />
        <p className="text-primary/40 font-black uppercase text-[10px] tracking-[0.3em] animate-pulse">Syncing Prototype Session</p>
      </div>
    );
  }

  if (!user) return null;

  const isPlatformExecutive = EXECUTIVE_ROLES.includes(user.role as UserRole);
  const licenseState = getLicenseAccessState(user, platformSettings as any);
  const isSubscriptionPage = pathname === "/dashboard/subscription";

  if (licenseState.restrictionApplies && !isPlatformExecutive && !isSubscriptionPage) {
    return (
      <div className="flex min-h-dvh flex-col bg-background">
        <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 bg-accent/10">
          <Card className="max-w-md w-full border-none shadow-2xl rounded-[2rem] overflow-hidden">
            <CardHeader className="bg-primary p-6 sm:p-8 text-white text-center">
              <div className="flex justify-center mb-4">
                <div className="p-4 bg-white/10 rounded-full">
                  <Lock className="w-12 h-12 text-secondary" />
                </div>
              </div>
              <CardTitle className="text-2xl font-black uppercase">Dashboard Locked</CardTitle>
              <CardDescription className="text-white/60">Annual Institutional License Required</CardDescription>
            </CardHeader>
            <CardContent className="p-6 sm:p-8 text-center space-y-6">
              <p className="text-sm text-muted-foreground leading-relaxed">
                Your account dashboard is locked because the founder-configured annual license fee for your role is still unpaid and the payment deadline has passed.
              </p>
              <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 flex gap-3 text-left">
                <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-800 font-medium">
                  Amount due: {licenseState.feeAmount.toLocaleString()} XAF.
                  {licenseState.deadline ? ` Deadline: ${licenseState.deadline.toLocaleDateString()}.` : ""}
                </p>
              </div>
              <Button asChild className="w-full h-14 rounded-2xl shadow-lg font-black uppercase tracking-widest text-xs gap-2">
                <Link href="/dashboard/subscription">
                  <Wallet className="w-5 h-5" /> Activate License Now
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <NotificationWatcher />
      <NativeDownloadBridge />
      <MobileTopBar />

      <div className="flex-1 flex min-h-0 flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto pb-24">
          <div className="px-3 py-4 sm:px-4 min-h-full flex flex-col">
            <div className="max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-2 duration-500 w-full flex-1">
              <ErrorBoundary fallbackTitle="Something went wrong on our end.">
                {children}
              </ErrorBoundary>
            </div>
          </div>
        </main>
      </div>

      <MobileBottomNav />
    </div>
  );
}
