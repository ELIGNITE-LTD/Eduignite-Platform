import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { LicenseGateResult } from '../licensing/gate';

// Spec section 10: warning popups/banners at 90, 30, and 7 days before
// expiry, plus a distinct grace-period and read-only banner once expired.
// Polls window.api.licensing.getStatus() periodically so this reflects a
// license installed/renewed from the Licensing page without a full reload,
// and satisfies the "periodically while running" half of the clock-tamper
// / expiry checks (checkLicenseGate is re-evaluated, and its max-seen-
// timestamp watermark advanced, on every poll — see src/licensing/gate.ts).

const POLL_INTERVAL_MS = 60_000;
const WARNING_THRESHOLDS_DAYS = [90, 30, 7];

function toneFor(status: LicenseGateResult['status'], daysRemaining: number | null): 'info' | 'warning' | 'danger' {
  if (status === 'expired') return 'danger';
  if (status === 'grace') return 'warning';
  if (status === 'active' && daysRemaining !== null && WARNING_THRESHOLDS_DAYS.some((t) => daysRemaining <= t)) {
    return daysRemaining <= 7 ? 'danger' : 'warning';
  }
  return 'info';
}

const TONE_CLASSES: Record<'info' | 'warning' | 'danger', string> = {
  info: 'bg-blue-50 text-blue-900 border-blue-200',
  warning: 'bg-amber-50 text-amber-900 border-amber-200',
  danger: 'bg-red-50 text-red-900 border-red-200',
};

export default function LicenseStatusBanner() {
  const [gate, setGate] = useState<LicenseGateResult | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const result = await window.api.licensing.getStatus();
        if (!cancelled) setGate(result);
      } catch {
        // Licensing IPC not reachable (shouldn't happen outside tests/dev
        // hiccups) — fail silent rather than blocking the whole shell.
      }
    }

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (!gate) return null;

  // Fully active with no upcoming warning threshold reached — nothing to show.
  if (
    gate.status === 'active' &&
    (gate.daysRemaining === null || !WARNING_THRESHOLDS_DAYS.some((t) => gate.daysRemaining! <= t))
  ) {
    return null;
  }

  const tone = toneFor(gate.status, gate.daysRemaining);

  return (
    <div className={`px-4 py-2 text-sm border-b flex items-center justify-between gap-4 ${TONE_CLASSES[tone]}`}>
      <span>{gate.message}</span>
      <Link
        to="/licensing"
        className="shrink-0 whitespace-nowrap underline font-medium hover:no-underline"
      >
        {gate.status === 'expired' ? 'Reactivate now' : 'Manage license'}
      </Link>
    </div>
  );
}
