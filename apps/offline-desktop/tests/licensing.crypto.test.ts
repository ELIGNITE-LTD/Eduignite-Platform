import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  canonicalJsonStringify,
  setPublicKeyPemPath,
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

describe('verifyCertificateSignature (against getEmbeddedPublicKeyPem)', () => {
  // Deliberately does NOT use the real shipped public-key.pem or the repo's
  // DEV-PRIVATE-KEY-DO-NOT-SHIP.pem fixture — this test only exercises the
  // verification LOGIC (does verifyCertificateSignature correctly check
  // whatever key it's pointed at?), fully decoupled from whichever specific
  // keypair happens to be embedded in the app at any given time (dev today,
  // a real production key after 2026-09-06, and whatever it's rotated to
  // later). It uses the app's own `setPublicKeyPemPath` override seam,
  // pointed at a throwaway test-only keypair generated fresh per test file.
  let tempDir: string;
  let testPrivateKeyPem: string;

  beforeEach(() => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    testPrivateKeyPem = privateKey as string;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eduignite-offline-test-key-'));
    fs.writeFileSync(path.join(tempDir, 'public-key.pem'), publicKey as string, 'utf-8');
    setPublicKeyPemPath(path.join(tempDir, 'public-key.pem'));
  });

  afterEach(() => {
    // Reset to the real (default __dirname-relative) path so this test file
    // never leaks its override into any test that runs after it.
    setPublicKeyPemPath(path.join(__dirname, '..', 'src', 'licensing', 'public-key.pem'));
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('accepts a certificate signed with the matching test private key', () => {
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
      signature: signPayload(testPrivateKeyPem, payload),
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
    const signature = signPayload(testPrivateKeyPem, payload);
    const tampered: LicenseCertificate = {
      payload: { ...payload, expiresAt: '2099-09-01T00:00:00.000Z' },
      signature,
    };
    expect(verifyCertificateSignature(tampered)).toBe(false);
  });

  it('rejects a certificate signed with an unrelated key (not the one currently embedded)', () => {
    const unrelated = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
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
      signature: signPayload(unrelated.privateKey as string, payload),
    };
    expect(verifyCertificateSignature(certificate)).toBe(false);
  });
});
