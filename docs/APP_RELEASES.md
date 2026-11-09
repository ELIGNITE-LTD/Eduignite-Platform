# App releases: mobile (Android) and desktop (Windows)

How a build of the mobile and desktop apps reaches users, how the website offers it,
and how to pull a bad one.

## What exists

| Piece | Where |
| --- | --- |
| Build workflows | `.github/workflows/mobile.yml`, `.github/workflows/desktop.yml` (push to `main` touching the app, `release/**` or `scripts/release/**`; or manual) |
| Withdraw a bad build | `.github/workflows/app-release-admin.yml` (manual) |
| Version base (major.minor) | `release/version.json` |
| Release scripts + tests | `scripts/release/` (`node --test scripts/release/test/release.test.mjs`) |
| Download host | VPS directory `/opt/eduignite/downloads`, served by the host Caddy at `https://eduignite.online/downloads/` (this is what the workflows already used; the `infra/aws/` Caddyfile/S3 path in the repo is the older AWS design and is not what publishes) |
| Website pages | `/download`, `/download/mobile`, `/download/desktop` (`apps/website/src/lib/releases.ts`, `components/public/app-download-page.tsx`) |
| In-app update notice | already shipped: mobile `components/layout/android-update-dialog.tsx` (download + install), desktop `electron/autoUpdate.js` + `electron-update-dialog.tsx`; both read the platform `app-versions` endpoint |
| Build stamp in the app | `public/build-info.json` (written by CI), shown at the bottom of Settings (`build-info-line.tsx`) |

## Versioning (single source of truth)

`version = <major>.<minor>.<CI run number>` where major/minor come from `release/version.json`
and the run number is the build workflow's `github.run_number`. Example: `1.0.57`.
The Android `versionCode` is `major*10_000_000 + minor*100_000 + run` (e.g. `10000057`), so it only ever grows;
the workflow patches it and `versionName` into the generated `build.gradle` (Capacitor otherwise ships
versionCode 1 forever). The same version goes to `NEXT_PUBLIC_APP_VERSION` (in-app update comparison),
the desktop `package.json` (electron-builder / `latest.yml`), the GitHub Release tag and `build-info.json`.
For a feature release bump `minor` in `release/version.json`; run numbers continue to grow (limit 99,999 per workflow).

## What a release does (after tests, build and signing all succeeded)

1. `scripts/release/publish.sh <mobile|desktop> <file>` computes release notes (merged PR titles since the last published build,
   path-filtered to that app), SHA-256 and size, and merges a new entry into `releases-<app>.json`, keeping the newest 3 builds.
2. The file is uploaded to `/opt/eduignite/downloads/.incoming/*.part`, its SHA-256 is re-checked on the server, then it is
   `mv`-renamed to `<app>/<name>` (atomic). A `.sha256` file is stored beside it.
3. The stable alias is replaced atomically (hard link then rename): `eduignite-mobile.apk` and `eduignite-desktop-setup.exe`
   keep working exactly as before.
4. Desktop only: `updates/desktop/latest.yml` (electron-updater feed) and the installer are refreshed; a per-version copy
   `desktop/latest-<version>.yml` is kept for rollbacks.
5. The manifest is written last (also temp then rename), so the site never advertises a file that is not there yet.
6. Builds older than the newest 3 are deleted. The backend `app-versions` record is updated (non-fatal) with the version and release notes.

Layout on the VPS:
```
/opt/eduignite/downloads/
  releases-mobile.json  releases-desktop.json     manifests (public)
  eduignite-mobile.apk  eduignite-desktop-setup.exe   latest aliases
  mobile/eduignite-mobile-1.0.57.apk(.sha256)
  desktop/EduIgnite-Setup-1.0.57.exe(.sha256)  desktop/latest-1.0.57.yml
  updates/desktop/latest.yml + installer          electron-updater feed
```
One manifest per app (not one shared `releases.json`) so the mobile and desktop workflows can never overwrite each other's file.
Manifest shape: `{ schema, app, updated_at, latest, releases: [{ version, version_code, platform, file, url, size_bytes, sha256, built_at, git_sha, min_os, notes[], withdrawn? }] }`.

## Website

The download pages read `https://eduignite.online/downloads/releases-<app>.json` at ISR time (5 min). They show version, date,
size, SHA-256, What's new, install notes (Android "allow installs", Windows SmartScreen note, iPhone/iPad use the web app via
Add to Home Screen), older versions, and SoftwareApplication JSON-LD (only when a real release exists). If the manifest is missing or
malformed they fall back to the platform `app-versions` record, then to the static entry with a "Latest build coming soon" notice. Pages never throw.
The `EduIgnite Offline` entry stays `withheld: true` and shows "Coming soon", unchanged.

## Signing (read this)

- **Android**: the APK is signed with the release keystore taken from repo secrets (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
  `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`). If they are missing the build fails and nothing is published. No keystore is in the repo.
- **Windows**: the installer is **NOT code-signed** (no certificate is configured in `electron-builder.yml`). Users see a SmartScreen warning;
  the download page says so. Buy/configure a certificate to remove it.

## Rolling back / withdrawing a bad build

Actions > "App release admin" > Run workflow: pick the app and the bad version. It marks that version withdrawn in the manifest (the site
stops offering it), repoints the stable alias (and desktop update feed) to the newest remaining good build, and updates the backend record.
Already-updated desktop clients are not downgraded (electron-updater never downgrades): ship a fixed build (a new run number) to roll forward.
To undo a withdrawal, edit the manifest on the VPS (remove `"withdrawn": true`) or re-run a build.

## Test locally

```
node --test scripts/release/test/release.test.mjs
node scripts/release/derive-version.mjs --run 57
bash -n scripts/release/publish.sh scripts/release/withdraw.sh
```
Not testable without the real environment: GitHub Actions runs, Android/Windows signing, and the upload to the VPS.

## One-time owner checklist

1. On the VPS: `mkdir -p /opt/eduignite/downloads/.incoming` (the scripts create the rest) and confirm the user in `VPS_USER` owns the directory.
2. Confirm host Caddy serves `/opt/eduignite/downloads` at `/downloads/*` with `Content-Type: application/json` for `.json` (it already does for the APK/EXE). Caddy follows hard links; no symlinks are used.
3. GitHub: variables `VPS_HOST`, `VPS_USER`; secrets `VPS_SSH_KEY`, `CI_VERSION_UPDATE_TOKEN`, and the four `ANDROID_KEYSTORE_*` / `ANDROID_KEY_*` secrets. (All already used by the existing workflows.)
4. Optional: `NEXT_PUBLIC_DOWNLOADS_URL` for the website build if downloads are ever served from another host (default `https://eduignite.online/downloads`). The website only links to `eduignite.online` hosts.
5. The first run after merge replaces the hand-uploaded alias files; the previous APK/EXE is not kept as a versioned build (only builds from this pipeline are).

## When the builds run (free-plan Actions minutes)

The Android and Windows builds are the heaviest jobs (Windows minutes count
double), so they no longer run on every merge:

- **Weekly**, Mondays 02:00 UTC, and only if `apps/<app>`, `release/` or
  `scripts/release/` changed since the build that is currently published (a
  20-second `check` job compares with `git_sha` in `releases-<app>.json`).
- **On demand**: Actions > "Build mobile app" / "Build desktop app" > Run
  workflow. A manual run always builds.
- Each build job has a 40-minute timeout so a stuck run cannot burn the month.
- The backend migration check runs on pull requests only (not again on every
  push to main); deploys still run `migrate --plan` and abort safely.
