import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3-multiple-ciphers';

/**
 * Small versioned-.sql migration runner.
 *
 * Convention: files in `migrationsDir` are named `NNNN_description.sql`
 * (four-digit zero-padded version prefix). Every applied version is recorded
 * in `schema_migrations` so re-running the app (or the test suite) never
 * re-applies a migration that already ran — this is what "idempotent" means
 * here: calling `runMigrations` twice in a row is always a no-op the second
 * time, and a partially-migrated database picks up exactly where it left off.
 */

export interface MigrationFile {
  version: number;
  name: string;
  fileName: string;
  sql: string;
}

const MIGRATION_FILE_PATTERN = /^(\d{4})_(.+)\.sql$/;

/** Reads and parses every migration file in a directory, sorted by version. */
export function loadMigrations(migrationsDir: string): MigrationFile[] {
  const entries = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const migrations: MigrationFile[] = [];
  for (const fileName of entries) {
    const match = MIGRATION_FILE_PATTERN.exec(fileName);
    if (!match) {
      throw new Error(
        `Migration file "${fileName}" does not match the required "NNNN_description.sql" naming convention.`
      );
    }
    const version = Number.parseInt(match[1], 10);
    const name = match[2];
    const sql = fs.readFileSync(path.join(migrationsDir, fileName), 'utf-8');
    migrations.push({ version, name, fileName, sql });
  }

  migrations.sort((a, b) => a.version - b.version);

  const seen = new Set<number>();
  for (const m of migrations) {
    if (seen.has(m.version)) {
      throw new Error(`Duplicate migration version detected: ${m.version} (${m.fileName})`);
    }
    seen.add(m.version);
  }

  return migrations;
}

function ensureMigrationsTable(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
  `);
}

/** Returns the set of migration versions already applied to this database. */
export function getAppliedVersions(db: Database.Database): Set<number> {
  ensureMigrationsTable(db);
  const rows = db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[];
  return new Set(rows.map((r) => r.version));
}

/**
 * Applies every pending migration in `migrationsDir` to `db`, in version
 * order, each inside its own transaction. Safe to call on every app startup.
 */
export function runMigrations(db: Database.Database, migrationsDir: string): { applied: number[] } {
  ensureMigrationsTable(db);
  const migrations = loadMigrations(migrationsDir);
  const applied = getAppliedVersions(db);
  const newlyApplied: number[] = [];

  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;

    const runInTransaction = db.transaction(() => {
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(
        migration.version,
        migration.name
      );
    });
    runInTransaction();
    newlyApplied.push(migration.version);
  }

  return { applied: newlyApplied };
}
