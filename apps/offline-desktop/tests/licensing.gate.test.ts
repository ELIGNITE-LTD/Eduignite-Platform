import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDbHandle } from './testDb';
import { checkLicenseGate, installCertificate } from '../src/licensing/gate';
import { getLicenseStateValue, setLicenseStateValue } from '../src/repositories/licenseStateRepository';
import { upsertSchool } from '../src/repositories/schoolRepository';
import { getDeviceId, setMarkerFilePathForTesting } from '../src/licensing/fingerprint';
import { signPayload } from '../src/licensing/crypto';
import type { LicenseCertificate, LicenseCertificatePayload } from '../src/licensing/types';

const DEV_PRIVATE_KEY_PEM: string = (() => {
  const raw = fs.readFileSync(path.join(__dirname, '..', 'DEV-PRIVATE-KEY-DO-NOT-SHIP.pem'), 'utf-8');
  return raw.slice(raw.indexOf('-----BEGIN'));
})();

const DAY_MS = 24 * 60 * 60 * 1000;

describe('checkLicenseGate', () => {
  let handle: TestDbHandle;
  let markerDir: string;

  beforeEach(() => {
    handle = createTestDb();
    // Isolate the out-of-appdata device marker per test — see the identical
    // note in tests/licensing.fingerprint.test.ts (Vitest runs test files in
    // parallel, so the real shared os.tmpdir() path would be racy here).
    markerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eduignite-gate-marker-test-'));
    setMarkerFilePathForTesting(path.join(markerDir, '.device-marker.json'));
  });

  afterEach(() => {
    handle.close();
    vi.useRealTimers();
    setMarkerFilePathForTesting(null);
    fs.rmSync(markerDir, { recursive: true, force: true });
  });

  it('stamps the first-year-free entitlement on a genuine first run', () => {
    const t0 = new Date('2026-01-01T00:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(t0);

    const result = checkLicenseGate(handle.db);

    expect(result.status).toBe('active');
    expect(result.readOnly).toBe(false);
    expect(result.plan).toBe('first_year_free');
    expect(getLicenseStateValue(handle.db, 'install_date')).toBe(t0.toISOString());
    expect(getLicenseStateValue(handle.db, 'plan')).toBe('first_year_free');

    const expiresAt = new Date(getLicenseStateValue(handle.db, 'expires_at')!);
    expect(expiresAt.getTime() - t0.getTime()).toBe(365 * DAY_MS);
    expect(result.daysRemaining).toBe(365);
  });

  it('does not restamp install_date on subsequent calls', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    checkLicenseGate(handle.db);
    const firstInstallDate = getLicenseStateValue(handle.db, 'install_date');

    vi.setSystemTime(new Date('2026-01-05T00:00:00.000Z'));
    checkLicenseGate(handle.db);
    expect(getLicenseStateValue(handle.db, 'install_date')).toBe(firstInstallDate);
  });

  it('transitions active -> grace -> expired as the clock-safe now crosses expiry + the grace window', () => {
    const installDate = new Date('2026-01-01T00:00:00.000Z');
    const expiresAt = new Date('2026-01-11T00:00:00.000Z'); // 10 days later, arbitrary for the test
    setLicenseStateValue(handle.db, 'install_date', installDate.toISOString());
    setLicenseStateValue(handle.db, 'plan', 'first_year_free');
    setLicenseStateValue(handle.db, 'expires_at', expiresAt.toISOString());

    vi.useFakeTimers();

    // Still active, one day before expiry.
    vi.setSystemTime(new Date(expiresAt.getTime() - DAY_MS));
    let result = checkLicenseGate(handle.db);
    expect(result.status).toBe('active');
    expect(result.readOnly).toBe(false);

    // Past expiry but inside the 7-day grace period: still writable, but flagged.
    vi.setSystemTime(new Date(expiresAt.getTime() + DAY_MS));
    result = checkLicenseGate(handle.db);
    expect(result.status).toBe('grace');
    expect(result.readOnly).toBe(false);

    // Past the grace period: read-only.
    vi.setSystemTime(new Date(expiresAt.getTime() + 8 * DAY_MS));
    result = checkLicenseGate(handle.db);
    expect(result.status).toBe('expired');
    expect(result.readOnly).toBe(true);
  });

  it('forces read-only when the system clock jumps backward beyond tolerance (clock tampering)', () => {
    vi.useFakeTimers();
    const t0 = new Date('2026-06-01T12:00:00.000Z');
    vi.setSystemTime(t0);
    let result = checkLicenseGate(handle.db);
    expect(result.status).toBe('active'); // fresh first-year-free entitlement, nowhere near expiry

    // Wind the clock back 30 minutes — well past the few-minutes tolerance.
    vi.setSystemTime(new Date(t0.getTime() - 30 * 60 * 1000));
    result = checkLicenseGate(handle.db);
    expect(result.status).toBe('expired');
    expect(result.readOnly).toBe(true);
    expect(result.message.toLowerCase()).toContain('clock');
  });

  it('tolerates a small backward jump (timezone/DST noise) without flagging tampering', () => {
    vi.useFakeTimers();
    const t0 = new Date('2026-06-01T12:00:00.000Z');
    vi.setSystemTime(t0);
    checkLicenseGate(handle.db);

    // 2 minutes back is within the tolerance window.
    vi.setSystemTime(new Date(t0.getTime() - 2 * 60 * 1000));
    const result = checkLicenseGate(handle.db);
    expect(result.status).toBe('active');
    expect(result.readOnly).toBe(false);
  });

  it('forces read-only when an installed certificate has an invalid signature', () => {
    const payload: LicenseCertificatePayload = {
      certVersion: 1,
      schoolId: 'SCH-00125',
      deviceId: getDeviceId(handle.db),
      plan: 'annual',
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 400 * DAY_MS).toISOString(),
    };
    const tampered: LicenseCertificate = { payload, signature: 'not-a-real-signature' };
    setLicenseStateValue(handle.db, 'certificate', JSON.stringify(tampered));

    const result = checkLicenseGate(handle.db);
    expect(result.status).toBe('expired');
    expect(result.readOnly).toBe(true);
    expect(result.message.toLowerCase()).toContain('invalid signature');
  });

  it('forces read-only when a validly-signed certificate targets a different device', () => {
    const payload: LicenseCertificatePayload = {
      certVersion: 1,
      schoolId: 'SCH-00125',
      deviceId: 'HW-0000-0000', // deliberately wrong
      plan: 'annual',
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 400 * DAY_MS).toISOString(),
    };
    const certificate: LicenseCertificate = { payload, signature: signPayload(DEV_PRIVATE_KEY_PEM, payload) };
    setLicenseStateValue(handle.db, 'certificate', JSON.stringify(certificate));

    const result = checkLicenseGate(handle.db);
    expect(result.status).toBe('expired');
    expect(result.readOnly).toBe(true);
    expect(result.message.toLowerCase()).toContain('device');
  });
});

