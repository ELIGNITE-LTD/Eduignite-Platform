import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getAppliedVersions, loadMigrations, runMigrations } from '../src/db/migrate';

const MIGRATIONS_DIR = path.join(__dirname, '..', 'src', 'db', 'migrations');

describe('loadMigrations', () => {
  it('discovers both real migration files, sorted by version', () => {
    const migrations = loadMigrations(MIGRATIONS_DIR);
    expect(migrations.length).toBeGreaterThanOrEqual(2);
    expect(migrations[0].version).toBe(1);
    expect(migrations[1].version).toBe(2);
    for (let i = 1; i < migrations.length; i++) {
      expect(migrations[i].version).toBeGreaterThan(migrations[i - 1].version);
    }
  });
});

describe('runMigrations', () => {
  let dir: string;
  let db: Database.Database;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eduignite-migrate-test-'));
    db = new Database(path.join(dir, 'db.sqlite'));
    db.pragma('journal_mode = WAL');
  });

  afterEach(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('applies every migration on a fresh database', () => {
    const result = runMigrations(db, MIGRATIONS_DIR);
    expect(result.applied).toEqual([1, 2]);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schools'")
      .all();
    expect(tables).toHaveLength(1);

    expect(getAppliedVersions(db)).toEqual(new Set([1, 2]));
  });

  it('is idempotent: running twice in a row applies nothing the second time', () => {
    const first = runMigrations(db, MIGRATIONS_DIR);
    expect(first.applied.length).toBeGreaterThan(0);

    const second = runMigrations(db, MIGRATIONS_DIR);
    expect(second.applied).toEqual([]);

    // Schema is intact and not duplicated (CREATE TABLE IF NOT EXISTS did not error).
    const migrationRows = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all();
    expect(migrationRows).toEqual([{ version: 1 }, { version: 2 }]);
  });

  it('picks up a partially-migrated database from where it left off', () => {
    // Simulate a database that only ever got migration 1 applied.
    const [migration1] = loadMigrations(MIGRATIONS_DIR);
    db.exec(migration1.sql);
    db.exec(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))"
    );
    db.prepare('INSERT INTO schema_migrations (version, name) VALUES (1, ?)').run(migration1.name);

    const result = runMigrations(db, MIGRATIONS_DIR);
    expect(result.applied).toEqual([2]);
    expect(getAppliedVersions(db)).toEqual(new Set([1, 2]));
  });

  it('rejects a migrations directory with a duplicate version', () => {
    const dupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eduignite-migrate-dup-'));
    fs.writeFileSync(path.join(dupDir, '0001_a.sql'), 'SELECT 1;');
    fs.writeFileSync(path.join(dupDir, '0001_b.sql'), 'SELECT 1;');
    expect(() => loadMigrations(dupDir)).toThrow(/Duplicate migration version/);
    fs.rmSync(dupDir, { recursive: true, force: true });
  });
});
