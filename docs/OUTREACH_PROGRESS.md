# Founder Outreach tab: plan and progress

**Resume rule for any new session:** read this file, check out branch `claude/outreach-tab`, continue at the first
unchecked item, update the checkboxes and Log in the same commit. Never push to `main` directly; one PR at the end.
This is a SEPARATE track from `docs/HIGHER_ED_SITES_PROGRESS.md` (branch `claude/higher-ed-sites`).

## Goal (user request)
A new **Outreach** tab in the CEO/CTO dashboard. It holds every school in Cameroon (all levels) we want to contact,
classified by region and level. A founder selects schools, pastes a message, presses Send, and each school receives
it from "EduIgnite Team" with Reply-To `info@eduignite.online`. Schools already emailed are kept separate from the
ones not yet contacted. Very simple, well styled. Primarily founders only; founders may assign the tab to any
executive (existing "Activity Access" list, module key `outreach`), who then work from their own account.

## Decisions
- Module key `outreach` (CEO/CTO always; others only when assigned). Synced in backend + 3 TS copies (tests enforce).
- Sends through the existing Brevo integration (`core/email_service.py`, new `EmailEvent.OUTREACH`), sender
  `info@eduignite.online` (env `OUTREACH_FROM_EMAIL`), one-click unsubscribe (List-Unsubscribe header + public page).
- **Paced**: queue any number; `OUTREACH_DAILY_CAP` (default 25/day) sent by an hourly job, so a new sender is not
  flagged as spam. Cancel button stops the queue. Opt-outs and bounces are never mailed. Already-contacted need an explicit "resend".
- Contacts are institutional public addresses only, each with a `source_url`. Data is NOT committed to the repo;
  it is imported through the tab (CSV import) and lives in the database.
- Brevo needs `info@eduignite.online` verified as a sender (user task). Until then the provider rejects and sends show Failed.

## Backlog
- [x] B1 Backend app `apps/outreach` (models, import, queue, pacing, unsubscribe, summary) + tests (311 pass incl. executive tests)
- [ ] B2 Dashboard tab `/dashboard/outreach` in apps/website: summary by region, filters, select schools, message box with
      {school_name} placeholders, test email to self, send, queue/cancel, contacted vs not contacted, add/edit/import CSV
- [ ] B3 Sidebar entry (founders + assigned executives) and mirror to apps/mobile + apps/desktop
- [ ] B4 Research: build the school list (all regions, all levels) from public sources -> CSV with source_url; deliver to user
- [ ] B5 PR, 'Migrations & boot' green, merge, smoke test, tell user to verify the Brevo sender

## Log
- 2026-11-15: B1 done on branch claude/outreach-tab (from main 2eb46aa).
