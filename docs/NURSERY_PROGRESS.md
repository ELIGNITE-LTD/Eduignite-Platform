# Nursery and primary as separate kinds of school: plan and progress

Requested: nursery and primary are NOT the same. Separate onboarding option for each, and nursery gets its own very simple account.

## Design (decided)
- Keep `education_category='basic'`; the kind is `SchoolSettings.sections`: `['nursery']` nursery school, `['primary']` primary school, `[]`/both = legacy "Nursery & Primary" (must keep working).
- Create API: `education_category:'basic'` plus new `basic_section: 'nursery'|'primary'`; read-only `school_kind` on school payloads.
- Class levels seeded by kind (nursery school: only nursery levels).
- Frontend derives the kind from `useBasicSections`; nursery menu is the simple set; primary hides nursery ratings.
- Authorised pick-up (who may collect each child) is the top daily nursery need.
- Research basis: 5 official learning domains, no marks/averages/rank, observation-based progress, daily attendance, pick-up, health/allergies, parent messages, fees.

## Branches (all pushed; WIP, NOT tested end to end; each branched from main e67c14c)
- `claude/nursery-backend`  (7 files)  backend kind + level seeding + tests
- `claude/nursery-frontend` (27 files) onboarding 4 cards, nursery menu, settings lock, mobile/desktop mirrors
- `claude/nursery-pickup`   (5 files)  AuthorizedPickup model/API + page (was mid-way through tests)
The three agents stopped because the plan usage limit was reached (resets 04:30 UTC 2026-11-16). Resume by checking out each branch,
finishing what is missing (run each branch's tests), then merge the three into one branch, run backend tests + `tsc` (baseline 91 errors)
+ `npm run test:unit`, verify in a browser (local backend + website, Playwright), open ONE PR and merge (user authorised merging).

## Log
- 2026-11-16: research + audit done; three agents started; usage limit hit; WIP saved to the three branches above.
