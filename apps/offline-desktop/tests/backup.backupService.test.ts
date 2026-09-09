import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDbHandle } from './testDb';
import { createBackup, restoreBackup, FriendlyBackupError } from '../src/backup/backupService';
import { openDatabase } from '../src/db/connection';
import { upsertSchool } from '../src/repositories/schoolRepository';
import { createTeacher, listTeachers } from '../src/repositories/teacherRepository';

const MIGRATIONS_DIR = path.join(__dirname, '..', 'src', 'db', 'migrations');
const PASSPHRASE = 'correct-horse-battery-staple';

// createTestDb() (tests/testDb.ts) always names its files test.sqlite / test.key
// inside the throwaway temp dir it hands back — see that file's implementation.
function dbPathFor(handle: TestDbHandle) {
  return path.join(handle.dir, 'test.sqlite');
}
function keyFilePathFor(handle: TestDbHandle) {
  return path.join(handle.dir, 'test.key');
}

function seedSchool(handle: TestDbHandle, id: string, name: string) {
  upsertSchool(handle.db, {
    id,
    name,
    short_name: name.slice(0, 3).toUpperCase(),
    principal: 'Principal Test',
    motto: '',
    location: '',
    division: '',
    sub_division: '',
    city_village: '',
    address: '',
    postal_code: null,
    academic_year: '2026-2027',
    active_term: 'TERM_1',
    locale: 'en',
    subscription_currency: 'XAF',
  });
}

