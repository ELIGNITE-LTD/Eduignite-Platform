"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Loader2 } from "lucide-react";
import { apiClient } from "@/lib/api/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * Header notification bell for the desktop app: shows the live unseen count
 * and a quick preview dropdown of the latest notifications.
 */
const normalizeList = (p: any) => (Array.isArray(p) ? p : Array.isArray(p?.results) ? p.results : []);

function timeAgo(iso?: string) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function HeaderNotifications() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  // Opening the bell counts as viewing — mark everything read so the red badge
  // clears immediately, then refresh the count and list.
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      apiClient
        .post("/notifications/notifications/mark_all_read/")
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["header-notifications-unread"] });
          queryClient.invalidateQueries({ queryKey: ["header-notifications"] });
          queryClient.invalidateQueries({ queryKey: ["notifications"] });
        })
        .catch(() => {});
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ["header-notifications"],
    queryFn: async () => normalizeList((await apiClient.get("/notifications/notifications/", { params: { page_size: 8 } })).data),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const { data: unreadData } = useQuery({
    queryKey: ["header-notifications-unread"],
    queryFn: async () => (await apiClient.get("/notifications/notifications/unread_count/")).data,
    refetchInterval: 30_000,
  });

  const items = data || [];
  const unread = Number((unreadData as any)?.unread_count ?? (unreadData as any)?.count ?? 0) || 0;

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Notifications"
          className="relative flex h-10 w-10 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/5"
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black leading-none text-white shadow">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 rounded-2xl p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-black text-primary">Notifications</p>
          {unread > 0 ? (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-black text-red-600">{unread} new</span>
          ) : null}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary/30" /></div>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>
          ) : (
            items.map((n: any) => (
              <div key={n.id} className={cn("border-b px-4 py-3 last:border-b-0", !n.is_read && "bg-primary/[0.03]")}>
                <div className="flex items-start gap-2">
                  {!n.is_read ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" /> : <span className="mt-1.5 h-2 w-2 shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold leading-snug text-foreground">{n.title}</p>
                    {n.message ? <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.message}</p> : null}
                    <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">{timeAgo(n.created_at)}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        <Link
          href="/dashboard/notifications"
          onClick={() => setOpen(false)}
          className="block border-t px-4 py-3 text-center text-[12px] font-black uppercase tracking-widest text-primary hover:bg-accent/40"
        >
          View all
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
