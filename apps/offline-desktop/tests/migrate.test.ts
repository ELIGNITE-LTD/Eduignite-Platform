import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getAppliedVersions, loadMigrations, runMigrations } from '../src/db/migrate';

const MIGRATIONS_DIR = path.join(__dirname, '..', 'src', 'db', 'migrations');

describe('loadMigrations', () => {
  it('discovers all real migration files, sorted by version', () => {
    const migrations = loadMigrations(MIGRATIONS_DIR);
    expect(migrations.length).toBeGreaterThanOrEqual(3);
    expect(migrations[0].version).toBe(1);
    expect(migrations[1].version).toBe(2);
    expect(migrations[2].version).toBe(3);
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

  it('applies every migration on a fresh database, including 0003+0004+0005+0006 on top of 0001+0002', () => {
    const result = runMigrations(db, MIGRATIONS_DIR);
    expect(result.applied).toEqual([1, 2, 3, 4, 5, 6]);

    const tableNames = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]
    ).map((r) => r.name);
    expect(tableNames).toContain('schools');
    // 0003's new tables.
    expect(tableNames).toContain('users');
    expect(tableNames).toContain('structure_nodes');
    expect(tableNames).toContain('notices');

    // 0003's new columns on pre-existing tables.
    const schoolColumns = (db.prepare('PRAGMA table_info(schools)').all() as { name: string }[]).map(
      (c) => c.name
    );
    expect(schoolColumns).toContain('setup_completed');
    // 0004's new column on schools.
    expect(schoolColumns).toContain('matricule');
    const classColumns = (db.prepare('PRAGMA table_info(classes)').all() as { name: string }[]).map(
      (c) => c.name
    );
    expect(classColumns).toContain('parent_structure_node_id');

    expect(getAppliedVersions(db)).toEqual(new Set([1, 2, 3, 4, 5, 6]));
  });

  it('is idempotent: running twice in a row applies nothing the second time', () => {
    const first = runMigrations(db, MIGRATIONS_DIR);
    expect(first.applied.length).toBeGreaterThan(0);

    const second = runMigrations(db, MIGRATIONS_DIR);
    expect(second.applied).toEqual([]);

    // Schema is intact and not duplicated (CREATE TABLE IF NOT EXISTS did not error).
    const migrationRows = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all();
    expect(migrationRows).toEqual([{ version: 1 }, { version: 2 }, { version: 3 }, { version: 4 }, { version: 5 }, { version: 6 }]);
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
    expect(result.applied).toEqual([2, 3, 4, 5, 6]);
    expect(getAppliedVersions(db)).toEqual(new Set([1, 2, 3, 4, 5, 6]));
  });

  it('rejects a migrations directory with a duplicate version', () => {
    const dupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eduignite-migrate-dup-'));
    fs.writeFileSync(path.join(dupDir, '0001_a.sql'), 'SELECT 1;');
    fs.writeFileSync(path.join(dupDir, '0001_b.sql'), 'SELECT 1;');
    expect(() => loadMigrations(dupDir)).toThrow(/Duplicate migration version/);
    fs.rmSync(dupDir, { recursive: true, force: true });
  });
});

describe('0006 education category', () => {
  it('defaults existing schools to secondary and rejects unknown categories', () => {
    const db = new Database(':memory:');
    runMigrations(db, MIGRATIONS_DIR);
    db.prepare(
      `INSERT INTO schools (id, name, short_name, principal, motto, location, division, sub_division, city_village,
        address, academic_year, active_term, locale, subscription_currency)
       VALUES ('s1','S','S','P','','L','D','SD','C','A','2026-2027','TERM_1','en','XAF')`
    ).run();
    expect((db.prepare('SELECT education_category AS c FROM schools').get() as { c: string }).c).toBe('secondary');
    expect(() => db.prepare("UPDATE schools SET education_category = 'nursery'").run()).toThrow();
    db.prepare("UPDATE schools SET education_category = 'basic'").run();
    db.close();
  });
});
