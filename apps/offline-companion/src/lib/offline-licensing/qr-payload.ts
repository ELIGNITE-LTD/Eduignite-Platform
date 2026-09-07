/**
 * Pure, framework-free helpers for the Companion QR activation flow.
 *
 * Ported from apps/mobile/src/lib/offline-licensing/qr-payload.ts (already
 * reviewed for correctness this session) — copied rather than imported
 * because this standalone app has its own dependency tree. Keep this file's
 * logic identical to the mobile version; both are relaying the same wire
 * contract to the same backend.
 *
 * This is the standalone Companion's side of the shared wire contract: it
 * only ever *relays* the challenge JSON scanned from the offline desktop's
 * QR code to the backend — it never signs or fabricates a challenge itself.
 */

import type {
  OfflineLicensingChallenge,
  OfflineLicensingPurpose,
} from "./types";

export type ParseChallengeResult =
  | { ok: true; challenge: OfflineLicensingChallenge }
  | { ok: false; error: string };

const VALID_PURPOSES: OfflineLicensingPurpose[] = ["activation", "renewal", "device_replacement"];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Validates the shape of a decoded QR payload against the wire contract's
 * Challenge JSON. Returns a human-readable reason on failure so the scan
 * screen can show something better than "invalid QR".
 */
export function validateChallengeShape(value: unknown): ParseChallengeResult {
  if (!isPlainObject(value)) {
    return { ok: false, error: "This QR code does not contain a recognizable EduIgnite Offline challenge." };
  }

  const requiredStringFields: (keyof OfflineLicensingChallenge)[] = [
    "challengeId",
    "schoolId",
    "deviceId",
    "nonce",
    "createdAt",
    "expiresAt",
  ];

  for (const field of requiredStringFields) {
    if (!isNonEmptyString(value[field])) {
      return { ok: false, error: `The scanned challenge is missing a valid "${field}".` };
    }
  }

  if (!isNonEmptyString(value.purpose) || !VALID_PURPOSES.includes(value.purpose as OfflineLicensingPurpose)) {
    return {
      ok: false,
      error: 'The scanned challenge has an unrecognized purpose (expected "activation", "renewal", or "device_replacement").',
    };
  }

  if (Number.isNaN(Date.parse(value.createdAt as string)) || Number.isNaN(Date.parse(value.expiresAt as string))) {
    return { ok: false, error: "The scanned challenge has invalid date fields." };
  }

  if (value.purpose === "device_replacement" && !isNonEmptyString(value.previousDeviceId)) {
    return { ok: false, error: "A device-replacement challenge is missing the previous device's ID." };
  }

  const challenge: OfflineLicensingChallenge = {
    challengeId: value.challengeId as string,
    schoolId: value.schoolId as string,
    deviceId: value.deviceId as string,
    purpose: value.purpose as OfflineLicensingPurpose,
    nonce: value.nonce as string,
    createdAt: value.createdAt as string,
    expiresAt: value.expiresAt as string,
    ...(isNonEmptyString(value.previousDeviceId) ? { previousDeviceId: value.previousDeviceId as string } : {}),
  };

  return { ok: true, challenge };
}

/**
 * Parses the raw text decoded from a QR frame (jsQR output) into a
 * validated Challenge. Malformed JSON and shape mismatches are both
 * reported as a `{ ok: false }` result rather than throwing, so callers
 * (camera loops in particular) can keep scanning on failure.
 */
export function parseChallengeQrPayload(raw: string): ParseChallengeResult {
  if (!isNonEmptyString(raw)) {
    return { ok: false, error: "No QR data was captured." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "This QR code is not valid EduIgnite Offline data (not JSON)." };
  }

  return validateChallengeShape(parsed);
}

/**
 * Challenges are short-lived (contract: ~5 minutes). Expiry is checked
 * against device time here purely for UX (fail fast, don't POST a dead
 * challenge) — the backend is the real source of truth for anti-replay and
 * expiry enforcement.
 */
export function isChallengeExpired(challenge: OfflineLicensingChallenge, now: Date = new Date()): boolean {
  const expiresAt = Date.parse(challenge.expiresAt);
  if (Number.isNaN(expiresAt)) return true;
  return expiresAt <= now.getTime();
}

export interface SchoolMatchResult {
  matches: boolean;
  challengeSchoolId: string;
  technicianSchoolId: string | null;
}

/**
 * The QR's `schoolId` is scanned data, not something to trust blindly for
 * display or for deciding whether to proceed. This cross-checks it against
 * the technician's own authenticated school (from session/auth context) so a
 * mismatched school is surfaced as a warning instead of silently processed.
 */
export function checkChallengeSchoolMatch(
  challenge: OfflineLicensingChallenge,
  technicianSchoolId: string | null | undefined
): SchoolMatchResult {
  const normalizedTechnicianSchoolId = technicianSchoolId ? technicianSchoolId.trim() : null;
  const matches = Boolean(
    normalizedTechnicianSchoolId && normalizedTechnicianSchoolId === challenge.schoolId.trim()
  );
  return {
    matches,
    challengeSchoolId: challenge.schoolId,
    technicianSchoolId: normalizedTechnicianSchoolId,
  };
}
