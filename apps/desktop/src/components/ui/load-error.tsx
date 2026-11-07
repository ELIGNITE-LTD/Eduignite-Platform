"use client";

import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Inline error state for a list that failed to load, with a retry button.
 * Use it instead of rendering an empty list: an unfinished or failed request
 * must never look like "there is nothing here".
 */
export function LoadError({
  message = "Could not load this list.",
  onRetry,
  retrying = false,
  className,
}: {
  message?: string;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive",
        className,
      )}
    >
      <span className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {message}
      </span>
      {onRetry && (
        <Button type="button" size="sm" variant="outline" className="h-7 gap-1 px-2 text-[11px]" onClick={onRetry} disabled={retrying}>
          {retrying ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Retry
        </Button>
      )}
    </div>
  );
}

/** Small inline "loading options" hint for selectors still fetching. */
export function LoadingHint({ label = "Loading..." }: { label?: string }) {
  return (
    <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <Loader2 className="h-3 w-3 animate-spin" /> {label}
    </p>
  );
}
