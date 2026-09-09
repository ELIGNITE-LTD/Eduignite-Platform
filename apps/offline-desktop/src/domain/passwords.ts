// Password hashing for staff login (Auth/RBAC — Phase A #3).
//
// No bcrypt/argon2 dependency exists anywhere in this monorepo today (checked
// every apps/*/package.json before adding one), so per the build contract we
// use Node's built-in `crypto.scrypt` — a real, salted, slow KDF, not a bare
// hash — as the zero-dependency fallback. Never store or compare plaintext.
//
// Encoded format: `scrypt$N$r$p$<saltHex>$<hashHex>` — the cost parameters
// are embedded in the string so they can be tuned later (or a future
// bcrypt/argon2 migration written) without invalidating already-stored hashes
// of a different cost.

import crypto from 'node:crypto';

const ALGO_TAG = 'scrypt';
const DEFAULT_N = 16384; // CPU/memory cost — 2^14, scrypt's recommended interactive-login minimum.
const DEFAULT_R = 8;
const DEFAULT_P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export interface ScryptParams {
  N: number;
  r: number;
  p: number;
}

function scryptAsync(password: string, salt: Buffer, params: ScryptParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      KEY_LENGTH,
      { N: params.N, r: params.r, p: params.p, maxmem: 256 * 1024 * 1024 },
      (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey);
      }
    );
  });
}

/** Hashes a plaintext password into the storable `scrypt$N$r$p$salt$hash` format. */
export async function hashPassword(
  password: string,
  params: ScryptParams = { N: DEFAULT_N, r: DEFAULT_R, p: DEFAULT_P }
): Promise<string> {
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters.');
  }
  const salt = crypto.randomBytes(SALT_LENGTH);
  const derivedKey = await scryptAsync(password, salt, params);
  return `${ALGO_TAG}$${params.N}$${params.r}$${params.p}$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

/**
 * Verifies a plaintext password against a stored hash produced by
 * `hashPassword`. Always does a constant-time comparison of the derived
 * keys (never a plain `===` on secret material) and never throws on a
 * malformed/foreign hash — it just returns false, so a caller can safely
 * call this on arbitrary stored data without a surrounding try/catch.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split('$');
  if (parts.length !== 6 || parts[0] !== ALGO_TAG) return false;

  const [, nStr, rStr, pStr, saltHex, hashHex] = parts;
  const N = Number.parseInt(nStr, 10);
  const r = Number.parseInt(rStr, 10);
  const p = Number.parseInt(pStr, 10);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltHex, 'hex');
    expected = Buffer.from(hashHex, 'hex');
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  const actual = await scryptAsync(password, salt, { N, r, p });
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}
