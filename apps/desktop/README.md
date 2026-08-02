# EduIgnite Desktop

The EduIgnite desktop application for all account types (school admin, sub-admin,
teacher, student, parent, bursar, librarian). It is the **exact web frontend**
(Next.js) running inside a native Electron window, talking to the same
`api.eduignite.online` backend as the web and mobile apps. The Community Portal
is intentionally excluded.

## How it works

- The UI is the unmodified web frontend (`src/`, Next.js App Router, Tailwind),
  so design, colours and behaviour are identical to the web application.
- `next build` (with `output: 'standalone'`) produces a self-contained server.
- Electron (`electron/main.js`) launches that server on a local port and loads
  it in a `BrowserWindow`.

## Develop

```bash
npm install
npm run dev          # Next dev server on http://localhost:9002
```

## Build the installer

```bash
npm run app:build    # next build + copy static assets into the standalone bundle
npm run dist:win     # electron-builder -> release/EduIgnite-Setup-<version>.exe
```

CI (`.github/workflows/build.yml`) builds the Windows installer on every push to
`main` and publishes it to GitHub Releases.

## Backend

Configured via `.env.production` (`NEXT_PUBLIC_API_URL`). Points at the shared
production backend so web, mobile and desktop always show the same data.
