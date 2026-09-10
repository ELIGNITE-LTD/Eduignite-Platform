import React, { useState } from 'react';

/** Step 5: flips `schools.setup_completed`, then hands control back to the normal (now auth-gated) app. */
export default function SetupCompleteStep({
  onDone,
  onSuccess,
  onError,
}: {
  onDone: () => Promise<void>;
  /** Fired only right after the real completeSetup call below succeeds, for the wizard's progress log. */
  onSuccess?: () => void;
  /** Fired only on a real completeSetup failure below, for the wizard's progress log. */
  onError?: (message: string) => void;
}) {
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function finish() {
    setFinishing(true);
    setError(null);
    try {
      await window.api.setup.completeSetup();
      onSuccess?.();
      await onDone();
    } catch (err) {
      const message = (err as Error).message || 'Could not finish setup.';
      setError(message);
      onError?.(message);
    } finally {
      setFinishing(false);
    }
  }

  return (
    <div className="card space-y-4 text-center">
      <div className="flex flex-col items-center gap-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
            <path
              d="M5 13l4 4L19 7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="text-lg font-headline font-semibold">School setup complete</div>
      </div>
      <p className="text-sm text-muted-foreground">
        Your EduIgnite Offline environment is ready. Sign in with the administrator account you just created to
        continue to your School Home dashboard.
      </p>
      {error && <div className="rounded-md bg-destructive/10 text-destructive text-sm px-3 py-2">{error}</div>}
      <button type="button" className="btn-primary" onClick={finish} disabled={finishing}>
        {finishing ? 'Finishing…' : 'Continue to EduIgnite'}
      </button>
    </div>
  );
}
