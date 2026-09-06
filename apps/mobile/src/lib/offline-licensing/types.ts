/**
 * EduIgnite Offline — Licensing/QR/Sync wire types.
 *
 * These mirror the shared wire contract exactly (see the platform repo's
 * `wave2-contract.md`). Do not rename fields — the backend and the offline
 * desktop app are built against this same shape.
 */

export type OfflineLicensePlan = "first_year_free" | "annual";

export type OfflineLicensingPurpose = "activation" | "renewal" | "device_replacement";

/** The JSON payload encoded in the QR code shown on the offline desktop. */
export interface OfflineLicensingChallenge {
  challengeId: string;
  schoolId: string;
  deviceId: string;
  purpose: OfflineLicensingPurpose;
  nonce: string;
  createdAt: string;
  expiresAt: string;
  /** Present only when purpose === "device_replacement". */
  previousDeviceId?: string;
}

export interface OfflineLicenseCertificatePayload {
  certVersion: number;
  schoolId: string;
  deviceId: string;
  plan: OfflineLicensePlan;
  issuedAt: string;
  expiresAt: string;
}

export interface OfflineLicenseCertificate {
  payload: OfflineLicenseCertificatePayload;
  signature: string;
}

/** Response body of both POST .../challenges/redeem/ and .../device-replacement/. */
export interface OfflineLicensingRedeemResponse {
  certificate: OfflineLicenseCertificate;
}

export const OFFLINE_LICENSING_PURPOSES: readonly OfflineLicensingPurpose[] = [
  "activation",
  "renewal",
  "device_replacement",
];
