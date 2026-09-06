import type Database from 'better-sqlite3-multiple-ciphers';
import { getLicenseStateValue, setLicenseStateValue } from '../repositories/licenseStateRepository';
import { getSchool } from '../repositories/schoolRepository';
import { getDeviceId, getOrCreateInstallUuid, readDeviceMarker, writeDeviceMarker } from './fingerprint';
import { verifyCertificateSignature } from './crypto';
import type { LicenseCertificate, LicensePlan } from './types';

// Real licensing gate (spec sections 5, 6, 9) — replaces the Wave 1 stub.
// Behaviour, in order, on every call:
//   1. Clock-tamper check against a monotonic max-seen-timestamp persisted in
//      `license_state` — if the system clock has jumped backward beyond a
//      small tolerance, force read-only regardless of anything else.
//   2. If a signed License Certificate is installed, verify its signature
//      (embedded public key), schoolId, and deviceId; invalid/mismatched
//      certificates force read-only.
//   3. Otherwise (or once a valid certificate's plan/expiry are known), fall
//      back to / evaluate against the first-year-free entitlement, stamped
//      once on first run and never reset by reinstalling.
//   4. Compare the resolved expiry against the clock-tamper-safe "now": still
//      active, in a short grace period (writable but warned), or expired
//      (read-only, data never deleted or altered).

export type LicenseStatus = 'active' | 'grace' | 'expired' | 'unknown';

export interface LicenseGateResult {
  status: LicenseStatus;
  /** When true, all write/modify operations must be blocked; reads must not be. */
  readOnly: boolean;
  /** Human-readable explanation, safe to surface in the UI. */
  message: string;
  plan: LicensePlan | null;
  expiresAt: string | null;
  /** Whole days until expiry (negative once past expiry); null when unknown. */
  daysRemaining: number | null;
}

const CLOCK_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes — absorbs timezone/DST noise, per spec section 9.
const GRACE_PERIOD_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Advances (never rewinds) the persisted max-seen-timestamp and reports
 * whether the *real* system clock is currently behind it by more than the
 * tolerance — i.e. someone wound the clock back to try to extend a license.
 */
function getSafeNow(db: Database.Database): { nowMs: number; tampered: boolean } {
  const stored = getLicenseStateValue(db, 'max_seen_timestamp');
  const storedMs = stored ? Date.parse(stored) : NaN;
  const realNowMs = Date.now();
  const tampered = Number.isFinite(storedMs) && realNowMs < storedMs - CLOCK_TOLERANCE_MS;
  const safeNowMs = Number.isFinite(storedMs) ? Math.max(realNowMs, storedMs) : realNowMs;

  setLicenseStateValue(db, 'max_seen_timestamp', new Date(safeNowMs).toISOString());
  return { nowMs: safeNowMs, tampered };
}

interface Entitlement {
  plan: LicensePlan;
  expiresAt: string;
}

/**
 * First-year-free entitlement (spec section 5). On a genuine first run,
 * stamps install_date = now, plan = first_year_free, expiresAt = install
 * date + 365 days, persisting to both the DB (`license_state`) and the
 * out-of-appdata device marker (fingerprint.ts) so a reinstall inherits the
 * original install date instead of restarting the clock.
 */
function ensureFirstYearFreeEntitlement(db: Database.Database): Entitlement {
  const existingInstallDate = getLicenseStateValue(db, 'install_date');
  const existingPlan = getLicenseStateValue(db, 'plan') as LicensePlan | null;
  const existingExpiresAt = getLicenseStateValue(db, 'expires_at');

  if (existingInstallDate && existingPlan && existingExpiresAt) {
    return { plan: existingPlan, expiresAt: existingExpiresAt };
  }

  // DB has no record (fresh DB, e.g. after reinstall) — check the secondary
  // marker before treating this as a genuinely new install.
  const marker = readDeviceMarker();
  const installDate = existingInstallDate ?? marker?.installDate ?? new Date().toISOString();
  const plan: LicensePlan = existingPlan ?? 'first_year_free';
  const expiresAt =
    existingExpiresAt ?? new Date(Date.parse(installDate) + 365 * MS_PER_DAY).toISOString();

  setLicenseStateValue(db, 'install_date', installDate);
  setLicenseStateValue(db, 'plan', plan);
  setLicenseStateValue(db, 'expires_at', expiresAt);

  writeDeviceMarker({ deviceUuid: getOrCreateInstallUuid(db), installDate });

  return { plan, expiresAt };
}

function clockTamperedResult(db: Database.Database): LicenseGateResult {
  return {
    status: 'expired',
    readOnly: true,
    message:
      'The system clock appears to have moved backward. As a security precaution the application has entered ' +
      'read-only mode: your data is safe and fully readable. Correct the system clock and restart the ' +
      'application to resume normal operation.',
    plan: (getLicenseStateValue(db, 'plan') as LicensePlan | null) ?? null,
    expiresAt: getLicenseStateValue(db, 'expires_at'),
    daysRemaining: null,
  };
}

