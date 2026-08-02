"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Bell, Loader2, LogOut } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { resolveMediaUrl } from "@/lib/media";
import { notificationsService } from "@/lib/api/services/notifications.service";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * App-wide mobile header: back button (on any page deeper than the four
 * bottom tabs), profile picture (opens Profile), translate button, a
 * notification bell with the unseen count, and a logout button.
 */

// The four bottom-tab roots — every other dashboard page shows a back button.
const TAB_ROOTS = new Set([
  "/dashboard/home",
  "/dashboard/workspace",
  "/dashboard/chat",
  "/dashboard/community-hub",
  "/dashboard",
]);

export function MobileTopBar() {
  const { user, isAuthenticated, logout } = useAuth();
  const { language } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const avatar = resolveMediaUrl(user?.avatar);
  const firstName = (user?.name || "").trim().split(/\s+/)[0] || "";

  const [logoutOpen, setLogoutOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const normalizedPath = pathname.replace(/\/+$/, "") || "/dashboard";
  const showBack = !TAB_ROOTS.has(normalizedPath);

  const { data: unreadData } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => notificationsService.unreadCount(),
    enabled: Boolean(isAuthenticated),
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  });
  const rawCount = Number(
    (unreadData as any)?.unread_count ?? (unreadData as any)?.count ?? 0
  );
  const unread = Number.isFinite(rawCount) ? rawCount : 0;

  const handleBack = () => {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push("/dashboard/home");
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
    } catch {
      /* best effort — tokens are cleared regardless */
    } finally {
      setIsLoggingOut(false);
      setLogoutOpen(false);
      router.push("/login");
    }
  };

  return (
    <header
      className="sticky top-0 z-30 flex shrink-0 items-center justify-between gap-2 border-b border-border/50 bg-background/95 px-3 backdrop-blur-xl"
      style={{
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)",
        paddingBottom: "10px",
      }}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        {showBack && (
          <button
            onClick={handleBack}
            aria-label={language === "en" ? "Go back" : "Retour"}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-primary/5 active:scale-95"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <Link href="/dashboard/profile" className="flex min-w-0 items-center gap-2.5">
          <span className="relative block h-10 w-10 shrink-0 overflow-hidden rounded-full ring-2 ring-primary/15">
            {avatar ? (
              <img src={avatar} alt={user?.name || "Profile"} className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-primary/10 text-sm font-black text-primary">
                {(user?.name || "?").charAt(0).toUpperCase()}
              </span>
            )}
          </span>
          {!showBack && (
            <span className="min-w-0">
              <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                {language === "en" ? "Signed in" : "Connecté"}
              </span>
              <span className="block max-w-[120px] truncate text-sm font-black tracking-tight text-primary">
                {firstName || user?.name}
              </span>
            </span>
          )}
        </Link>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <LanguageSwitcher />
        <Link
          href="/dashboard/notifications"
          aria-label="Notifications"
          className="relative flex h-10 w-10 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/5 active:scale-95"
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black leading-none text-white shadow">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Link>
        <button
          onClick={() => setLogoutOpen(true)}
          aria-label={language === "en" ? "Log out" : "Se déconnecter"}
          className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-500 active:scale-95"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </div>

      <Dialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <DialogContent className="max-w-xs rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black">
              {language === "en" ? "Log out?" : "Se déconnecter ?"}
            </DialogTitle>
            <DialogDescription className="text-[13px]">
              {language === "en"
                ? "You will need your matricule and password to sign back in."
                : "Vous aurez besoin de votre matricule et de votre mot de passe pour vous reconnecter."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1 rounded-xl"
              onClick={() => setLogoutOpen(false)}
              disabled={isLoggingOut}
            >
              {language === "en" ? "Cancel" : "Annuler"}
            </Button>
            <Button
              className="flex-1 gap-2 rounded-xl bg-red-500 text-white hover:bg-red-600"
              onClick={handleLogout}
              disabled={isLoggingOut}
            >
              {isLoggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
              {language === "en" ? "Log out" : "Déconnexion"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
