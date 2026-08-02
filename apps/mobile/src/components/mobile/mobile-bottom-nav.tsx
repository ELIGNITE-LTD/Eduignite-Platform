"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, LayoutGrid, MessageCircle, Users } from "lucide-react";
import { useI18n } from "@/lib/i18n-context";
import { cn } from "@/lib/utils";

/**
 * The four-tab bottom navigation that replaces the hamburger menu:
 * Home · Workspace · Messages · Community. (Profile stays one tap away via
 * the avatar in the top bar.)
 */
export function MobileBottomNav() {
  const pathname = usePathname();
  const { language } = useI18n();

  const tabs = [
    {
      href: "/dashboard/home",
      label: language === "en" ? "Home" : "Accueil",
      icon: Home,
      isActive: pathname === "/dashboard/home" || pathname === "/dashboard/home/",
    },
    {
      href: "/dashboard/workspace",
      label: language === "en" ? "Workspace" : "Espace",
      icon: LayoutGrid,
      isActive: pathname.startsWith("/dashboard/workspace"),
    },
    {
      href: "/dashboard/chat",
      label: language === "en" ? "Messages" : "Messages",
      icon: MessageCircle,
      isActive: pathname.startsWith("/dashboard/chat"),
    },
    {
      href: "/dashboard/community-hub",
      label: language === "en" ? "Community" : "Communauté",
      icon: Users,
      isActive: pathname.startsWith("/dashboard/community-hub"),
    },
  ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="mx-auto grid h-16 max-w-lg grid-cols-4">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-label={tab.label}
            className="group flex flex-col items-center justify-center gap-0.5 active:scale-95"
          >
            <span
              className={cn(
                "flex h-8 items-center justify-center rounded-2xl px-4 transition-all duration-200",
                tab.isActive ? "bg-primary/10" : "bg-transparent"
              )}
            >
              <tab.icon
                className={cn(
                  "h-[22px] w-[22px] transition-colors",
                  tab.isActive ? "text-primary" : "text-muted-foreground"
                )}
                strokeWidth={tab.isActive ? 2.4 : 2}
              />
            </span>
            <span
              className={cn(
                "text-[10px] font-bold tracking-wide transition-colors",
                tab.isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              {tab.label}
            </span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
