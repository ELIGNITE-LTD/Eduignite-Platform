import React, { useState } from 'react';

/** Step 5: flips `schools.setup_completed`, then hands control back to the normal (now auth-gated) app. */
export default function SetupCompleteStep({ onDone }: { onDone: () => Promise<void> }) {
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function finish() {
    setFinishing(true);
    setError(null);
    try {
      await window.api.setup.completeSetup();
      await onDone();
    } catch (err) {
      setError((err as Error).message || 'Could not finish setup.');
    } finally {
      setFinishing(false);
    }
  }

  return (
    <div className="card space-y-4 text-center">
      <div className="text-lg font-semibold">You're all set!</div>
      <p className="text-sm text-muted-foreground">
        Your school and administrator account are ready. Click below to go to the sign-in screen.
      </p>
      {error && <div className="rounded-md bg-destructive/10 text-destructive text-sm px-3 py-2">{error}</div>}
      <button type="button" className="btn-primary" onClick={finish} disabled={finishing}>
        {finishing ? 'Finishing…' : 'Continue to sign in'}
      </button>
    </div>
  );
}
