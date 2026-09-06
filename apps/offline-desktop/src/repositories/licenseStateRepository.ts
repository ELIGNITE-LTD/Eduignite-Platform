import type Database from 'better-sqlite3-multiple-ciphers';
import { nowIso } from '../shared/ids';

// SEAM POINT for the Licensing & Security agent. Plain key/value storage over
// `license_state` — no verification, expiry, or crypto logic lives here.
// This wave only guarantees the storage primitive exists and is exercised by
// at least a set/get round trip (see the connection smoke test).

export function getLicenseStateValue(db: Database.Database, key: string): string | null {
  const row = db.prepare('SELECT value FROM license_state WHERE key = ?').get(key) as
    | { value: string | null }
    | undefined;
  return row ? row.value : null;
}

export function setLicenseStateValue(db: Database.Database, key: string, value: string): void {
  db.prepare(
    `INSERT INTO license_state (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, value, nowIso());
}

export function getAllLicenseState(db: Database.Database): Record<string, string | null> {
  const rows = db.prepare('SELECT key, value FROM license_state').all() as {
    key: string;
    value: string | null;
  }[];
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
