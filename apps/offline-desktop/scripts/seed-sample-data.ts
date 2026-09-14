/**
 * CLI wrapper around src/setup/sampleDataService.ts for a developer/support
 * technician poking directly at a raw database file outside the running app
 * (the same logic also backs the in-app "Seed sample data" button on
 * SchoolHomePage — see the `sampleData:*` IPC channels in src/ipc/handlers.ts).
 *
 * Usage (via the `tsx` dev dependency, so relative imports resolve exactly
 * like they do everywhere else in this project — Node's own native `.ts`
 * support needs an explicit extension on every relative import in the whole
 * dependency chain to do this, which isn't worth changing across every
 * repository file just for one script):
 *
 *   npm run seed:sample -- --db <path-to-eduignite-offline.sqlite> --key <path-to-.key file>
 *   npm run seed:sample -- --db <path> --key <path> --clear
 *
 * This project's better-sqlite3-multiple-ciphers build targets Node's own
 * ABI (not Electron's), since installs run under plain `npm install` — so
 * running under `tsx` (plain Node underneath) opens the real database file
 * exactly like the packaged app does, just outside the Electron shell.
 *
 * Find your real paths: this app stores its database at
 * `<Electron userData>/data/eduignite-offline.sqlite` (and the sibling
 * `.key` file next to it) — see electron/main.ts's `userDataPaths()`. On a
 * normal Windows dev machine that's typically
 * `%APPDATA%\eduignite-offline-desktop\data\`.
 */
import path from 'node:path';
import { openDatabase } from '../src/db/connection';
import { clearSampleData, seedSampleData } from '../src/setup/sampleDataService';

function parseArgs(argv: string[]): { dbPath: string; keyFilePath: string; clear: boolean } {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const dbPath = get('--db');
  const keyFilePath = get('--key');
  const clear = argv.includes('--clear');
  if (!dbPath || !keyFilePath) {
    console.error(
      'Usage: npm run seed:sample -- --db <path to eduignite-offline.sqlite> --key <path to .key file> [--clear]'
    );
    process.exit(1);
  }
  return { dbPath, keyFilePath, clear };
}

async function main(): Promise<void> {
  const { dbPath, keyFilePath, clear: shouldClear } = parseArgs(process.argv.slice(2));
  const migrationsDir = path.join(__dirname, '..', 'src', 'db', 'migrations');
  const db = openDatabase({ dbPath, keyFilePath, migrationsDir });
  try {
    if (shouldClear) {
      clearSampleData(db);
      console.log('Sample data removed.');
    } else {
      const summary = await seedSampleData(db);
      console.log(`Sample data created: ${summary.studentsCreated} students in "${summary.className}".`);
      console.log(`Teacher login: ${summary.teacherLoginUsername} / ${summary.teacherLoginPassword} (role TEACHER).`);
      console.log('To remove all of this again: npm run seed:sample -- --db <path> --key <path> --clear');
    }
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error((err as Error).message);
  process.exitCode = 1;
});
