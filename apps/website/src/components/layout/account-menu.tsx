"use client";

/**
 * Profile avatar for the dashboard header: name and current school, a link to
 * the profile, and logout. Small and responsive; the avatar alone shows on narrow screens.
 */

import { useRoleLabel } from "@/lib/role-labels";
import Link from "next/link";
import { ChevronDown, LogOut, User as UserIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { resolveMediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";

interface AccountMenuProps {
  className?: string;
  /** Light text for use on the dark (primary) mobile header. */
  tone?: "light" | "dark";
}

export function AccountMenu({ className, tone = "light" }: AccountMenuProps) {
  const { user, isAuthenticated, logout } = useAuth();
  const { language } = useI18n();
  const { label: roleName } = useRoleLabel();
  const tr = (en: string, fr: string) => (language === "fr" ? fr : en);

  if (!isAuthenticated || !user) return null;

  const avatar = resolveMediaUrl((user as any).avatar);
  const schoolName = (user as any).school?.shortName || (user as any).school?.name || "";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={tr("Account menu", "Menu du compte")}
          className={cn(
            "flex h-10 items-center gap-2 rounded-full px-1 pr-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary",
            tone === "dark" ? "text-white hover:bg-white/10" : "text-primary hover:bg-primary/5",
            className,
          )}
        >
          <span className="relative block h-8 w-8 shrink-0 overflow-hidden rounded-full ring-2 ring-primary/15">
            {avatar ? (
              <img src={avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-primary/10 text-sm font-black text-primary">
                {((user as any).name || "?").charAt(0).toUpperCase()}
              </span>
            )}
          </span>
          <span className="hidden max-w-[140px] text-left leading-tight lg:block">
            <span className="block truncate text-xs font-black">{(user as any).name}</span>
            {schoolName ? <span className="block truncate text-[10px] opacity-70">{schoolName}</span> : null}
          </span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 max-w-[calc(100vw-1.5rem)]">
        <DropdownMenuLabel className="space-y-0.5">
          <p className="truncate text-sm font-black">{(user as any).name}</p>
          <p className="truncate text-xs font-bold text-primary">{roleName((user as any).role, user)}</p>
          {schoolName ? <p className="truncate text-xs font-medium text-muted-foreground">{schoolName}</p> : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="cursor-pointer py-2.5">
          <Link href="/dashboard/profile">
            <UserIcon className="mr-2 h-4 w-4" /> {tr("My profile", "Mon profil")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void logout()} className="cursor-pointer py-2.5 text-destructive focus:text-destructive">
          <LogOut className="mr-2 h-4 w-4" /> {tr("Log out", "Se déconnecter")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
