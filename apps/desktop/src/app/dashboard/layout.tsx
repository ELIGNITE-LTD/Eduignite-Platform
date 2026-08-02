
"use client";

import { useAuth, type UserRole } from "@/lib/auth-context";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardSidebar } from "@/components/layout/dashboard-sidebar";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { Menu, Loader2, Info, Lock, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import Link from "next/link";
import { resolveMediaUrl } from "@/lib/media";
import { resolvePlatformLogoUrl } from "@/lib/platform-brand";
import { getLicenseAccessState } from "@/lib/license";
import { useI18n } from "@/lib/i18n-context";
import { ErrorBoundary } from "@/components/error-boundary";
import { NotificationWatcher } from "@/components/notification-watcher";
import { HeaderNotifications } from "@/components/header-notifications";

const EXECUTIVE_ROLES: UserRole[] = ["SUPER_ADMIN", "CEO", "CTO", "COO", "INV", "DESIGNER"];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user, isLoading, platformSettings } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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
  const schoolLogo = resolveMediaUrl(user?.school?.logo);
  const platformLogo = resolvePlatformLogoUrl(platformSettings.logo);

  if (licenseState.restrictionApplies && !isPlatformExecutive && !isSubscriptionPage) {
    return (
      <div className="flex min-h-dvh flex-col md:flex-row bg-background">
        <aside className="hidden md:flex w-64 shrink-0 h-full">
          <DashboardSidebar />
        </aside>
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

  const dashboardTitle = isPlatformExecutive
    ? platformSettings.name || "Platform Board"
    : user?.school?.shortName || user?.school?.name || "Institution";

  return (
    <div className="flex min-h-dvh flex-col md:flex-row bg-background">
      <NotificationWatcher />
      <aside className="hidden md:flex w-64 shrink-0 h-full">
        <DashboardSidebar />
      </aside>

      <div className="flex-1 flex min-h-dvh flex-col overflow-hidden">
        <header className="md:hidden sticky top-0 z-20 flex items-center justify-between gap-3 px-3 py-3 bg-primary/95 backdrop-blur text-white shrink-0">
          <div className="flex items-center gap-2 overflow-hidden">
            {!isPlatformExecutive && schoolLogo ? (
              <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shrink-0 overflow-hidden">
                <img src={schoolLogo} alt="Logo" className="w-full h-full object-contain" />
              </div>
            ) : isPlatformExecutive ? (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-1">
                <img
                  src={platformLogo}
                  alt={`${platformSettings.name} logo`}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            ) : null}
            <span className="font-bold tracking-tight text-white truncate uppercase">
              {dashboardTitle}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <LanguageSwitcher tone="dark" />
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="text-white">
                  <Menu className="w-6 h-6" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 border-none w-[88vw] max-w-80">
                <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
                <DashboardSidebar onClose={() => setIsMobileMenuOpen(false)} />
              </SheetContent>
            </Sheet>
          </div>
        </header>

        <header className="hidden md:flex sticky top-0 z-20 items-center justify-between gap-4 border-b border-border/60 bg-background/80 px-8 py-3 backdrop-blur-xl shrink-0">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground">
              {t("workspaceLanguage")}
            </p>
            <p className="truncate text-sm font-black text-primary uppercase tracking-tight">
              {dashboardTitle}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <HeaderNotifications />
            <LanguageSwitcher />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="px-3 py-4 sm:px-4 md:p-8 min-h-full flex flex-col">
            <div className="max-w-7xl mx-auto space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500 w-full flex-1">
              <ErrorBoundary fallbackTitle="Something went wrong on our end.">
                {children}
              </ErrorBoundary>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
