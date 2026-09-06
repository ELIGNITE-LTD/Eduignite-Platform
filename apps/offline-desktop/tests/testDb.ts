import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3-multiple-ciphers';
import { openDatabase } from '../src/db/connection';

// Test helper: opens a real (encrypted) SQLite database in a throwaway temp
// directory, fully migrated, ready for repository/integration tests. Using
// the exact same `openDatabase` entry point as the Electron main process
// means these tests exercise the real WAL/foreign-keys/encryption pragmas,
// not a simplified stand-in.

const MIGRATIONS_DIR = path.join(__dirname, '..', 'src', 'db', 'migrations');

export interface TestDbHandle {
  db: Database.Database;
  dir: string;
  close(): void;
}

export function createTestDb(): TestDbHandle {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eduignite-offline-test-'));
  const db = openDatabase({
    dbPath: path.join(dir, 'test.sqlite'),
    keyFilePath: path.join(dir, 'test.key'),
    migrationsDir: MIGRATIONS_DIR,
  });

  return {
    db,
    dir,
    close() {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