describe('backupService', () => {
  let handle: TestDbHandle;
  let archiveDir: string;

  beforeEach(() => {
    handle = createTestDb();
    archiveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eduignite-backup-archive-'));
  });

  afterEach(() => {
    // handle.db may have been closed and replaced by a restore in some
    // tests — close whichever connection is currently live.
    try {
      handle.db.close();
    } catch {
      // already closed
    }
    fs.rmSync(handle.dir, { recursive: true, force: true });
    fs.rmSync(archiveDir, { recursive: true, force: true });
  });

  it('round-trips: backup, destroy the live copy, restore, and the original data is back', () => {
    seedSchool(handle, 'SCH-1', 'Round Trip Academy');
    createTeacher(handle.db, {
      school_id: 'SCH-1',
      teacher_number: 'T-001',
      first_name: 'Ada',
      last_name: 'Lovelace',
      gender: 'female',
      phone: '600000001',
      email: 'ada@example.com',
      date_of_joining: '2020-01-01',
    });

    const outputPath = path.join(archiveDir, 'backup.eibackup');
    const result = createBackup(handle.db, { keyFilePath: keyFilePathFor(handle), outputPath, passphrase: PASSPHRASE });
    expect(result.outputPath).toBe(outputPath);
    expect(fs.existsSync(outputPath)).toBe(true);

    // Simulate catastrophic loss of the live database + key.
    handle.db.close();
    fs.rmSync(dbPathFor(handle));
    fs.rmSync(keyFilePathFor(handle));
    fs.rmSync(`${dbPathFor(handle)}-wal`, { force: true });
    fs.rmSync(`${dbPathFor(handle)}-shm`, { force: true });

    // A fresh (empty) install with the same school id is what restore needs
    // to sanity-check against — re-create the shell DB + school row.
    const liveDb = openDatabase({
      dbPath: dbPathFor(handle),
      keyFilePath: keyFilePathFor(handle),
      migrationsDir: MIGRATIONS_DIR,
    });
    seedSchool({ ...handle, db: liveDb }, 'SCH-1', 'Round Trip Academy');

    const restoreResult = restoreBackup({
      currentDb: liveDb,
      archivePath: outputPath,
      passphrase: PASSPHRASE,
      dbPath: dbPathFor(handle),
      keyFilePath: keyFilePathFor(handle),
      migrationsDir: MIGRATIONS_DIR,
    });

    handle.db = restoreResult.db; // hand the fresh connection back so afterEach closes the right one
    const teachers = listTeachers(handle.db, 'SCH-1');
    expect(teachers).toHaveLength(1);
    expect(teachers[0].first_name).toBe('Ada');
    expect(teachers[0].last_name).toBe('Lovelace');
  });

  it('rejects a wrong passphrase without touching the live database at all', () => {
    seedSchool(handle, 'SCH-2', 'Guarded Academy');
    createTeacher(handle.db, {
      school_id: 'SCH-2',
      teacher_number: 'T-002',
      first_name: 'Grace',
      last_name: 'Hopper',
      gender: 'female',
      phone: '600000002',
      email: 'grace@example.com',
      date_of_joining: '2020-01-01',
    });

    const outputPath = path.join(archiveDir, 'backup.eibackup');
    createBackup(handle.db, { keyFilePath: keyFilePathFor(handle), outputPath, passphrase: PASSPHRASE });

    const dbBytesBefore = fs.readFileSync(dbPathFor(handle));

    expect(() =>
      restoreBackup({
        currentDb: handle.db,
        archivePath: outputPath,
        passphrase: 'totally-wrong-passphrase',
        dbPath: dbPathFor(handle),
        keyFilePath: keyFilePathFor(handle),
        migrationsDir: MIGRATIONS_DIR,
      })
    ).toThrow('Incorrect passphrase.');

    // Live DB file untouched byte-for-byte, and still fully queryable on
    // the SAME connection (restoreBackup must never have closed it).
    const dbBytesAfter = fs.readFileSync(dbPathFor(handle));
    expect(dbBytesAfter.equals(dbBytesBefore)).toBe(true);
    expect(listTeachers(handle.db, 'SCH-2')).toHaveLength(1);
  });

  it('rejects a backup made for a different school', () => {
    seedSchool(handle, 'SCH-A', 'School A');
    const outputPath = path.join(archiveDir, 'backup.eibackup');
    createBackup(handle.db, { keyFilePath: keyFilePathFor(handle), outputPath, passphrase: PASSPHRASE });

    const otherHandle = createTestDb();
    try {
      seedSchool(otherHandle, 'SCH-B', 'School B');
      const dbBytesBefore = fs.readFileSync(dbPathFor(otherHandle));

      expect(() =>
        restoreBackup({
          currentDb: otherHandle.db,
          archivePath: outputPath,
          passphrase: PASSPHRASE,
          dbPath: dbPathFor(otherHandle),
          keyFilePath: keyFilePathFor(otherHandle),
          migrationsDir: MIGRATIONS_DIR,
        })
      ).toThrow("This backup file doesn't match your school.");

      const dbBytesAfter = fs.readFileSync(dbPathFor(otherHandle));
      expect(dbBytesAfter.equals(dbBytesBefore)).toBe(true);
    } finally {
      otherHandle.close();
    }
  });

  it('rejects a corrupted/truncated archive cleanly instead of throwing an unhandled exception', () => {
    seedSchool(handle, 'SCH-3', 'Fragile Academy');
    const dbBytesBefore = fs.readFileSync(dbPathFor(handle));

    const garbagePath = path.join(archiveDir, 'garbage.eibackup');
    fs.writeFileSync(garbagePath, Buffer.from('not a real backup file at all'));

    expect(() =>
      restoreBackup({
        currentDb: handle.db,
        archivePath: garbagePath,
        passphrase: PASSPHRASE,
        dbPath: dbPathFor(handle),
        keyFilePath: keyFilePathFor(handle),
        migrationsDir: MIGRATIONS_DIR,
      })
    ).toThrow('This backup appears corrupted and cannot be used.');

    // Also try a real archive truncated mid-way through — same clean rejection.
    const outputPath = path.join(archiveDir, 'backup.eibackup');
    createBackup(handle.db, { keyFilePath: keyFilePathFor(handle), outputPath, passphrase: PASSPHRASE });
    const fullArchive = fs.readFileSync(outputPath);
    const truncatedPath = path.join(archiveDir, 'truncated.eibackup');
    fs.writeFileSync(truncatedPath, fullArchive.subarray(0, Math.floor(fullArchive.length / 2)));

    expect(() =>
      restoreBackup({
        currentDb: handle.db,
        archivePath: truncatedPath,
        passphrase: PASSPHRASE,
        dbPath: dbPathFor(handle),
        keyFilePath: keyFilePathFor(handle),
        migrationsDir: MIGRATIONS_DIR,
      })
    ).toThrow(/corrupted/);

    const dbBytesAfter = fs.readFileSync(dbPathFor(handle));
    expect(dbBytesAfter.equals(dbBytesBefore)).toBe(true);
  });

  it('rejects a too-short passphrase at backup time with a friendly error', () => {
    seedSchool(handle, 'SCH-4', 'Short Passphrase Academy');
    const outputPath = path.join(archiveDir, 'backup.eibackup');
    expect(() =>
      createBackup(handle.db, { keyFilePath: keyFilePathFor(handle), outputPath, passphrase: 'short' })
    ).toThrow(FriendlyBackupError);
    expect(fs.existsSync(outputPath)).toBe(false);
  });
});
