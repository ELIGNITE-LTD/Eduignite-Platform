# Higher-education public sites: plan and progress

**Resume rule for any new session:** read this file first, `git fetch origin claude/higher-ed-sites`,
check out that branch, continue at the first unchecked item. Update the checkboxes and the log at the
bottom in the same commit as the work. Never push to `main` directly; work lands via PR.

## Goal
Every higher-education institution in Cameroon (university, institute, grande ecole, IPES) gets a
simple, bilingual (EN/FR) public website, listed in a public directory. Setup must be near-zero effort:
a non-technical admin publishes in under 5 minutes. Site runs on the main site (eduignite.online).

## Decisions (from audit + Cameroon research)
- Keep path URLs `/schools/<slug>` (already live, SEO authority on one domain). Subdomains/custom domains are later.
- Presets + toggles, no page builder. Programmes managed in the Higher dashboard feed the public site.
- WhatsApp click-to-chat is the main CTA. MoMo/Orange Money details are display-only (no payment processing in v1).
- Accreditation (MINESUP) badge shows "verified" only after a platform admin checks the document.
- Public site is website-only. Dashboard manager changes must be mirrored in apps/mobile and apps/desktop.
- Migrations must be additive (see docs/DEPLOY_RUNBOOK.md). Matricule generator is never touched.

## User-approved operating rules (2026-11-15)
- A scheduled task (every 2 hours, trig_01JismqniKmTJhWQuZUVFkE9) starts a fresh session that continues from this file.
- Push only to `claude/higher-ed-sites`. One PR at the end into `main`.
- When all items are done and checks are green, the session MAY merge that PR to `main` (user approved), then smoke test
  and mark DONE here and disable the scheduled task. If anything fails: record under BLOCKED, never force.

## Backlog (in order)
- [x] P1 Backend (tests pass: apps/higher_ed 42 passed): public `GET /schools/public/<slug>/programmes/` and `/departments/` (active only, published schools only) + optional programme description + tests
- [x] P1 (done) map `theme_accent` to `brand_color` so the brand colour applies + test
- [ ] P1 Merge programmes frontend (50cd78b is the base of this branch, already included)
- [x] P2 (done, merged here from claude/he-quick-setup; not browser-tested) Quick setup (3 steps: basics, look with theme presets, content/contact + publish) in front of the 11-tab manager, pre-filled from existing data; mirror to mobile and desktop
- [x] P3 (done, merged here from claude/he-directory; /universities + /universites) Directory `/universities` (or higher view of `/schools`) with filters: region, type, award level, language, search
- [x] P4 (done: claude/he-profile-extras merged here) Accreditation block (level, arrete number, date, document) + admin verification + public badge
- [x] P4 (done; WhatsApp also in quick setup step 1) WhatsApp CTA with prefilled message; MoMo/Orange display block
- [x] P5 (done: hreflang/JSON-LD/sitemap already present + /universities; logo compressed in browser) SEO: programme JSON-LD, hreflang, sitemap entries; page weight and image compression guard
- [x] P6 DONE (PR #196 merged 2026-11-15, deploys green, smoke test ok) Tests, PR, CI green, merge to main, post-deploy smoke test (see Release below)

## Release procedure
Feature branch -> PR -> `backend-checks` green (migrations apply, boot) -> merge -> deploy workflows run ->
smoke test: `/api/v1/health/`, `/schools?level=higher`, one higher school home, `/programmes`, sitemap.xml.

## Log
- 2026-11-15: audit finished; branch `claude/higher-ed-sites` created from 50cd78b.
- 2026-11-15: P1 code written (public programmes/departments endpoints, Programme.description migration 0002, brand_color<-theme_accent, tests in higher_ed/tests/test_public_site.py). NEXT: run pytest once venv exists (deploy-audit agent was building one in the scratchpad), then P2.
- 2026-11-15: user approved auto-resume every 2h, one final PR, merge to main after green checks.
- 2026-11-15: P1 verified: `pytest apps/higher_ed --no-cov` = 42 passed (5 new), `makemigrations --check` clean. NEXT: P2 quick setup.
  Test recipe: venv + `pip install -r backend/requirements/development.txt`; `pg_ctlcluster 16 main start`; createdb eduignite_ci; env
  DJANGO_SECRET_KEY=x DB_NAME=eduignite_ci DB_USER=postgres DB_PASSWORD=ci DB_HOST=localhost DB_SSLMODE=disable; always `--no-cov` on subsets.
  Website: `npm ci`, `npm run test:unit` (17 pass); `tsc --noEmit` baseline is 107 pre-existing errors on main, so compare the count, don't expect 0.
  Deploy facts: merging to main auto-deploys (backend via SSH to VPS with rollback; website with NO health check/rollback). Ship backend before website. Only CI check is 'Migrations & boot' (backend PRs). No website CI.
- 2026-11-15: P2 + P3 merged into this branch. Backend tests: apps/higher_ed + new directory tests pass; makemigrations clean.
  apps/schools/tests.py::SchoolScopedAccountCreationTests::test_teacher_class_master_cannot_create_student_from_core_endpoint
  also FAILS on main (pre-existing). tsc: 91 errors website/mobile/desktop, none in changed files. NEXT: P4 (agent building
  claude/he-profile-extras: WhatsApp, MoMo/Orange, accreditation), add WhatsApp field to the quick-setup wizard step 1, P5 SEO, P6 PR + merge.
  NOTE: scheduled routines cannot push (repo not attached to the routine). Work continues in the interactive session.
- 2026-11-15: P4 + P5 done and merged into this branch. Backend: 753 passed, 1 failed (pre-existing on main: teacher_class_master test).
  makemigrations clean, manage.py check clean. tsc 91 errors in website/mobile/desktop (pre-existing), none in changed files. test:unit 29/29.
  NOT browser-tested. NEXT: P6 open PR into main, 'Migrations & boot' green, merge, smoke test. User approved merging everything once complete.
- 2026-11-15: PROJECT DONE. PR #196 merged to main (630745ce); backend + frontend deploys succeeded; /api/v1/health/ ok; /universities and /universites 200; /schools?level=higher redirects (307); sitemap lists directory. Not browser-tested; no higher-ed school is published in production yet so school sites/programmes pages were not exercised live. Follow-ups: open dashboard as a higher-ed admin and as CEO (/dashboard/outreach); verify Brevo sender; grow the school list.
