"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Megaphone, Pin, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { announcementsService } from "@/lib/api/services/announcements.service";
import { getApiErrorMessage } from "@/lib/api/errors";
import type { Announcement } from "@/lib/api/types";

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
        <div>
          <Link href="/home/" className="inline-flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-primary">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Companion
          </Link>
          <div className="mt-2 flex items-center justify-between">
            <h1 className="text-2xl font-black text-primary">Announcements</h1>
            <button
              type="button"
              onClick={() => load()}
              aria-label="Refresh"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition hover:bg-gray-50"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-2 text-sm text-gray-500">Updates and notices sent from EduIgnite's office to your school.</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>
        ) : announcements.length === 0 ? (
          <div className="rounded-2xl border bg-white p-6 text-center shadow-sm">
            <Megaphone className="mx-auto h-8 w-8 text-gray-300" />
            <p className="mt-3 text-sm text-gray-500">No announcements yet. Check back later.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {announcements.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleOpen(item)}
                className="block w-full rounded-2xl bg-white p-5 text-left shadow-xl transition hover:-translate-y-0.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-base font-black text-primary">{item.title}</p>
                  {item.is_pinned ? <Pin className="mt-0.5 h-4 w-4 shrink-0 text-accent" /> : null}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">{item.content}</p>
                <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
                  <span>{item.sender_name || "EduIgnite"}</span>
                  {!item.is_read ? (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 font-bold text-primary">New</span>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
