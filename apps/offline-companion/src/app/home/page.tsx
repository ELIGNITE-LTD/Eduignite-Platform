"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Loader2, Megaphone, Pin } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { UpdateBanner } from "@/components/update-banner";
import { BottomNav, BottomNavSpacer } from "@/components/bottom-nav";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { announcementsService } from "@/lib/api/services/announcements.service";
import type { Announcement } from "@/lib/api/types";

const RECENT_ANNOUNCEMENTS_LIMIT = 2;

/**
 * Spec section 3 — Home: school identity (logo/name/motto), a personalized
 * welcome line, and a "Latest Announcements" preview (1-2 items) linking
 * into the full list. The old flat feature-tile grid moved to
 * workspace/page.tsx (spec section 5); Home now only carries identity +
 * the update banner + a taste of what's new.
 */
export default function HomePage() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isLoadingFeed, setIsLoadingFeed] = useState(true);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login/");
    }
  }, [isLoading, isAuthenticated, router]);

  const loadAnnouncements = useCallback(async () => {
    setIsLoadingFeed(true);
    try {
      const { results } = await announcementsService.getMyFeed();
      setAnnouncements(results.slice(0, RECENT_ANNOUNCEMENTS_LIMIT));
    } catch {
      // Non-critical on Home — the full Announcements screen has its own
      // error state; here we just show nothing rather than an error banner.
      setAnnouncements([]);
    } finally {
      setIsLoadingFeed(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) loadAnnouncements();
  }, [isAuthenticated, loadAnnouncements]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const school = user?.school;
  const firstName = (user?.name || "").split(" ")[0] || user?.name;

  return (
    <main className="min-h-screen bg-background px-6 pt-10">
      <div className="mx-auto max-w-sm space-y-6">
        {/* School identity header */}
        <header className="flex items-center gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-primary shadow-md">
            {school?.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={school.logo} alt={`${school.name} logo`} className="h-full w-full object-cover" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/icon.png" alt="EduIgnite" className="h-9 w-9 object-contain" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-black text-primary-dark">{school?.name || "EduIgnite Companion"}</p>
            {school?.motto ? <p className="truncate text-xs italic text-gray-500">&ldquo;{school.motto}&rdquo;</p> : null}
          </div>
        </header>

        {/* Personalized welcome */}
        <div>
          <h1 className="text-xl font-black text-primary-dark">Welcome, {firstName}</h1>
          <p className="mt-1 text-sm text-gray-500">
            Here&rsquo;s what&rsquo;s new from EduIgnite and your school&rsquo;s Offline license today.
          </p>
        </div>

        <UpdateBanner />

        {/* Latest announcements */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-black uppercase tracking-wide text-gray-400">Latest Announcements</p>
            <Link href="/announcements/" className="inline-flex items-center gap-0.5 text-xs font-bold text-primary">
              See all
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {isLoadingFeed ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : announcements.length === 0 ? (
            <EmptyState
              icon={Megaphone}
              title="No announcements yet"
              description="Updates from the EduIgnite Board will show up here."
            />
          ) : (
            <div className="space-y-3">
              {announcements.map((item) => (
                <Link key={item.id} href="/announcements/" className="block">
                  <Card interactive className="border-l-4 border-l-accent p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-black text-primary-dark">{item.title}</p>
                      {item.is_pinned ? <Pin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" /> : null}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-gray-500">{item.content}</p>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-gray-400">
                      <span>{item.sender_name || "EduIgnite Board"}</span>
                      {!item.is_read ? <span className="font-bold text-primary">New</span> : null}
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>

        <BottomNavSpacer />
      </div>
      <BottomNav />
    </main>
  );
}
