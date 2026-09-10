"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { chatService } from "@/lib/api/services/chat.service";
import { getApiErrorMessage } from "@/lib/api/errors";

/**
 * "Chat" is a single, always-available line to EduIgnite — not a general
 * contact list (a prior version listed related users, including school
 * colleagues; the product requirement is narrower: this is school <->
 * EduIgnite only, and it must always work). This screen's only job is to
 * establish/reuse that one conversation
 * (POST /chat/contact-eduignite/ — see backend/apps/chat/views.py's
 * ContactEduIgniteView, guaranteed to work regardless of the school's
 * optional 'chat' app entitlement) and hand off straight to the thread view.
 * Both EduIgnite founders are added to that conversation with equal
 * standing on the backend side.
 */
export default function ChatPage() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/login/");
    }
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    setError(null);
    (async () => {
      try {
        const conversation = await chatService.contactEduIgnite();
        if (!cancelled) router.replace(`/chat/${conversation.id}/`);
      } catch (err) {
        if (!cancelled) {
          setError(getApiErrorMessage(err, "Could not reach EduIgnite right now. Please try again."));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, router, retryToken]);

  if (error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <button
          type="button"
          className="text-sm font-bold text-primary underline"
          onClick={() => setRetryToken((n) => n + 1)}
        >
          Try again
        </button>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </main>
  );
}
