# EduIgnite Offline — Desktop App

Offline-first Electron desktop application for schools with poor or no
internet connectivity. All data lives in a local, encrypted SQLite database;
the app has zero network dependency for its core functions (spec section 3 —
School Profile, Students, Teachers, Classes, Subjects, Attendance, Academic
Records, Report Cards, Financial Management).

## Stack

- **Renderer**: React 19 + React Router (HashRouter, since the packaged app
  loads `dist/index.html` from `file://` with no HTTP server) + Tailwind CSS.
- **Main process**: Electron, TypeScript, built by `vite-plugin-electron`.
- **Database**: `better-sqlite3-multiple-ciphers` (SQLCipher-compatible),
  WAL journal mode, foreign keys on.
- **PDF export**: `pdfmake`'s server-side `PdfPrinter`, rendered from the
  main process (report cards, payment receipts).
- **Tests**: Vitest.

## How to run

```sh
npm install
npm run dev
```

`npm run dev` is the **only command you need** — it runs `vite`, and the
`vite-plugin-electron/simple` plugin (see `vite.config.ts`) automatically
builds `electron/main.ts` + `electron/preload.ts`, launches the Electron app
pointed at the Vite dev server, and hot-restarts the main process / hot-reloads
the preload script / HMRs the renderer as you edit. There is no separate
"start Electron" step and no `concurrently`-based script is needed — the
plugin already does that job. (`npm run electron:dev` is kept as an alias to
`vite` for anyone who reaches for that name out of habit.)

Other scripts:

| Script | Purpose |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` across `src/`, `electron/`, `tests/` |
| `npm test` / `npx vitest run` | Runs the Vitest suite once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run build` | Typechecks, then builds the renderer (`dist/`) and the main/preload bundles (`dist-electron/`) — this is what CI/you should run to confirm the app actually compiles |
| `npm run dist:win` | Full NSIS installer via `electron-builder` (slow, downloads extra tooling — not needed for day-to-day development or for CI verification) |

On first install, if `better-sqlite3-multiple-ciphers` falls back to
compiling from source (no prebuilt binary for your exact Node ABI/OS/arch),
the install will fail without Visual Studio Build Tools on Windows. If that
happens, bump the dependency to the latest `12.x`/`13.x` release, which ships
prebuilt binaries for newer Node versions — this is exactly what happened
during this build (Node 24 needed a `node-v137` prebuild that only exists from
`12.11.1` onward; `package.json` is already pinned to `^12.11.1`).

## Where things live

```
src/
  db/            connection.ts (opens + migrates the encrypted DB), encryption.ts,
                 migrate.ts (versioned .sql migration runner), migrations/*.sql
  domain/        pure business logic — attendance rates, grading/averaging,
                 promotion decisions, fee balances. No DB or Electron imports;
                 this is what tests/*.test.ts exercises directly.
  repositories/  thin data-access modules over better-sqlite3 prepared
                 statements, one per functional module (students, teachers,
                 classes, subjects, attendance, academics, report cards,
                 finance) plus licenseStateRepository (KV) and
                 syncQueueRepository (enqueue + markSynced).
  licensing/     crypto.ts (ECDSA verify/sign), fingerprint.ts (deviceId),
                 challenge.ts (QR challenge generation), gate.ts
                 (checkLicenseGate/installCertificate), types.ts,
                 public-key.pem (checked in, public half only).
  sync/          syncClient.ts — chunked/resumable upload of sync_queue.
  pdf/           pdfmake document definitions + the shared server-side
                 PdfPrinter wrapper (report cards, receipts).
  ipc/handlers.ts  registers every ipcMain.handle channel, wiring repositories
                 + domain + pdf together. One function, called once from
                 electron/main.ts with the open DB handle.
  shared/        types.ts (DB row shapes, mirrors the SQL schema and the
                 cloud's Django field names), api.ts (the `window.api`
                 contract — keep in sync with ipc/handlers.ts and
                 electron/preload.ts), ids.ts.
  context/       SchoolProvider — loads the single school profile row once.
  components/    Layout.tsx (sidebar navigation + <Outlet/>).
  pages/         one screen per functional module (spec section 3).
electron/
  main.ts        creates the BrowserWindow, opens the DB on app ready,
                 registers IPC handlers, loads the dev server URL or the
                 built dist/index.html.
  preload.ts     contextBridge → window.api, one method per IPC channel.
                 contextIsolation stays on, nodeIntegration stays off,
                 matching the apps/desktop electron shell convention.
tests/
  testDb.ts      test helper — opens a real (encrypted, migrated) DB in a
                 throwaway temp directory via the same openDatabase() the
                 app uses.
  *.test.ts      domain-logic unit tests, migration-runner idempotency, and
                 one end-to-end-ish test that seeds a school/class/students/
                 marks through the repositories and asserts the DB state
                 after compiling report cards + promoting a class.
```

