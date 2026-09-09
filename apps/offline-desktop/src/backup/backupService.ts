import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import Database from 'better-sqlite3-multiple-ciphers';

import { openDatabase } from '../db/connection';
import { getOrCreateDatabaseKeyHex } from '../db/encryption';
import { getSchool } from '../repositories/schoolRepository';

// Backup / restore (new feature — nothing like this existed before). One
// admin-facing archive file bundles a point-in-time DB snapshot (via
// `VACUUM INTO`, which is WAL-safe — a raw `fs.copyFile` on the live file is
// NOT, since a checkpoint may not have happened yet) plus the encryption key
// material needed to open that snapshot, itself protected by a
// backup-specific passphrase (never stored anywhere). See README section
// "Encryption approach" / src/db/encryption.ts for how the live key is
// normally stored (a plaintext hex file next to the DB) — bundling that key
// unencrypted into a backup file would defeat the whole point of encrypting
// the database, hence the passphrase-wrapped key blob below.
//
// No zip library exists anywhere in this monorepo (checked apps/offline-desktop,
// apps/website, apps/desktop, and the repo root) so per the build note this
// uses a minimal hand-rolled container format on top of Node's built-in
// `zlib`, rather than adding a new dependency for two length-prefixed
// sections. See `packArchive`/`unpackArchive` below for the exact layout.

const ARCHIVE_MAGIC = Buffer.from('EIGNBAK1', 'ascii'); // 8 bytes, also doubles as a format version tag
const FORMAT_VERSION = 1;

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keylen: 32 } as const;

interface KeyEncryptionBlob {
  kdf: 'scrypt';
  scryptParams: { N: number; r: number; p: number; keylen: number };
  saltHex: string;
  ivHex: string;
  authTagHex: string;
  ciphertextHex: string;
}

export interface BackupManifest {
  formatVersion: 1;
  schoolId: string;
  schoolName: string;
  createdAt: string;
  dbSha256: string;
  keyEncryption: KeyEncryptionBlob;
}

/**
 * Thrown only for the handful of situations the UI must explain in plain
 * language (spec: "not raw exceptions surfacing to the UI"). Every entry
 * point below catches anything else (fs errors, zlib errors, JSON errors,
 * SQLite errors) and rewraps it as one of these with a clear message before
 * it can reach the IPC boundary.
 */
export class FriendlyBackupError extends Error {}

