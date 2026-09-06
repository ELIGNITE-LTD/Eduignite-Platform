import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import type { ChallengePurpose, LicenseChallenge } from './types';

// QR Activation Challenge generation (spec section 6, wire contract
// "## QR Activation Challenge"). The desktop only ever GENERATES challenges
// and CONSUMES signed responses — it never talks to the backend directly;
// the companion mobile app is the network-connected broker.

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes, per the contract.

export interface GenerateChallengeInput {
  schoolId: string;
  deviceId: string;
  purpose: ChallengePurpose;
  /** Required (and only meaningful) when purpose === 'device_replacement'. */
  previousDeviceId?: string;
}

export function generateChallenge(input: GenerateChallengeInput): LicenseChallenge {
  if (input.purpose === 'device_replacement' && !input.previousDeviceId) {
    throw new Error('previousDeviceId is required for a device_replacement challenge.');
  }

  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + CHALLENGE_TTL_MS);

  const challenge: LicenseChallenge = {
    challengeId: uuidv4(),
    schoolId: input.schoolId,
    deviceId: input.deviceId,
    purpose: input.purpose,
    nonce: crypto.randomBytes(16).toString('hex'),
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  if (input.purpose === 'device_replacement' && input.previousDeviceId) {
    challenge.previousDeviceId = input.previousDeviceId;
  }

  return challenge;
}

export function isChallengeExpired(challenge: LicenseChallenge, nowMs: number = Date.now()): boolean {
  return nowMs > Date.parse(challenge.expiresAt);
}