## Encryption approach (Wave 1 scope)

The local database is opened through `better-sqlite3-multiple-ciphers`
(`src/db/connection.ts`), which sets `PRAGMA key = x'<hex>'` before any other
statement — the file on disk is genuinely encrypted, not just access-controlled.
The key itself (`src/db/encryption.ts`) is a random 256-bit value generated on
first run and stored hex-encoded in a sibling `.key` file with best-effort
restrictive permissions (`chmod 600`; a no-op on Windows, which has no POSIX
mode bits — NTFS ACLs are not touched in this wave).

This protects the database file from casual copy-and-open on another machine,
but the key is **not yet bound to device hardware** — a stolen `.key` +
`.sqlite` pair can still be decrypted elsewhere. That binding is explicitly
deferred to the Licensing & Security agent (see the `TODO(licensing agent)`
block in `encryption.ts`): once hardware fingerprinting exists, the key should
be derived from it (e.g. HKDF over the Device ID + a per-install salt) and
existing databases re-keyed via `PRAGMA rekey`, without changing
`getOrCreateDatabaseKeyHex`'s call signature.

Crash resiliency (spec sections 4 and 9) is handled independently of
encryption: WAL journal mode + `synchronous = FULL` + foreign keys on, so a
sudden power loss rolls back incomplete transactions on next open instead of
corrupting the file. This is exercised by `tests/migrate.test.ts`.

## Known simplifications / documented assumptions

- **Grading model**: the spec asks for "automated calculation of averages,
  totals, grade ranges, and promotional eligibility" but does not prescribe an
  exact formula. `src/domain/grading.ts` documents the assumption used: every
  score normalized to /20, a subject's average is the equal-weighted mean of
  its CAT average and exam score, and the term average is the coefficient-
  weighted mean across every subject that has at least one mark.
- **Promotion candidate score**: `studentRepository.promoteClassStream` uses
  each student's `students.annual_average` column, which is populated as a
  side effect of `reportCardRepository.compileReportCard` (it is really "most
  recently compiled term average," not a true year-long average across
  multiple terms — there is no multi-term rollup yet). A student with no
  compiled report card at all (`annual_average IS NULL`) is conservatively
  held back rather than promoted.
- **Fee balance matching**: `financeRepository.getStudentBalance` matches a
  student's charges (`fee_templates` for their class + term/year) against
  their payments. A payment not linked to a specific `fee_template_id` (a
  lump-sum payment) is treated as applying to every term/year balance query
  for that student, since `payments` does not carry its own term/academic_year
  column. A template-linked payment only offsets that template's own charge.
- **PDF fonts**: report cards and receipts render with pdfkit's built-in
  standard-14 fonts (Helvetica family) rather than bundling custom TTFs — no
  extra installer weight, no font licensing to track, renders correctly in
  every PDF viewer.

## Licensing, QR activation & sync (implemented)

Wave 2 fills in every seam point Wave 1 left in `src/licensing/gate.ts`,
`src/repositories/licenseStateRepository.ts` and `src/repositories/syncQueueRepository.ts`,
per the wave-2 wire contract and spec sections 5, 6, 7, 9:

