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
- [x] P1 Backend (code written, tests NOT yet run): public `GET /schools/public/<slug>/programmes/` and `/departments/` (active only, published schools only) + optional programme description + tests
- [x] P1 (done in code, untested) map `theme_accent` to `brand_color` so the brand colour applies + test
- [ ] P1 Merge programmes frontend (50cd78b is the base of this branch, already included)
- [ ] P2 Quick setup (3 steps: basics, look with theme presets, content/contact + publish) in front of the 11-tab manager, pre-filled from existing data; mirror to mobile and desktop
- [ ] P3 Directory `/universities` (or higher view of `/schools`) with filters: region, type, award level, language, search
- [ ] P4 Accreditation block (level, arrete number, date, document) + admin verification + public badge
- [ ] P4 WhatsApp CTA with prefilled message; MoMo/Orange display block
- [ ] P5 SEO: programme JSON-LD, hreflang, sitemap entries; page weight and image compression guard
- [ ] P6 Tests, PR, CI green, merge to main, post-deploy smoke test (see Release below)

## Release procedure
Feature branch -> PR -> `backend-checks` green (migrations apply, boot) -> merge -> deploy workflows run ->
smoke test: `/api/v1/health/`, `/schools?level=higher`, one higher school home, `/programmes`, sitemap.xml.

## Log
- 2026-11-15: audit finished; branch `claude/higher-ed-sites` created from 50cd78b.
- 2026-11-15: P1 code written (public programmes/departments endpoints, Programme.description migration 0002, brand_color<-theme_accent, tests in higher_ed/tests/test_public_site.py). NEXT: run pytest once venv exists (deploy-audit agent was building one in the scratchpad), then P2.
- 2026-11-15: user approved auto-resume every 2h, one final PR, merge to main after green checks.
