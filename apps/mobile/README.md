# EduIgnite Mobile

The EduIgnite mobile application for **all account types** (school admin,
sub-admin, teacher, student, parent, bursar, librarian). It is the **exact web
frontend** (Next.js, Tailwind, same components/design/colours) packaged as a
native iOS/Android app with **Capacitor**, talking to the same
`api.eduignite.online` backend as the web and desktop apps. The Community Portal
is excluded.

## How it works

- The UI is the unmodified web frontend (`src/`), exported to a static SPA
  (`next build` → `out/`).
- **Capacitor** wraps `out/` in a native WebView shell and builds real
  `.apk` / `.ipa` apps.
- `CapacitorHttp` routes all API calls through the native HTTP stack, so the
  WebView reaches the backend without CORS limits on either platform.
- **Offline-first** (WhatsApp-style): GET responses are cached to IndexedDB and
  served offline; writes are queued in a durable outbox and replayed on
  reconnect; the signed-in account stays available offline (see
  `src/lib/offline.ts` and `src/lib/api/client.ts`).

## Build

CI (`.github/workflows/build.yml`) builds the Android APK on every push to
`main` and publishes it to GitHub Releases. Locally:

```bash
npm install
npm run build          # next build -> out/
npx cap add android    # first time only
npx cap sync android
cd android && ./gradlew assembleDebug
```

## Backend

Configured via `.env.production` (`NEXT_PUBLIC_API_URL`) — the shared production
backend, so web, desktop and mobile always show the same data.
