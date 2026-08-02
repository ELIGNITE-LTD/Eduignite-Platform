"use client";

import Link from "next/link";
import { Megaphone, ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { useMyAnnouncementFeed } from "@/lib/hooks/useAnnouncements";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { resolveMediaUrl } from "@/lib/media";

/**
 * Mobile Home tab: gradient identity hero (avatar + welcome + school) above
 * the latest school announcements, each showing the sender's photo and name.
 * Reads the same /announcements/announcements/my_announcements/ feed as the
 * announcements page.
 */
export default function MobileHomePage() {
  const { user } = useAuth();
  const { language } = useI18n();
  const { data: feed, isLoading } = useMyAnnouncementFeed();

  const announcements = ((feed as any)?.results ?? (Array.isArray(feed) ? feed : []) ?? []).slice(0, 20);
  const avatar = resolveMediaUrl(user?.avatar);
  const roleLabel = (user?.role || "").replace(/_/g, " ");
  const schoolName = user?.school?.name;

  return (
    <div className="-mx-3 -mt-4 sm:-mx-4 md:mx-0 md:mt-0">
      {/* Identity hero */}
      <div className="relative overflow-hidden rounded-b-[2rem] bg-gradient-to-br from-primary via-[#2E5A85] to-[#4D96C9] px-5 pb-8 pt-6 text-white shadow-lg">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-14 -left-10 h-44 w-44 rounded-full bg-secondary/20 blur-2xl" />
        <div className="relative flex items-center gap-4">
          <span className="block h-16 w-16 shrink-0 overflow-hidden rounded-full border-[3px] border-white/80 shadow-xl">
            {avatar ? (
              <img src={avatar} alt={user?.name || "Profile"} className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-white/20 text-xl font-black">
                {(user?.name || "?").charAt(0).toUpperCase()}
              </span>
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate text-xl font-black uppercase tracking-tight">
              {user?.name}
            </p>
            <p className="mt-0.5 truncate text-xs font-semibold text-white/85">
              {roleLabel}
            </p>
            {schoolName ? (
              <p className="mt-0.5 truncate text-[11px] font-medium text-white/70">
                {language === "en" ? `Welcome to ${schoolName}!` : `Bienvenue à ${schoolName} !`}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* Announcements */}
      <div className="px-4 pt-6 sm:px-1">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-black tracking-tight text-foreground">
            {language === "en" ? "School Announcements" : "Annonces de l'école"}
          </h2>
          <Link
            href="/dashboard/announcements"
            className="flex items-center gap-0.5 text-xs font-bold text-primary"
          >
            {language === "en" ? "See all" : "Voir tout"}
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="animate-pulse rounded-3xl bg-white p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-muted" />
                  <div className="space-y-2">
                    <div className="h-3 w-28 rounded bg-muted" />
                    <div className="h-2.5 w-16 rounded bg-muted" />
                  </div>
                </div>
                <div className="mt-4 h-3 w-3/4 rounded bg-muted" />
                <div className="mt-2 h-2.5 w-full rounded bg-muted" />
                <div className="mt-1.5 h-2.5 w-5/6 rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : announcements.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-border bg-white/60 px-6 py-14 text-center">
            <Megaphone className="h-9 w-9 text-primary/25" />
            <p className="text-sm font-semibold text-muted-foreground">
              {language === "en"
                ? "No announcements yet. New updates from your school will appear here."
                : "Aucune annonce pour le moment. Les nouveautés de votre école apparaîtront ici."}
            </p>
          </div>
        ) : (
          <div className="space-y-3 pb-4">
            {announcements.map((ann: any) => (
              <article
                key={ann.id}
                className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/[0.03]"
              >
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10 border border-border/60">
                    <AvatarImage src={resolveMediaUrl(ann.sender_avatar) || ""} alt={ann.sender_name || ""} />
                    <AvatarFallback className="bg-primary/10 text-sm font-black text-primary">
                      {(ann.sender_name || "?").charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-foreground">
                      {ann.sender_name || (language === "en" ? "School Office" : "Administration")}
                    </p>
                    <p className="truncate text-[11px] font-medium text-muted-foreground">
                      {(ann.sender_role || "").replace(/_/g, " ") ||
                        (ann.created_at ? new Date(ann.created_at).toLocaleDateString() : "")}
                    </p>
                  </div>
                </div>
                {ann.title ? (
                  <h3 className="mt-3 text-[15px] font-bold leading-snug text-foreground">
                    {ann.title}
                  </h3>
                ) : null}
                {ann.content || ann.message ? (
                  <p className="mt-1.5 line-clamp-4 text-[13px] leading-relaxed text-muted-foreground">
                    {ann.content || ann.message}
                  </p>
                ) : null}
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    {ann.created_at ? new Date(ann.created_at).toLocaleString() : ""}
                  </span>
                  <Link
                    href="/dashboard/announcements"
                    className="text-xs font-bold text-primary active:opacity-70"
                  >
                    {language === "en" ? "Read More" : "Lire plus"}
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