function invalidCertificateResult(reason: string): LicenseGateResult {
  return {
    status: 'expired',
    readOnly: true,
    message: `Installed license certificate ${reason}. The application is in read-only mode: your data is safe ` +
      'and fully readable. Reactivate via the Licensing page.',
    plan: null,
    expiresAt: null,
    daysRemaining: null,
  };
}

/**
 * Resolves the plan/expiry to evaluate: from an installed, verified
 * certificate if present and valid, otherwise from the first-year-free
 * entitlement. Returns `{ invalid: true, result }` if a certificate is
 * present but fails verification (bad signature, wrong school, wrong
 * device) — per the wire contract that always forces read-only rather than
 * silently falling back to the free entitlement.
 */
function resolveEntitlement(
  db: Database.Database
): { invalid: true; result: LicenseGateResult } | { invalid: false; plan: LicensePlan; expiresAt: string } {
  const certJson = getLicenseStateValue(db, 'certificate');
  if (!certJson) {
    const entitlement = ensureFirstYearFreeEntitlement(db);
    return { invalid: false, ...entitlement };
  }

  let cert: LicenseCertificate;
  try {
    cert = JSON.parse(certJson);
  } catch {
    return { invalid: true, result: invalidCertificateResult('is corrupted') };
  }

  if (!verifyCertificateSignature(cert)) {
    return { invalid: true, result: invalidCertificateResult('has an invalid signature') };
  }

  const school = getSchool(db);
  if (school && cert.payload.schoolId !== school.id) {
    return { invalid: true, result: invalidCertificateResult('does not match this school') };
  }

  const deviceId = getDeviceId(db);
  if (cert.payload.deviceId !== deviceId) {
    return { invalid: true, result: invalidCertificateResult('does not match this device') };
  }

  return { invalid: false, plan: cert.payload.plan, expiresAt: cert.payload.expiresAt };
}

/**
 * Real implementation of the licensing gate. Call once at Electron startup
 * (cache is not required — every call is a handful of cheap KV reads) and
 * before every write-path IPC handler; see src/ipc/handlers.ts.
 */
export function checkLicenseGate(db: Database.Database): LicenseGateResult {
  const { nowMs, tampered } = getSafeNow(db);
  if (tampered) return clockTamperedResult(db);

  const resolved = resolveEntitlement(db);
  if (resolved.invalid) return resolved.result;

  const { plan, expiresAt } = resolved;
  const expiresAtMs = Date.parse(expiresAt);
  const graceEndMs = expiresAtMs + GRACE_PERIOD_DAYS * MS_PER_DAY;
  const daysRemaining = Math.ceil((expiresAtMs - nowMs) / MS_PER_DAY);

  if (nowMs < expiresAtMs) {
    return {
      status: 'active',
      readOnly: false,
      message: `License active (${plan}). Expires ${expiresAt}.`,
      plan,
      expiresAt,
      daysRemaining,
    };
  }

  if (nowMs < graceEndMs) {
    const graceDaysLeft = Math.ceil((graceEndMs - nowMs) / MS_PER_DAY);
    return {
      status: 'grace',
      readOnly: false,
      message:
        `Your license expired on ${expiresAt}. You have ${graceDaysLeft} day(s) left in the grace period ` +
        'before the application enters read-only mode. Please renew from the Licensing page.',
      plan,
      expiresAt,
      daysRemaining: 0,
    };
  }

  return {
    status: 'expired',
    readOnly: true,
    message:
      'Your license has expired and the grace period has ended. The application is in read-only mode: your ' +
      'data is safe and fully readable, but new entries and edits are blocked until you renew.',
    plan,
    expiresAt,
    daysRemaining: 0,
  };
}

/**
 * Verifies and installs a License Certificate obtained via QR activation
 * (src/pages/Licensing.tsx). Throws (does not persist anything) if the
 * certificate fails any check — callers should surface the error message to
 * the technician rather than silently ignoring it.
 */
export function installCertificate(db: Database.Database, certificate: LicenseCertificate): LicenseGateResult {
  if (!verifyCertificateSignature(certificate)) {
    throw new Error('Certificate signature verification failed — refusing to install.');
  }
  const school = getSchool(db);
  if (school && certificate.payload.schoolId !== school.id) {
    throw new Error(
      `Certificate school (${certificate.payload.schoolId}) does not match this installation's school (${school.id}).`
    );
  }
  const deviceId = getDeviceId(db);
  if (certificate.payload.deviceId !== deviceId) {
    throw new Error(
      `Certificate device (${certificate.payload.deviceId}) does not match this machine's fingerprint (${deviceId}).`
    );
  }

  setLicenseStateValue(db, 'certificate', JSON.stringify(certificate));
  return checkLicenseGate(db);
}
