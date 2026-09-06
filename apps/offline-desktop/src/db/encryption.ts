import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Local encryption key management for the SQLCipher-compatible database
 * container (see connection.ts and README.md "Encryption approach").
 *
 * WAVE 1 SCOPE: the key is a random 256-bit value generated on first run and
 * stored, hex-encoded, in a key file next to the database with restrictive
 * permissions (best-effort `chmod 600`; Windows ACLs are not touched here).
 * This protects the database file from casual copy-and-open on another
 * machine, and is a real encryption-at-rest key — but it is NOT yet bound to
 * device hardware, so a stolen key file + database file pair can still be
 * decrypted elsewhere.
 *
 * TODO(licensing agent): once hardware fingerprinting exists, derive this key
 * from the hardware fingerprint (e.g. HKDF over the Device ID + a per-install
 * salt) instead of a bare random file, and re-key existing databases via
 * `PRAGMA rekey`. Keep the same call signature (`getOrCreateDatabaseKeyHex`)
 * so `connection.ts` does not need to change.
 */

const KEY_BYTES = 32; // 256-bit key, used as SQLCipher's raw key via `x'<hex>'`

export function getOrCreateDatabaseKeyHex(keyFilePath: string): string {
  if (fs.existsSync(keyFilePath)) {
    const existing = fs.readFileSync(keyFilePath, 'utf-8').trim();
    if (/^[0-9a-fA-F]{64}$/.test(existing)) {
      return existing.toLowerCase();
    }
    throw new Error(
      `Database key file at ${keyFilePath} is present but malformed. Refusing to overwrite it automatically — ` +
        'restore it from backup or delete it deliberately if the database itself is being re-created.'
    );
  }

  const dir = path.dirname(keyFilePath);
  fs.mkdirSync(dir, { recursive: true });

  const keyHex = crypto.randomBytes(KEY_BYTES).toString('hex');
  fs.writeFileSync(keyFilePath, keyHex, { encoding: 'utf-8', mode: 0o600 });
  try {
    // Best-effort on POSIX; a no-op in effect (but harmless) on Windows.
    fs.chmodSync(keyFilePath, 0o600);
  } catch {
    // Ignore — Windows filesystems don't support POSIX permission bits.
  }
  return keyHex;
}

/** Formats a hex key for use in a `PRAGMA key = ...` statement. */
export function toSqlCipherKeyLiteral(keyHex: string): string {
  return `"x'${keyHex}'"`;
}
