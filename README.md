# EduIgnite Platform

The single home for every EduIgnite application. Each app used to live in its
own repository; they now sit side by side here so shared changes land once and
the apps never drift apart.

## Layout

```
Eduignite-Platform/
├── apps/
│   ├── website/     Next.js public site + admin dashboard (deployed to Vercel)
│   ├── mobile/      Capacitor (Android) app — parents, teachers, students
│   └── desktop/     Electron (Windows) app — the administrator's command centre
├── backend/         Django REST API + Celery (the API all three apps talk to)
└── .github/
    └── workflows/   CI: builds & releases the mobile and desktop apps
```

The three front-end apps share the same Next.js dashboard code and talk to the
one `backend/`. The website is deployed continuously by Vercel; the mobile and
desktop apps are built and released by GitHub Actions.

## Working on each app

Each app is self-contained — install and run it from its own folder:

```bash
# Website (public site + dashboard)
cd apps/website && npm install && npm run dev

# Mobile (Capacitor / Android)
cd apps/mobile && npm install && npm run dev

# Desktop (Electron / Windows)
cd apps/desktop && npm install && npm run dev

# Backend (Django API)
cd backend && pip install -r requirements.txt && python manage.py runserver
```

## Releases (CI)

- **Mobile** — `.github/workflows/mobile.yml` builds an Android APK and publishes
  a release tagged `mobile-v1.0.<run>` whenever `apps/mobile/**` changes.
- **Desktop** — `.github/workflows/desktop.yml` builds the Windows installer and
  publishes a release tagged `desktop-v1.0.<run>` whenever `apps/desktop/**`
  changes.

Both workflows only need the automatic `GITHUB_TOKEN` — no extra secrets to add.
Tag prefixes (`mobile-`, `desktop-`) keep each app's releases separate under one
shared run counter.

## Deployment notes

- **Website (Vercel):** point the Vercel project's **Root Directory** to
  `apps/website`.
- **Backend (server):** the Django project now lives at `backend/` (previously
  `studio-main/backend`); update the deploy path accordingly.

## Next step (optional)

The three front-ends still carry their own copy of the shared dashboard code.
A follow-up refactor can extract that into `packages/dashboard-ui` and wire
Turborepo so the shared code is edited once and imported by all three apps.
