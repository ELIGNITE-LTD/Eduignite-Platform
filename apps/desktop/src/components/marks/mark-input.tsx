"use client";

import { AlertCircle, Check, Loader2 } from "lucide-react";
import type { SaveState } from "@/lib/hooks/useAutoSave";

/** Moves to the same column of the next (or previous) row, like a spreadsheet. */
function focusNeighbour(input: HTMLInputElement, column: string, step: 1 | -1) {
  const all = Array.from(document.querySelectorAll<HTMLInputElement>(`input[data-mark-col="${CSS.escape(column)}"]:not(:disabled)`));
  const next = all[all.indexOf(input) + step];
  if (next) { next.focus(); next.select(); }
}

/**
 * One mark box that saves itself. Enter or the arrow keys move to the next student, so a whole class is typed without
 * touching the mouse; the little icon says Saving, Saved or Not saved (tap it to try again).
 */
export function MarkInput({
  value, onChange, onFlush, state, error, onRetry, column, max, step = 0.25, disabled, label, className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  onFlush: () => void;
  state?: SaveState;
  error?: string;
  onRetry?: () => void;
  /** Inputs sharing a column are walked top to bottom with Enter. */
  column: string;
  max?: number;
  step?: number;
  disabled?: boolean;
  label: string;
  className?: string;
}) {
  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`}>
      <input
        type="number" inputMode="decimal" min={0} max={max} step={step} value={value} disabled={disabled}
        aria-label={label} data-mark-col={column} aria-invalid={state === "error" ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onFlush}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "ArrowDown") { e.preventDefault(); onFlush(); focusNeighbour(e.currentTarget, column, 1); }
          else if (e.key === "ArrowUp") { e.preventDefault(); onFlush(); focusNeighbour(e.currentTarget, column, -1); }
        }}
        className={`h-9 w-20 rounded-lg border bg-background px-2 text-center text-sm font-semibold disabled:opacity-50 ${state === "error" ? "border-red-400" : ""}`}
      />
      <span className="flex h-5 w-5 items-center justify-center" aria-live="polite">
        {state === "saving" ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Saving" /> : null}
        {state === "saved" ? <Check className="h-4 w-4 rounded-full bg-emerald-600 p-0.5 text-white" aria-label="Saved" /> : null}
        {state === "error" ? (
          <button type="button" onClick={onRetry} title={error ? `${error}. Tap to try again.` : "Not saved. Tap to try again."} aria-label="Not saved, try again">
            <AlertCircle className="h-4 w-4 text-red-600" />
          </button>
        ) : null}
      </span>
    </div>
  );
}
