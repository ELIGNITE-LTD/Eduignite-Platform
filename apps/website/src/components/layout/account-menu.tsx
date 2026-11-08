"use client";

/**
 * Profile avatar for the dashboard header: name and current school, a link to
 * the profile, a quick switch between linked schools (school admins only), and
 * logout. Small and responsive; the avatar alone shows on narrow screens.
 */

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Building2, ChevronDown, Loader2, LogOut, Repeat, User as UserIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api/errors";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import {
  LINKED_SCHOOLS_QUERY_KEY,
  UnsyncedWorkError,
  getLinkedSchools,
  switchToSchool,
} from "@/lib/linked-schools";
import { resolveMediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";

interface AccountMenuProps {
  className?: string;
  /** Light text for use on the dark (primary) mobile header. */
  tone?: "light" | "dark";
  /** Render only for school admins (used where another avatar already exists). */
  schoolAdminOnly?: boolean;
}

export function AccountMenu({ className, tone = "light", schoolAdminOnly = false }: AccountMenuProps) {
  const { user, isAuthenticated, logout } = useAuth();
  const { language } = useI18n();
  const { toast } = useToast();
  const tr = (en: string, fr: string) => (language === "fr" ? fr : en);
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  const role = (user as any)?.role as string | undefined;
  const isSchoolAdmin = role === "SCHOOL_ADMIN" && !(user as any)?.is_teacher_twin;

  const { data } = useQuery({
    queryKey: LINKED_SCHOOLS_QUERY_KEY,
    queryFn: getLinkedSchools,
    enabled: Boolean(isAuthenticated && isSchoolAdmin),
    staleTime: 60_000,
    retry: 0,
  });

  if (!isAuthenticated || !user) return null;
  if (schoolAdminOnly && !isSchoolAdmin) return null;

  const avatar = resolveMediaUrl((user as any).avatar);
  const schoolName = (user as any).school?.shortName || (user as any).school?.name || "";
  const others = (data?.accounts || []).filter((account) => !account.is_current);

  const handleSwitch = async (accountId: string) => {
    setSwitchingId(accountId);
    try {
      await switchToSchool(accountId);
    } catch (error) {
      setSwitchingId(null);
      toast({
        variant: "destructive",
        title: tr("Could not switch", "Impossible de basculer"),
        description:
          error instanceof UnsyncedWorkError
            ? tr("Some changes are still waiting to sync. Try again once they finish.", "Des modifications attendent d'être synchronisées. Réessayez ensuite.")
            : getApiErrorMessage(error),
      });
    }
  };

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
          {schoolName ? <p className="truncate text-xs font-medium text-muted-foreground">{schoolName}</p> : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="cursor-pointer py-2.5">
          <Link href="/dashboard/profile">
            <UserIcon className="mr-2 h-4 w-4" /> {tr("My profile", "Mon profil")}
          </Link>
        </DropdownMenuItem>
        {isSchoolAdmin ? (
          <>
            <DropdownMenuItem asChild className="cursor-pointer py-2.5">
              <Link href="/dashboard/profile">
                <Building2 className="mr-2 h-4 w-4" /> {tr("My schools", "Mes écoles")}
              </Link>
            </DropdownMenuItem>
            {others.length > 0 ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  {tr("Switch school", "Changer d'école")}
                </DropdownMenuLabel>
                {others.map((account) => (
                  <DropdownMenuItem
                    key={account.account_id}
                    disabled={!account.can_switch || switchingId !== null}
                    onSelect={(event) => {
                      event.preventDefault();
                      handleSwitch(account.account_id);
                    }}
                    className="cursor-pointer py-2.5"
                  >
                    {switchingId === account.account_id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Repeat className="mr-2 h-4 w-4" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{account.school_name}</span>
                    {account.status === "pending_activation" ? (
                      <span className="ml-2 shrink-0 text-[10px] text-muted-foreground">{tr("Pending", "En attente")}</span>
                    ) : null}
                  </DropdownMenuItem>
                ))}
              </>
            ) : null}
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void logout()} className="cursor-pointer py-2.5 text-destructive focus:text-destructive">
          <LogOut className="mr-2 h-4 w-4" /> {tr("Log out", "Se déconnecter")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
