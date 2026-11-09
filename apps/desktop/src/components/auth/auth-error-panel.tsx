"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { checkServerReachable, type ConnectivityKind, type UiLanguage } from "@/lib/connectivity";

export interface AuthErrorState {
  message: string;
  kind: ConnectivityKind;
  /** HTTP status / error code, shown small. */
  detail?: string;
}

const POLL_EVERY_MS = 5000;
const MAX_CHECKS = 12; // 12 x 5s = 60s

const TEXT: Record<UiLanguage, Record<string, string>> = {
  en: {
    title: "Login problem",
    retry: "Try again",
    checking: "Checking connection...",
    back: "Connected again, you can sign in now",
    gaveUp: "Still not reachable. Please try again in a few minutes.",
    code: "Technical detail",
  },
  fr: {
    title: "Problème de connexion",
    retry: "Réessayer",
    checking: "Vérification de la connexion...",
    back: "Connexion rétablie, vous pouvez vous connecter",
    gaveUp: "Toujours injoignable. Veuillez réessayer dans quelques minutes.",
    code: "Détail technique",
  },
};

type Reachability = "checking" | "reachable" | "gave-up";

/**
 * The sign-in error box.
 *
 * Shows the accurate message, a "Try again" button (which only clears the
 * message: credentials are never re-sent automatically) and, when the server
 * could not be reached, a small live reachability check: GET /api/v1/health/
 * every 5 seconds for up to a minute, paused while the tab is hidden.
 */
export function AuthErrorPanel({
  error,
  language,
  onRetry,
  className = "",
}: {
  error: AuthErrorState;
  language: UiLanguage;
  onRetry: () => void;
  className?: string;
}) {
  const text = TEXT[language] ?? TEXT.en;
  const watch = error.kind === "server-unreachable";
  const [status, setStatus] = useState<Reachability>("checking");
  const checks = useRef(0);

  useEffect(() => {
    if (!watch) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    checks.current = 0;
    setStatus("checking");

    const finish = (next: Reachability) => {
      if (!cancelled) setStatus(next);
    };

    const tick = async () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.hidden) {
        // Paused while the tab is in the background; looks again when shown.
        timer = setTimeout(tick, POLL_EVERY_MS);
        return;
      }
      checks.current += 1;
      const ok = await checkServerReachable();
      if (cancelled) return;
      if (ok) return finish("reachable");
      if (checks.current >= MAX_CHECKS) return finish("gave-up");
      timer = setTimeout(tick, POLL_EVERY_MS);
    };

    const onOnline = () => {
      if (timer) clearTimeout(timer);
      void tick();
    };
    window.addEventListener("online", onOnline);
    void tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("online", onOnline);
    };
  }, [watch, error]);

  return (
    <div
      role="alert"
      className={`rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-left shadow-sm ${className}`}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-700">{text.title}</p>
          <p className="mt-1 text-sm font-bold leading-relaxed text-red-900">{error.message}</p>
          {error.detail && error.kind !== "other" && (
            <p className="mt-1 text-[10px] font-medium text-red-700/70">
              {text.code}: {error.detail}
            </p>
          )}

          {watch && (
            <p
              aria-live="polite"
              className={`mt-3 flex items-center gap-2 text-xs font-bold ${
                status === "reachable" ? "text-green-700" : "text-red-800"
              }`}
            >
              {status === "checking" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {status === "reachable" && <CheckCircle2 className="h-3.5 w-3.5" />}
              {status === "checking" ? text.checking : status === "reachable" ? text.back : text.gaveUp}
            </p>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRetry}
            className={`mt-3 h-9 gap-2 rounded-xl text-xs font-bold ${
              status === "reachable" && watch ? "border-green-600 text-green-700" : ""
            }`}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {text.retry}
          </Button>
        </div>
      </div>
    </div>
  );
}
