"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, LayoutGrid, MessageCircle, User } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/home/", label: "Home", icon: Home },
  { href: "/workspace/", label: "Workspace", icon: LayoutGrid },
  { href: "/chat/", label: "Chat", icon: MessageCircle },
  { href: "/profile/", label: "Profile", icon: User },
] as const;

/**
 * The persistent bottom navigation bar for the app's 4 top-level
 * destinations (spec section 4). Rendered by each of those 4 pages
 * themselves (home/workspace/chat/profile) rather than via a shared layout —
 * every other screen (announcements, chat thread, feedback, testimony,
 * surveys, activate, device-replacement) is a focused sub-screen reached
 * from one of these 4 and uses AppHeader's back button instead.
 *
 * Active-state is derived from the current pathname so it stays correct
 * without each page having to pass its own tab name in.
 */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-100 bg-white/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-sm items-stretch justify-between px-2">
        {TABS.map((tab) => {
          const isActive = pathname === tab.href || pathname?.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-bold"
            >
              <span
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-xl transition",
                  isActive ? "bg-primary text-white" : "text-gray-400"
                )}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className={isActive ? "text-primary" : "text-gray-400"}>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** Spacer so page content never sits under the fixed bottom nav. */
export function BottomNavSpacer() {
  return <div className="h-20" aria-hidden />;
}
