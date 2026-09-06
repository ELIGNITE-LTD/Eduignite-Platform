import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  canonicalJsonStringify,
  signPayload,
  verifyCertificateSignature,
  verifySignature,
} from '../src/licensing/crypto';
import type { LicenseCertificate, LicenseCertificatePayload } from '../src/licensing/types';

function generateTestKeypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKey: publicKey as string, privateKey: privateKey as string };
}

describe('canonicalJsonStringify', () => {
  it('sorts object keys ascending regardless of input order', () => {
    const a = canonicalJsonStringify({ b: 1, a: 2, c: { z: 1, y: 2 } });
    const b = canonicalJsonStringify({ c: { y: 2, z: 1 }, a: 2, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":2,"b":1,"c":{"y":2,"z":1}}');
  });

  it('produces no whitespace', () => {
    expect(canonicalJsonStringify({ a: 1, b: [1, 2, 3] })).not.toMatch(/\s/);
  });

  it('preserves array order (does not sort array elements)', () => {
    expect(canonicalJsonStringify([3, 1, 2])).toBe('[3,1,2]');
  });
});

describe('signPayload / verifySignature (round trip)', () => {
  it('a signature produced with the private key verifies against the matching public key', () => {
    const { publicKey, privateKey } = generateTestKeypair();
    const payload = { schoolId: 'SCH-00125', deviceId: 'HW-F398-84D2', expiresAt: '2027-09-01T00:00:00Z' };

    const signature = signPayload(privateKey, payload);
    expect(typeof signature).toBe('string');
    expect(signature.length).toBeGreaterThan(0);

    expect(verifySignature(publicKey, payload, signature)).toBe(true);
  });

  it('verification is insensitive to key ordering (canonical JSON) but sensitive to value changes', () => {
    const { publicKey, privateKey } = generateTestKeypair();
    const payload = { b: 2, a: 1 };
    const signature = signPayload(privateKey, payload);

    // Same values, different key order — must still verify.
    expect(verifySignature(publicKey, { a: 1, b: 2 }, signature)).toBe(true);

    // Tampered value — must fail.
    expect(verifySignature(publicKey, { a: 1, b: 3 }, signature)).toBe(false);
  });

  it('rejects a signature made with a different private key', () => {
    const pairA = generateTestKeypair();
    const pairB = generateTestKeypair();
    const payload = { hello: 'world' };
    const signature = signPayload(pairA.privateKey, payload);
    expect(verifySignature(pairB.publicKey, payload, signature)).toBe(false);
  });

  it('never throws on garbage input — returns false instead', () => {
    const { publicKey } = generateTestKeypair();
    expect(verifySignature(publicKey, { a: 1 }, 'not-valid-base64!!')).toBe(false);
    expect(verifySignature(publicKey, { a: 1 }, '')).toBe(false);
  });
});

describe('verifyCertificateSignature (against the app-embedded dev public key)', () => {
  // This exercises the exact same public key file the app ships
  // (src/licensing/public-key.pem) against a certificate signed with the
  // matching dev private key (DEV-PRIVATE-KEY-DO-NOT-SHIP.pem at the repo
  // root) — the real interop path a backend agent's test suite would use.
  const devPrivateKeyPem: string = (() => {
    const raw = fs.readFileSync(path.join(__dirname, '..', 'DEV-PRIVATE-KEY-DO-NOT-SHIP.pem'), 'utf-8');
    // Strip the loud comment header — everything from the first "-----BEGIN" on.
    return raw.slice(raw.indexOf('-----BEGIN'));
  })();

  it('accepts a certificate signed with the matching dev private key', () => {
    const payload: LicenseCertificatePayload = {
      certVersion: 1,
      schoolId: 'SCH-00125',
      deviceId: 'HW-F398-84D2',
      plan: 'first_year_free',
      issuedAt: '2026-09-01T00:00:00.000Z',
      expiresAt: '2027-09-01T00:00:00.000Z',
    };
    const certificate: LicenseCertificate = {
      payload,
      signature: signPayload(devPrivateKeyPem, payload),
    };
    expect(verifyCertificateSignature(certificate)).toBe(true);
  });

  it('rejects a certificate whose payload was tampered with after signing', () => {
    const payload: LicenseCertificatePayload = {
      certVersion: 1,
      schoolId: 'SCH-00125',
      deviceId: 'HW-F398-84D2',
      plan: 'first_year_free',
      issuedAt: '2026-09-01T00:00:00.000Z',
      expiresAt: '2027-09-01T00:00:00.000Z',
    };
    const signature = signPayload(devPrivateKeyPem, payload);
    const tampered: LicenseCertificate = {
      payload: { ...payload, expiresAt: '2099-09-01T00:00:00.000Z' },
      signature,
    };
    expect(verifyCertificateSignature(tampered)).toBe(false);
  });
});
