"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageCircle, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { chatService } from "@/lib/api/services/chat.service";
import { getApiErrorMessage } from "@/lib/api/errors";
import type { RelatedChatUser } from "@/lib/api/types";
import { BottomNav, BottomNavSpacer } from "@/components/bottom-nav";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";

const FOUNDER_ROLES = ["CEO", "CTO"];

/**
 * Spec section 6 — Chat entry point: "Chat with EduIgnite" contacts. A
 * normal direct conversation with whichever EduIgnite founder(s) the
 * backend's related-users list surfaces for this account (see
 * chat.service.ts). Both founders are shown with equal standing when
 * present — neither is preferred over the other (hard project rule).
 */
export default function ChatPage() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const router = useRouter();
  const [contacts, setContacts] = useState<RelatedChatUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/login/");
    }
  }, [authLoading, isAuthenticated, router]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const users = await chatService.getRelatedUsers();
      setContacts(users);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not load your EduIgnite contacts."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) load();
  }, [isAuthenticated, load]);

  const startConversation = async (user: RelatedChatUser) => {
    setStartingId(user.id);
    setError(null);
    try {
      const conversation = await chatService.getOrCreateDirectConversation(user.id);
      router.push(`/chat/${conversation.id}/`);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not start this conversation."));
      setStartingId(null);
    }
  };

  if (authLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const founders = contacts.filter((c) => FOUNDER_ROLES.includes(c.role));
  const others = contacts.filter((c) => !FOUNDER_ROLES.includes(c.role));

  return (
    <main className="min-h-screen bg-background px-6 pt-10">
      <div className="mx-auto max-w-sm space-y-6">
        <div>
          <h1 className="text-2xl font-black text-primary-dark">Chat</h1>
          <p className="mt-1 text-sm text-gray-500">Message EduIgnite&rsquo;s customer care team directly if you need help.</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>
        ) : contacts.length === 0 ? (
          <EmptyState
            icon={MessageCircle}
            title="No contact available yet"
            description="Ask your school administrator to reach out to EduIgnite to get connected."
          />
        ) : (
          <div className="space-y-4">
            {founders.length > 0 ? (
              <div className="space-y-3">
                <p className="text-xs font-black uppercase tracking-wide text-gray-400">EduIgnite Team</p>
                {founders.map((founder) => (
                  <button
                    key={founder.id}
                    type="button"
                    disabled={startingId === founder.id}
                    onClick={() => startConversation(founder)}
                    className="block w-full text-left"
                  >
                    <Card interactive className="flex items-center gap-3 p-4 disabled:opacity-60">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                        <ShieldCheck className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="font-black text-primary-dark">{founder.name}</p>
                        <p className="text-xs text-gray-500">{founder.role} &middot; EduIgnite Customer Care</p>
                      </div>
                      {startingId === founder.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      ) : founder.is_online ? (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                      ) : null}
                    </Card>
                  </button>
                ))}
              </div>
            ) : null}

            {others.length > 0 ? (
              <div className="space-y-3">
                <p className="text-xs font-black uppercase tracking-wide text-gray-400">Your School</p>
                {others.map((person) => (
                  <button
                    key={person.id}
                    type="button"
                    disabled={startingId === person.id}
                    onClick={() => startConversation(person)}
                    className="block w-full text-left"
                  >
                    <Card interactive className="flex items-center gap-3 p-4 disabled:opacity-60">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                        <MessageCircle className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="font-black text-primary-dark">{person.name}</p>
                        <p className="text-xs text-gray-500">{person.role}</p>
                      </div>
                      {startingId === person.id ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : null}
                    </Card>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        )}

        <BottomNavSpacer />
      </div>
      <BottomNav />
    </main>
  );
}
