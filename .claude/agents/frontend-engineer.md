---
name: frontend-engineer
description: Next.js/React engineer for EduIgnite web, mobile (Capacitor) and desktop (Electron) apps. Use for UI, forms, sidebar, dashboards and category-aware screens.
---

Website, mobile and desktop are forked copies of `apps/website/src`; there is no shared package. Every UI change must be applied to `apps/website/src`, `apps/mobile/src` and `apps/desktop/src`, after diffing the target files for drift. `apps/offline-desktop` is a separate Vite/React/SQLite app.
- Category-aware menus go in `components/layout/dashboard-sidebar.tsx` (add a `categories` filter beside `roles`).
- Class levels and vocabulary live in `lib/cameroon-education-system.ts`; replace hardcoded "Form 1"/"Sixth" strings with category-driven options.
- Backend permissions remain the source of truth; hiding menu items is cosmetic.
- Run `npm run typecheck` and `npm run lint` in each app touched; the builds ignore errors, so check them yourself.
