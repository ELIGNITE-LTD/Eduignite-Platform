import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDbHandle } from './testDb';
import {
  computeFingerprintHash,
  formatDeviceId,
  getDeviceId,
  getMarkerFilePath,
  getOrCreateInstallUuid,
  readDeviceMarker,
  setMarkerFilePathForTesting,
  writeDeviceMarker,
} from '../src/licensing/fingerprint';

describe('formatDeviceId', () => {
  it('formats the first 8 hex chars of a hash as HW-XXXX-XXXX, uppercased', () => {
    const hash = 'f39884d2abcdef0123456789'.padEnd(64, '0');
    expect(formatDeviceId(hash)).toBe('HW-F398-84D2');
  });
});

describe('computeFingerprintHash', () => {
  it('is deterministic for the same install UUID', () => {
    const a = computeFingerprintHash('same-uuid');
    const b = computeFingerprintHash('same-uuid');
    expect(a).toBe(b);
  });

  it('differs for a different install UUID', () => {
    const a = computeFingerprintHash('uuid-one');
    const b = computeFingerprintHash('uuid-two');
    expect(a).not.toBe(b);
  });

  it('is a 64-char hex sha256 digest', () => {
    expect(computeFingerprintHash('x')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('getDeviceId + getOrCreateInstallUuid (DB-backed)', () => {
  let handle: TestDbHandle;
  let markerDir: string;

  beforeEach(() => {
    handle = createTestDb();
    // Point the marker at a private, per-test temp dir instead of the real
    // shared os.tmpdir() location — Vitest runs test files in parallel, so a
    // fixed shared path would let this file and other licensing test files
    // race on the same marker.
    markerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eduignite-marker-test-'));
    setMarkerFilePathForTesting(path.join(markerDir, '.device-marker.json'));
  });

  afterEach(() => {
    handle.close();
    setMarkerFilePathForTesting(null);
    fs.rmSync(markerDir, { recursive: true, force: true });
  });

  it('generates a stable HW-XXXX-XXXX deviceId that does not change across repeated calls', () => {
    const first = getDeviceId(handle.db);
    const second = getDeviceId(handle.db);
    expect(first).toBe(second);
    expect(first).toMatch(/^HW-[0-9A-F]{4}-[0-9A-F]{4}$/);
  });

  it('persists the install UUID once and reuses it (never regenerates)', () => {
    const uuid1 = getOrCreateInstallUuid(handle.db);
    const uuid2 = getOrCreateInstallUuid(handle.db);
    expect(uuid1).toBe(uuid2);
  });

  it('recovers the install UUID from the out-of-appdata marker if the DB has none (simulated reinstall)', () => {
    const originalUuid = getOrCreateInstallUuid(handle.db);
    writeDeviceMarker({ deviceUuid: originalUuid, installDate: new Date().toISOString() });

    // Simulate a fresh DB after uninstall/reinstall — a brand new test DB
    // handle with no `device_uuid` row, but the marker file survives.
    const freshHandle = createTestDb();
    try {
      const recoveredUuid = getOrCreateInstallUuid(freshHandle.db);
      expect(recoveredUuid).toBe(originalUuid);
    } finally {
      freshHandle.close();
    }
  });

  it('writeDeviceMarker/readDeviceMarker round-trip', () => {
    const marker = { deviceUuid: 'abc-123', installDate: '2026-01-01T00:00:00.000Z' };
    writeDeviceMarker(marker);
    expect(readDeviceMarker()).toEqual(marker);
  });

  it('readDeviceMarker returns null (never throws) when the marker file is missing or corrupt', () => {
    fs.rmSync(getMarkerFilePath(), { force: true });
    expect(readDeviceMarker()).toBeNull();

    fs.mkdirSync(path.dirname(getMarkerFilePath()), { recursive: true });
    fs.writeFileSync(getMarkerFilePath(), 'not json', 'utf-8');
    expect(readDeviceMarker()).toBeNull();
  });
});
