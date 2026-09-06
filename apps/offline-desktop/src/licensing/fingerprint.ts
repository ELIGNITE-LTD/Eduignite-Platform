import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import type Database from 'better-sqlite3-multiple-ciphers';
import { getLicenseStateValue, setLicenseStateValue } from '../repositories/licenseStateRepository';

// Hardware fingerprint (spec sections 5, 9): deviceId is a stable hash of
// platform + arch + first CPU model + a persisted random installation UUID.
// The UUID (not raw hardware alone) is what makes the fingerprint change if
// someone genuinely reinstalls onto different hardware while still resisting
// casual "delete a file and relaunch" resets — see the two-location
// persistence below.

export interface DeviceMarker {
  deviceUuid: string;
  /** ISO-8601. Written once on first run, never regenerated. */
  installDate: string;
}

const MARKER_DIRNAME = '.eduignite-offline';
const MARKER_FILENAME = '.device-marker.json';

let overrideMarkerFilePath: string | null = null;

/**
 * Test-only seam: points the marker at a private path instead of the shared
 * OS temp location. Without this, two test files touching the real
 * `os.tmpdir()` path concurrently (Vitest runs files in parallel by default)
 * can stomp on each other's marker. Never called from production code.
 */
export function setMarkerFilePathForTesting(overridePath: string | null): void {
  overrideMarkerFilePath = overridePath;
}

/**
 * Secondary, best-effort persistence location OUTSIDE the normal Electron
 * userData folder (a dot-prefixed file under the OS temp directory), so a
 * plain uninstall/reinstall of the app — which typically wipes userData —
 * does not by itself reset the free-trial clock or mint a new device
 * identity. This is explicitly NOT unbreakable: a determined local admin who
 * knows to look in the temp directory (or wipes it, e.g. a disk cleanup
 * tool) can still delete this file along with the encrypted database. It
 * only raises the bar above the trivial "uninstall, delete userData,
 * reinstall" reset path described in spec section 5.
 */
export function getMarkerFilePath(): string {
  return overrideMarkerFilePath ?? path.join(os.tmpdir(), MARKER_DIRNAME, MARKER_FILENAME);
}

export function readDeviceMarker(): DeviceMarker | null {
  try {
    const raw = fs.readFileSync(getMarkerFilePath(), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<DeviceMarker>;
    if (typeof parsed.deviceUuid === 'string' && typeof parsed.installDate === 'string') {
      return { deviceUuid: parsed.deviceUuid, installDate: parsed.installDate };
    }
    return null;
  } catch {
    return null;
  }
}

export function writeDeviceMarker(marker: DeviceMarker): void {
  try {
    const filePath = getMarkerFilePath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(marker), 'utf-8');
  } catch {
    // Best-effort only: a read-only/missing temp directory must never crash
    // the app or block licensing — the DB-backed copy in license_state
    // remains the primary source of truth for the current install.
  }
}

/**
 * Returns the persisted install UUID, generating it once on first run. Never
 * regenerated afterwards. Checks the encrypted DB first (primary), falling
 * back to the out-of-appdata marker (secondary) if the DB was wiped/replaced
 * — this is what prevents a reinstall from silently resetting the device
 * identity and the free-trial start date together.
 */
export function getOrCreateInstallUuid(db: Database.Database): string {
  const existing = getLicenseStateValue(db, 'device_uuid');
  if (existing) return existing;

  const marker = readDeviceMarker();
  const uuid = marker?.deviceUuid ?? uuidv4();
  setLicenseStateValue(db, 'device_uuid', uuid);
  return uuid;
}

/** Formats a hash's first 8 hex chars as `HW-XXXX-XXXX`, per the wire contract. */
export function formatDeviceId(hashHex: string): string {
  const first8 = hashHex.slice(0, 8).toUpperCase();
  return `HW-${first8.slice(0, 4)}-${first8.slice(4, 8)}`;
}

/** SHA-256 over platform + arch + first CPU model + the persisted install UUID. */
export function computeFingerprintHash(installUuid: string): string {
  const cpus = os.cpus();
  const cpuModel = cpus.length > 0 ? cpus[0].model : 'unknown-cpu';
  const raw = [os.platform(), os.arch(), cpuModel, installUuid].join('|');
  return crypto.createHash('sha256').update(raw, 'utf-8').digest('hex');
}

/** This machine's deviceId, e.g. `HW-F398-84D2`. Stable across restarts. */
export function getDeviceId(db: Database.Database): string {
  const installUuid = getOrCreateInstallUuid(db);
  return formatDeviceId(computeFingerprintHash(installUuid));
}