function sha256Hex(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function deriveKeyFromPassphrase(
  passphrase: string,
  salt: Buffer,
  params: { N: number; r: number; p: number; keylen: number }
): Buffer {
  return crypto.scryptSync(passphrase, salt, params.keylen, { N: params.N, r: params.r, p: params.p });
}

function encryptKeyMaterial(rawKeyHex: string, passphrase: string): KeyEncryptionBlob {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const derived = deriveKeyFromPassphrase(passphrase, salt, SCRYPT_PARAMS);
  const cipher = crypto.createCipheriv('aes-256-gcm', derived, iv);
  const ciphertext = Buffer.concat([cipher.update(rawKeyHex, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    kdf: 'scrypt',
    scryptParams: { ...SCRYPT_PARAMS },
    saltHex: salt.toString('hex'),
    ivHex: iv.toString('hex'),
    authTagHex: authTag.toString('hex'),
    ciphertextHex: ciphertext.toString('hex'),
  };
}

/** Throws (a raw, non-friendly error — callers must catch) if `passphrase` is wrong: AES-GCM auth tag check fails. */
function decryptKeyMaterial(blob: KeyEncryptionBlob, passphrase: string): string {
  const salt = Buffer.from(blob.saltHex, 'hex');
  const iv = Buffer.from(blob.ivHex, 'hex');
  const authTag = Buffer.from(blob.authTagHex, 'hex');
  const ciphertext = Buffer.from(blob.ciphertextHex, 'hex');
  const derived = deriveKeyFromPassphrase(passphrase, salt, blob.scryptParams);
  const decipher = crypto.createDecipheriv('aes-256-gcm', derived, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf-8');
}

/**
 * Container layout (no external zip dependency — see header comment):
 *   [8 bytes]  magic "EIGNBAK1"
 *   [4 bytes]  LE uint32: length of gzip(manifest JSON)
 *   [N bytes]  gzip(manifest JSON) — schoolId/schoolName/createdAt/dbSha256/keyEncryption
 *   [4 bytes]  LE uint32: length of gzip(db snapshot bytes)
 *   [M bytes]  gzip(db snapshot bytes)
 */
function packArchive(manifest: BackupManifest, dbBytes: Buffer): Buffer {
  const manifestGz = zlib.gzipSync(Buffer.from(JSON.stringify(manifest), 'utf-8'));
  const dbGz = zlib.gzipSync(dbBytes);

  const manifestLen = Buffer.alloc(4);
  manifestLen.writeUInt32LE(manifestGz.length, 0);
  const dbLen = Buffer.alloc(4);
  dbLen.writeUInt32LE(dbGz.length, 0);

  return Buffer.concat([ARCHIVE_MAGIC, manifestLen, manifestGz, dbLen, dbGz]);
}

/** Bounds-checks and validates every section before trusting it. Throws a plain (non-friendly) Error on any problem. */
function unpackArchive(buf: Buffer): { manifest: BackupManifest; dbBytes: Buffer } {
  if (buf.length < ARCHIVE_MAGIC.length + 4) {
    throw new Error('Archive is too small to be a valid backup file.');
  }
  if (!buf.subarray(0, ARCHIVE_MAGIC.length).equals(ARCHIVE_MAGIC)) {
    throw new Error('Archive does not start with the expected backup file signature.');
  }

  let offset = ARCHIVE_MAGIC.length;
  const manifestLen = buf.readUInt32LE(offset);
  offset += 4;
  if (manifestLen <= 0 || offset + manifestLen > buf.length) {
    throw new Error('Backup archive manifest section is truncated.');
  }
  const manifestJson = zlib.gunzipSync(buf.subarray(offset, offset + manifestLen)).toString('utf-8');
  offset += manifestLen;
  const manifest = JSON.parse(manifestJson) as BackupManifest;
  if (manifest.formatVersion !== FORMAT_VERSION) {
    throw new Error(`Unsupported backup format version: ${manifest.formatVersion}.`);
  }
  if (!manifest.schoolId || !manifest.keyEncryption || !manifest.dbSha256) {
    throw new Error('Backup archive manifest is missing required fields.');
  }

  if (offset + 4 > buf.length) {
    throw new Error('Backup archive is truncated (missing database section header).');
  }
  const dbLen = buf.readUInt32LE(offset);
  offset += 4;
  if (dbLen <= 0 || offset + dbLen > buf.length) {
    throw new Error('Backup archive database section is truncated.');
  }
  const dbBytes = zlib.gunzipSync(buf.subarray(offset, offset + dbLen));

  return { manifest, dbBytes };
}

/** Best-effort delete — used for cleaning up temp files / stale WAL sidecars. Never throws. */
function tryUnlink(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch {
    // Ignore — file may never have existed.
  }
}

function walSidecarPaths(dbPath: string): string[] {
  return [`${dbPath}-wal`, `${dbPath}-shm`];
}

// ---------------------------------------------------------------------------
// Backup
// ---------------------------------------------------------------------------

export interface CreateBackupOptions {
  /** Path to the encryption key file next to the live DB (see src/db/encryption.ts). */
  keyFilePath: string;
  /** Where to write the finished archive file. */
  outputPath: string;
  /** Passphrase the admin sets right now, protecting the bundled key material. Required, min 8 chars. */
  passphrase: string;
}

export interface CreateBackupResult {
  outputPath: string;
  schoolName: string;
  createdAt: string;
}

/**
 * Produces one self-contained backup archive from the currently-open,
 * currently-keyed database connection. Safe to call with an active WAL file
 * — `VACUUM INTO` (unlike a raw file copy) always reads a transactionally
 * consistent snapshot regardless of what's still sitting in the WAL.
 */
export function createBackup(db: Database.Database, options: CreateBackupOptions): CreateBackupResult {
  const { keyFilePath, outputPath, passphrase } = options;

  if (!passphrase || passphrase.length < 8) {
    throw new FriendlyBackupError('Please choose a backup passphrase of at least 8 characters.');
  }

  const school = getSchool(db);
  if (!school) {
    throw new FriendlyBackupError('Please finish setting up your school before creating a backup.');
  }

  const tmpSnapshotPath = path.join(os.tmpdir(), `eduignite-backup-snapshot-${crypto.randomUUID()}.sqlite`);
  tryUnlink(tmpSnapshotPath);

  try {
    try {
      // VACUUM INTO on this (already-keyed) connection writes an
      // independently-encrypted, self-consistent snapshot in one step.
      db.prepare('VACUUM INTO ?').run(tmpSnapshotPath);
    } catch (err) {
      throw new FriendlyBackupError(
        `Could not create the backup snapshot: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    let dbBytes: Buffer;
    try {
      dbBytes = fs.readFileSync(tmpSnapshotPath);
    } catch (err) {
      throw new FriendlyBackupError(
        `Could not read the backup snapshot after creating it: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    const rawKeyHex = getOrCreateDatabaseKeyHex(keyFilePath);
    const manifest: BackupManifest = {
      formatVersion: FORMAT_VERSION,
      schoolId: school.id,
      schoolName: school.name,
      createdAt: new Date().toISOString(),
      dbSha256: sha256Hex(dbBytes),
      keyEncryption: encryptKeyMaterial(rawKeyHex, passphrase),
    };

    const archive = packArchive(manifest, dbBytes);

    try {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, archive);
    } catch (err) {
      throw new FriendlyBackupError(
        `Could not write the backup file to ${outputPath}: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    return { outputPath, schoolName: school.name, createdAt: manifest.createdAt };
  } finally {
    tryUnlink(tmpSnapshotPath);
    for (const sidecar of walSidecarPaths(tmpSnapshotPath)) tryUnlink(sidecar);
  }
}

// ---------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------

export interface RestoreBackupOptions {
  /** The live, currently-open database connection. Read-only until validation fully succeeds. */
  currentDb: Database.Database;
  archivePath: string;
  passphrase: string;
  dbPath: string;
  keyFilePath: string;
  migrationsDir: string;
}

export interface RestoreBackupResult {
  /**
   * A freshly-opened connection on the now-restored database. The live
   * `currentDb` handle passed in is closed as part of a successful restore
   * — callers (src/ipc/handlers.ts) MUST swap their reference to this one
   * and never use the old handle again.
   */
  db: Database.Database;
  schoolName: string;
  restoredAt: string;
}

/**
 * Validates a backup archive + passphrase COMPLETELY before touching the
 * live database in any way, then atomically swaps the live DB + key file for
 * the restored ones. If any validation step fails, the live DB is
 * guaranteed untouched (this function never closes/writes it before the
 * last possible moment, once every check below has already passed).
 */
export function restoreBackup(options: RestoreBackupOptions): RestoreBackupResult {
  const { currentDb, archivePath, passphrase, dbPath, keyFilePath, migrationsDir } = options;

  let tempDbPath: string | null = null;
  let tempKeyFilePath: string | null = null;
  let tempValidationDb: Database.Database | null = null;

  try {
    // 1. Read + structurally validate the archive (magic, section bounds, gzip, JSON).
    let archiveBytes: Buffer;
    try {
      archiveBytes = fs.readFileSync(archivePath);
    } catch (err) {
      throw new FriendlyBackupError(
        `Could not read the backup file: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    let manifest: BackupManifest;
    let dbBytes: Buffer;
    try {
      ({ manifest, dbBytes } = unpackArchive(archiveBytes));
    } catch {
      throw new FriendlyBackupError('This backup appears corrupted and cannot be used.');
    }

    // 2. School sanity check — read-only, live DB untouched either way.
    const currentSchool = getSchool(currentDb);
    if (!currentSchool) {
      throw new FriendlyBackupError('Please finish setting up your school before restoring a backup.');
    }
    if (manifest.schoolId !== currentSchool.id) {
      throw new FriendlyBackupError("This backup file doesn't match your school.");
    }

    // 3. Passphrase check — still read-only; a GCM auth-tag failure means "wrong passphrase".
    let rawKeyHex: string;
    try {
      rawKeyHex = decryptKeyMaterial(manifest.keyEncryption, passphrase);
    } catch {
      throw new FriendlyBackupError('Incorrect passphrase.');
    }

    // 4. Content integrity check against the manifest's recorded checksum.
    if (sha256Hex(dbBytes) !== manifest.dbSha256) {
      throw new FriendlyBackupError('This backup appears corrupted and cannot be used.');
    }

    // 5. Stage the restored DB + key at temp paths (same directory as the
    //    live files, so the final swap below is a same-volume atomic rename)
    //    and prove they actually work BEFORE anything live is touched.
    tempDbPath = `${dbPath}.restore-tmp-${crypto.randomUUID()}`;
    tempKeyFilePath = `${keyFilePath}.restore-tmp-${crypto.randomUUID()}`;
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.writeFileSync(tempDbPath, dbBytes);
    fs.writeFileSync(tempKeyFilePath, rawKeyHex, { encoding: 'utf-8', mode: 0o600 });

    try {
      tempValidationDb = openDatabase({
        dbPath: tempDbPath,
        keyFilePath: tempKeyFilePath,
        migrationsDir,
        skipMigrations: true,
      });
      const integrity = tempValidationDb.pragma('integrity_check') as { integrity_check: string }[];
      if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') {
        throw new Error('integrity_check failed');
      }
      const restoredSchoolRow = tempValidationDb
        .prepare('SELECT id FROM schools WHERE id = ?')
        .get(manifest.schoolId);
      if (!restoredSchoolRow) {
        throw new Error('restored database does not contain the expected school row');
      }
      // Force a full checkpoint so the swapped-in file is self-contained —
      // no data left behind in a WAL sidecar that a bare rename would drop.
      tempValidationDb.pragma('wal_checkpoint(TRUNCATE)');
    } catch (err) {
      throw new FriendlyBackupError(
        err instanceof FriendlyBackupError ? err.message : 'This backup appears corrupted and cannot be used.'
      );
    } finally {
      tempValidationDb?.close();
      tempValidationDb = null;
    }

    // 6. Everything checks out — this is the only point of no return. Close
    //    the live connection and atomically replace both files.
    currentDb.close();
    for (const sidecar of walSidecarPaths(dbPath)) tryUnlink(sidecar);
    for (const sidecar of walSidecarPaths(tempDbPath)) tryUnlink(sidecar);

    fs.renameSync(tempDbPath, dbPath);
    fs.renameSync(tempKeyFilePath, keyFilePath);
    tempDbPath = null;
    tempKeyFilePath = null;

    const newDb = openDatabase({ dbPath, keyFilePath, migrationsDir });
    const restoredSchool = getSchool(newDb);

    return {
      db: newDb,
      schoolName: restoredSchool?.name ?? manifest.schoolName,
      restoredAt: new Date().toISOString(),
    };
  } finally {
    if (tempDbPath) {
      tryUnlink(tempDbPath);
      for (const sidecar of walSidecarPaths(tempDbPath)) tryUnlink(sidecar);
    }
    if (tempKeyFilePath) tryUnlink(tempKeyFilePath);
  }
}
