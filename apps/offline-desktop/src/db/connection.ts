import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { getOrCreateDatabaseKeyHex, toSqlCipherKeyLiteral } from './encryption';
import { runMigrations } from './migrate';

export interface OpenDatabaseOptions {
  /** Path to the (encrypted) SQLite file. */
  dbPath: string;
  /** Path to the hex-encoded encryption key file (see encryption.ts). */
  keyFilePath: string;
  /** Directory containing versioned `NNNN_*.sql` migration files. */
  migrationsDir: string;
  /** Skip migrations (used by tests that want to inspect a raw pre-migration DB). */
  skipMigrations?: boolean;
}

/**
 * Opens (creating if needed) the encrypted local SQLite database, applies WAL
 * mode + foreign key enforcement, and runs any pending migrations.
 *
 * This is the single entry point every repository and the Electron main
 * process should use to get a `Database` handle — it guarantees the database
 * is always opened the same way (encrypted, WAL, FKs on, migrated).
 */
export function openDatabase(options: OpenDatabaseOptions): Database.Database {
  const { dbPath, keyFilePath, migrationsDir, skipMigrations } = options;

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const keyHex = getOrCreateDatabaseKeyHex(keyFilePath);
  const db = new Database(dbPath);

  // Must be the very first statement on a fresh connection, before any other
  // pragma or query, per SQLCipher convention.
  db.pragma(`key = ${toSqlCipherKeyLiteral(keyHex)}`);

  // Crash resiliency (spec section 4 / 9): WAL journal so a sudden power loss
  // rolls back incomplete transactions instead of corrupting the file.
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = FULL');
  // Referential integrity is enforced at the SQLite level, not just in app code.
  db.pragma('foreign_keys = ON');

  // Sanity check: a wrong/corrupted key opens the file but any real query
  // fails immediately with "file is not a database" — surface that clearly.
  try {
    db.pragma('user_version');
  } catch (err) {
    db.close();
    throw new Error(
      `Failed to open the local database at ${dbPath}. The encryption key file may be missing, ` +
        `corrupted, or mismatched with this database file. Original error: ${(err as Error).message}`
    );
  }

  if (!skipMigrations) {
    runMigrations(db, migrationsDir);
  }

  return db;
}
