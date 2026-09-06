import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { LicenseCertificate, LicenseCertificatePayload } from './types';

// ECDSA P-256 (secp256r1) / SHA-256 signature verification, per the wave-2
// licensing wire contract ("## Crypto"). Node's built-in `crypto` module
// only — no third-party crypto dependency.
//
// Canonical payload rule (must match the backend + companion mobile agents
// exactly): JSON.stringify with keys sorted ascending, no whitespace, UTF-8
// bytes. Signature encoding: base64 of the DER-encoded signature — Node's
// `sign()`/`verify()` default to DER encoding for EC keys, so no extra
// `dsaEncoding` option is needed as long as neither side overrides it to
// 'ieee-p1363'.

/**
 * Deep-sorts every object's keys ascending (recursively; arrays keep their
 * order) so `JSON.stringify` of the result is the canonical form the
 * signature was computed over.
 */
export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/** Canonical JSON per the wire contract: sorted keys, no whitespace, UTF-8. */
export function canonicalJsonStringify(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

/** Signs `payload`'s canonical JSON with an ECDSA P-256 private key (PEM). Returns base64 DER signature. */
export function signPayload(privateKeyPem: string, payload: unknown): string {
  const canonical = canonicalJsonStringify(payload);
  const signer = crypto.createSign('SHA256');
  signer.update(Buffer.from(canonical, 'utf-8'));
  signer.end();
  // Node defaults `dsaEncoding` to 'der' for EC keys — matches the contract.
  return signer.sign(privateKeyPem).toString('base64');
}

/** Verifies a base64 DER ECDSA P-256/SHA-256 signature over `payload`'s canonical JSON. */
export function verifySignature(publicKeyPem: string, payload: unknown, signatureBase64: string): boolean {
  try {
    const canonical = canonicalJsonStringify(payload);
    const verifier = crypto.createVerify('SHA256');
    verifier.update(Buffer.from(canonical, 'utf-8'));
    verifier.end();
    return verifier.verify(publicKeyPem, Buffer.from(signatureBase64, 'base64'));
  } catch {
    // Malformed base64, malformed key, etc. — treat as "not valid", never throw.
    return false;
  }
}

let cachedPublicKeyPem: string | null = null;
let overridePublicKeyPemPath: string | null = null;

/**
 * Overrides where `getEmbeddedPublicKeyPem` reads the public key PEM from.
 *
 * Why this exists: once electron/main.ts + electron/preload.ts are bundled
 * by vite-plugin-electron into a single dist-electron/main.js, `__dirname`
 * inside that bundle points at `dist-electron/`, not `src/licensing/` — the
 * same reason electron/main.ts already resolves its migrations directory
 * explicitly instead of hardcoding a relative path. Call this once at app
 * startup (see electron/main.ts) with the correct dev/packaged path. Tests
 * and any code that imports this module directly (unbundled) can ignore it
 * entirely — the default `__dirname`-relative path already resolves
 * correctly there.
 */
export function setPublicKeyPemPath(pemPath: string): void {
  overridePublicKeyPemPath = pemPath;
  cachedPublicKeyPem = null;
}

/** Loads the embedded public key (checked into app source — see src/licensing/public-key.pem). */
export function getEmbeddedPublicKeyPem(): string {
  if (cachedPublicKeyPem) return cachedPublicKeyPem;
  const pemPath = overridePublicKeyPemPath ?? path.join(__dirname, 'public-key.pem');
  cachedPublicKeyPem = fs.readFileSync(pemPath, 'utf-8');
  return cachedPublicKeyPem;
}

/**
 * Verifies a full License Certificate's signature against the embedded
 * public key. Does NOT check schoolId/deviceId/expiry — that's
 * `checkLicenseGate`'s job (it needs DB + fingerprint context this module
 * deliberately doesn't have).
 */
export function verifyCertificateSignature(certificate: LicenseCertificate): boolean {
  if (!certificate || typeof certificate !== 'object') return false;
  const { payload, signature } = certificate;
  if (!payload || typeof signature !== 'string') return false;
  return verifySignature(getEmbeddedPublicKeyPem(), payload as LicenseCertificatePayload, signature);
}