- **`src/licensing/crypto.ts`** — ECDSA P-256/SHA-256 signature sign/verify
  over canonical JSON (sorted keys, no whitespace), using only Node's built-in
  `crypto`. The embedded public key lives at `src/licensing/public-key.pem`
  (checked in — it's public). The matching **dev-only** private key is at the
  repo root, `DEV-PRIVATE-KEY-DO-NOT-SHIP.pem` (gitignored, loud header
  comment inside) — see that file for how a backend test suite should use it
  to sign certificates this app's verifier can check.
- **`src/licensing/fingerprint.ts`** — `deviceId` = SHA-256(platform + arch +
  first CPU model + a persisted install UUID), formatted `HW-XXXX-XXXX`. The
  UUID and first-run install date are persisted both in `license_state` (the
  primary, encrypted-DB copy) and in a best-effort secondary marker outside
  the Electron userData folder (`os.tmpdir()/.eduignite-offline/`), so a
  plain uninstall/reinstall doesn't reset the free-trial clock or mint a new
  device identity. This is explicitly best-effort, not unbreakable — a local
  admin who knows to wipe both locations can still reset it.
- **Clock-tamper detection** — a monotonic `max_seen_timestamp` in
  `license_state`, advanced (never rewound) on every `checkLicenseGate()`
  call; a real clock more than ~5 minutes behind it forces read-only.
- **First-year-free entitlement** — stamped once on a genuine first run
  (`install_date`, `plan: first_year_free`, `expiresAt` = +365 days).
- **`checkLicenseGate(db)`** (`src/licensing/gate.ts`) — the real
  implementation: clock-tamper check, then verifies any installed signed
  certificate (signature + schoolId + deviceId) or falls back to the free
  entitlement, then resolves `active` / `grace` (7 days, writable but
  warned) / `expired` (read-only). Every write-path IPC channel in
  `src/ipc/handlers.ts` is registered through a `registerWrite` wrapper that
  re-checks this gate and rejects with a `read-only: …` error when blocked;
  every read/list/report/PDF-export channel stays ungated.
  `window.api.licensing.getStatus()` exposes it to the renderer, and
  `LicenseStatusBanner` (shown in `Layout`) polls it every 60s, warning at
  90/30/7 days per spec section 10.
- **QR activation** — `src/licensing/challenge.ts` builds the 5-minute
  challenge JSON; `src/pages/Licensing.tsx` renders it as a QR (`qrcode`),
  scans a response via webcam (`jsQR` + `getUserMedia`), and offers a
  paste-code textarea fallback for the same JSON — the path exercised by
  this build's automated tests, since there's no real camera in CI/sandbox.
  `purpose: "device_replacement"` is supported from the same page (asks for
  the previous device's id).
- **Sync client** — `src/sync/syncClient.ts` drains `sync_queue` in
  configurable-size chunks (default 50), computes a sha256 checksum per
  chunk, POSTs to the `offline-sync` endpoints, and only calls
  `syncQueueRepository.markSynced` after a chunk is acknowledged. Any
  network failure stops the run immediately without touching local data;
  the next `runSync()` call (or the same call's own limited per-chunk
  retries) resumes from exactly where it left off, using both the
  server's `GET .../status/` and the queue's own `synced_at` flags as
  belt-and-suspenders resume state.

See `tests/licensing.crypto.test.ts`, `tests/licensing.fingerprint.test.ts`,
`tests/licensing.gate.test.ts` and `tests/sync.syncClient.test.ts` for the
new automated coverage (35 tests on top of Wave 1's 46).

### Known simplification: packaged-build resource paths

`electron/main.ts` resolves the migrations directory and the public key PEM
via `process.resourcesPath` in a packaged (non-dev) build; `electron-builder.yml`
now has an `extraResources` block copying both `src/db/migrations` and
`src/licensing/public-key.pem` into the app's `resources/` folder so this
actually works once packaged (`npm run dist:win`) — this was silently missing
for migrations even in the Wave 1 build. Not exercised by `npm run build`
(which only runs `vite build`, not `electron-builder`), so it's worth a
manual smoke test of a real packaged installer before shipping.

### Not implemented

Migration/export to the Full EduIgnite cloud platform (spec section 8) is
still out of scope — it belongs to the Sync & Migration agent's other half
and is not part of this wave's licensing/QR/sync task.