describe('installCertificate', () => {
  let handle: TestDbHandle;
  let markerDir: string;

  beforeEach(() => {
    handle = createTestDb();
    markerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eduignite-gate-marker-test-'));
    setMarkerFilePathForTesting(path.join(markerDir, '.device-marker.json'));
    upsertSchool(handle.db, {
      id: 'SCH-00125',
      name: 'Test School',
      short_name: 'TS',
      principal: '',
      motto: '',
      location: '',
      division: '',
      sub_division: '',
      city_village: '',
      address: '',
      postal_code: null,
      academic_year: '2026-2027',
      active_term: 'TERM_1',
      locale: 'en',
      subscription_currency: 'XAF',
    });
  });

  afterEach(() => {
    handle.close();
    setMarkerFilePathForTesting(null);
    fs.rmSync(markerDir, { recursive: true, force: true });
  });

  function validPayload(overrides: Partial<LicenseCertificatePayload> = {}): LicenseCertificatePayload {
    return {
      certVersion: 1,
      schoolId: 'SCH-00125',
      deviceId: getDeviceId(handle.db),
      plan: 'annual',
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 400 * DAY_MS).toISOString(),
      ...overrides,
    };
  }

  it('installs and activates a validly-signed certificate for this school + device', () => {
    const payload = validPayload();
    const certificate: LicenseCertificate = { payload, signature: signPayload(DEV_PRIVATE_KEY_PEM, payload) };

    const result = installCertificate(handle.db, certificate);
    expect(result.status).toBe('active');
    expect(result.plan).toBe('annual');

    // Persists — a fresh gate check reflects the installed certificate.
    const again = checkLicenseGate(handle.db);
    expect(again.status).toBe('active');
    expect(again.plan).toBe('annual');
  });

  it('refuses to install a certificate signed by an unknown key', () => {
    const payload = validPayload();
    const bogus: LicenseCertificate = { payload, signature: Buffer.from('nope').toString('base64') };
    expect(() => installCertificate(handle.db, bogus)).toThrow(/signature/i);
  });

  it('refuses to install a certificate for a different school', () => {
    const payload = validPayload({ schoolId: 'SCH-99999' });
    const certificate: LicenseCertificate = { payload, signature: signPayload(DEV_PRIVATE_KEY_PEM, payload) };
    expect(() => installCertificate(handle.db, certificate)).toThrow(/school/i);
  });

  it('refuses to install a certificate for a different device', () => {
    const payload = validPayload({ deviceId: 'HW-DEAD-BEEF' });
    const certificate: LicenseCertificate = { payload, signature: signPayload(DEV_PRIVATE_KEY_PEM, payload) };
    expect(() => installCertificate(handle.db, certificate)).toThrow(/device/i);
  });
});
