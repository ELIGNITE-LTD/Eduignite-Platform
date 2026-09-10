import React, { useState } from 'react';
import type { PingResult } from '../../setup/setupClient';

export default function SetupConnectStep({
  onNext,
  onCheckResult,
}: {
  onNext: () => void;
  /** Fired with the real outcome of the connectivity check above, for the wizard's progress log -- never fabricated. */
  onCheckResult?: (outcome: PingResult) => void;
}) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<PingResult | null>(null);

  async function check() {
    setChecking(true);
    try {
      const outcome = await window.api.setup.ping();
      setResult(outcome);
      onCheckResult?.(outcome);
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="card space-y-4">
      <p className="text-sm text-muted-foreground">
        First, let's make sure this computer can reach the EduIgnite server. You'll need an internet
        connection for this step and the next one only -- everything after that works fully offline.
      </p>

      {result && (
        <div
          className={`text-sm px-3 py-2 rounded-md ${
            result.ok ? 'bg-accent text-accent-foreground' : 'bg-destructive/10 text-destructive'
          }`}
        >
          {result.message}
        </div>
      )}

      <div className="flex gap-3">
        <button type="button" className="btn-secondary" onClick={check} disabled={checking}>
          {checking ? 'Checking…' : result ? 'Check again' : 'Check connection'}
        </button>
        <button type="button" className="btn-primary" onClick={onNext} disabled={!result?.ok}>
          Continue
        </button>
      </div>
    </div>
  );
}
