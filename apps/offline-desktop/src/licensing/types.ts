// Shared shapes for the licensing/QR-activation wire contract. Mirrors
// scratchpad/wave2-contract.md exactly — the backend and companion mobile
// agents built against the same document, so field names/casing here must
// not drift from it without updating that contract file too.

export type LicensePlan = 'first_year_free' | 'annual';

export interface LicenseCertificatePayload {
  certVersion: number;
  schoolId: string;
  deviceId: string;
  plan: LicensePlan;
  issuedAt: string; // ISO-8601
  expiresAt: string; // ISO-8601
}

export interface LicenseCertificate {
  payload: LicenseCertificatePayload;
  /** base64 of the DER-encoded ECDSA P-256/SHA-256 signature over the canonical JSON of `payload`. */
  signature: string;
}

export type ChallengePurpose = 'activation' | 'renewal' | 'device_replacement';

export interface LicenseChallenge {
  challengeId: string;
  schoolId: string;
  deviceId: string;
  purpose: ChallengePurpose;
  /** 16 random bytes, hex-encoded. */
  nonce: string;
  createdAt: string; // ISO-8601
  expiresAt: string; // ISO-8601, createdAt + 5 minutes
  /** Only present when purpose === 'device_replacement'. */
  previousDeviceId?: string;
}

/** Shape returned by the backend (relayed via the companion app's response QR / paste-code). */
export interface ChallengeRedeemResponse {
  certificate: LicenseCertificate;
}
