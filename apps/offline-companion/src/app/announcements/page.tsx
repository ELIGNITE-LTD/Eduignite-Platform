"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Megaphone, Pin, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { announcementsService } from "@/lib/api/services/announcements.service";
import { getApiErrorMessage } from "@/lib/api/errors";
import type { Announcement } from "@/lib/api/types";
import { AppHeader } from "@/components/app-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export default function AnnouncementsPage() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const router = useRouter();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/login/");
    }
  }, [authLoading, isAuthenticated, router]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { results } = await announcementsService.getMyFeed();
      setAnnouncements(results);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not load announcements."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) load();
  }, [isAuthenticated, load]);

  const handleOpen = async (item: Announcement) => {
    if (!item.is_read) {
      try {
        await announcementsService.markRead(item.id);
        setAnnouncements((prev) => prev.map((a) => (a.id === item.id ? { ...a, is_read: true } : a)));
      } catch {
        // Non-critical — the announcement still shows, just stays "unread".
      }
    }
  };

  if (authLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-sm space-y-6">
        <AppHeader
          title="Announcements"
          subtitle="Updates and notices sent from EduIgnite's office to your school."
          backHref="/workspace/"
          action={
            <Button variant="outline" size="icon" onClick={() => load()} aria-label="Refresh">
              <RefreshCw className="h-4 w-4" />
            </Button>
          }
        />

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>
        ) : announcements.length === 0 ? (
          <EmptyState icon={Megaphone} title="No announcements yet" description="Check back later for updates." />
        ) : (
          <div className="space-y-3">
            {announcements.map((item) => (
              <button key={item.id} type="button" onClick={() => handleOpen(item)} className="block w-full text-left">
                <Card interactive className={"p-5" + (item.is_pinned ? " border-l-4 border-l-accent" : "")}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-base font-black text-primary-dark">{item.title}</p>
                    {item.is_pinned ? <Pin className="mt-0.5 h-4 w-4 shrink-0 text-accent" /> : null}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">{item.content}</p>
                  <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
                    <span>{item.sender_name || "EduIgnite Board"}</span>
                    {!item.is_read ? (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 font-bold text-primary">New</span>
                    ) : null}
                  </div>
                </Card>
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
