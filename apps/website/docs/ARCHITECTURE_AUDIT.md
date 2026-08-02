# EduIgnite Architecture Audit

**Author:** Manus AI  
**Date:** 2026-05-22  
**Repository Area:** `studio-main` full-stack application

## Audit Summary

EduIgnite is organized as a full-stack education platform with a Django REST backend and a Next.js dashboard frontend. The backend follows a modular `apps/*` architecture, while the frontend follows a dashboard-oriented route structure under `src/app/dashboard`. The architecture is suitable for incremental enterprise feature delivery because each feature domain can own its models, serializers, permissions, URL router, admin configuration, and tests.

The new notification and app-store modules were implemented using this existing modular style. They are mounted through the root API router, exposed through typed frontend service wrappers, and represented in the dashboard sidebar. Relationship hardening was applied conservatively to preserve existing data-shape compatibility while adding database constraints and indexes where they improve correctness and performance.

| Layer | Existing Pattern | Implementation Alignment |
|---|---|---|
| Backend settings | Modular Django apps registered in `config/settings/base.py`. | Added `apps.notifications`, `apps.app_store`, and `apps.relationships`. |
| API routing | Feature routers mounted under `/api/v1/` in `config/urls.py`. | Mounted `/notifications/`, `/app-store/`, and `/relationships/`. |
| ASGI routing | WebSocket support already exists for chat. | Added notification WebSocket route without replacing chat routing. |
| Permissions | Role-aware permission classes appear across feature apps. | Added executive and scoped-school role permissions for notification and app-store management. |
| Frontend data access | Endpoint constants and service wrappers are used for dashboard features. | Added endpoint constants and service wrappers for notification and app-store APIs. |
| Dashboard navigation | Sidebar menu entries are role filtered. | Added Notifications and App Store entries using the same role-filtered pattern. |

## Backend Architecture

The backend is a Django project rooted at `backend/config` with feature modules under `backend/apps`. Existing domains include users, schools, students, grades, assignments, attendance, fees, library, announcements, chat, community, support, AI, and related school operations. This provides a strong base for education-specific workflows because most data domains are already isolated into feature apps.

The notification app is deliberately independent from any single academic workflow. It can be called from signals, Celery tasks, viewsets, or future business services. The app-store module is similarly isolated because marketplace records should be lifecycle-managed independently from school tenant data.

| Backend App | Responsibility | Relationship to New Work |
|---|---|---|
| `apps.users` | Custom user model, roles, school association, and profile identity. | Used as the recipient and manager identity base for notifications and app-store permissions. |
| `apps.schools` | School hierarchy, classes, departments, campuses, and school settings. | Used for school-scoped notification targeting and relationship summaries. |
| `apps.students` | Student records and parent-student links. | Hardened with primary-parent constraint and relationship indexes. |
| `apps.assignments` | Assignment lifecycle and student submissions. | Safe notification hooks can use notification task helpers for assignment events. |
| `apps.notifications` | Durable notifications, device registrations, API, WebSocket, signals, and tasks. | New feature app. |
| `apps.app_store` | Official EduIgnite application marketplace records and manager APIs. | New feature app. |
| `apps.relationships` | Read-only relationship summary endpoint backed by existing relationship helpers. | New API wrapper over existing related-user logic. |

## Frontend Architecture

The frontend uses Next.js application routes and shared service wrappers for authenticated API calls. Dashboard pages rely on UI primitives, cards, badges, buttons, inputs, and toast notifications. The new feature screens follow these conventions rather than introducing a separate state-management approach.

The notification screen implements a user-facing inbox and leadership broadcast form in the same page. This keeps the initial enterprise feature discoverable while preserving permission gates in the backend. The app-store screen implements a browse-first marketplace and exposes management controls only to executive roles in the UI.

| Frontend File | Purpose |
|---|---|
| `src/app/dashboard/notifications/page.tsx` | Notification inbox, unread count, filters, mark-read controls, and managed broadcast form. |
| `src/app/dashboard/app-store/page.tsx` | Marketplace browse interface, category filters, search, download links, and executive management controls. |
| `src/lib/api/services/notifications.service.ts` | Typed wrapper for notification list, create, mark-read, mark-all-read, unread-count, and device endpoints. |
| `src/lib/api/services/app-store.service.ts` | Typed wrapper for app-store list, create, update, feature, unfeature, and archive endpoints. |
| `src/components/layout/dashboard-sidebar.tsx` | Navigation entries for Notifications and App Store. |

## Relationship Architecture

EduIgnite's education relationships are centered on users, schools, classes, subjects, students, and parent links. The existing codebase also contains compatibility fields in several areas, meaning some models keep both foreign keys and denormalized text or legacy identifiers. The new relationship hardening respects that pattern and avoids destructive changes.

The core production improvement is the guarantee that a student has at most one primary parent link. This type of invariant belongs in the database because it protects all callers equally: admin forms, API endpoints, imports, background tasks, and future integrations.

| Entity | Key Relationships |
|---|---|
| User | Belongs to a role and can belong to a school. Serves as parent, teacher, administrator, executive, and notification recipient. |
| School | Owns students, classes, staff, and school-scoped workflows. |
| Student | Belongs to a school and optionally a school class; can be linked to multiple parent users. |
| ParentStudentLink | Connects parent users to students and now enforces one primary parent per student. |
| SchoolClass | Provides the class/group structure for students, subjects, teachers, attendance, grades, and assignments. |
| Notification | Targets one recipient user and can optionally carry object metadata for related academic events. |
| AppStoreItem | Represents official EduIgnite software releases across mobile and desktop platforms. |

## Security and Access-Control Observations

The implementation keeps sensitive management operations behind role-aware backend permission classes. The frontend role checks are treated as a user-experience improvement only; the backend remains the authoritative enforcement layer. Public marketplace browsing can safely expose only active, non-archived app records, while app creation and curation require executive platform roles.

Notifications are user-scoped by default. Normal users can only list and mark their own notifications. Leadership creation is restricted to configured roles, and school-level leadership is scoped to users in the same school when resolving role targets.

## Deployment Considerations

The new features are compatible with PostgreSQL and the existing EC2/RDS production posture. Because WebSocket notifications are now present, the production reverse proxy should preserve `Upgrade` and `Connection` headers for the ASGI application if real-time browser updates are required. If the production process remains Gunicorn WSGI-only, the REST notification center still works, but live WebSocket updates require an ASGI worker/process.

| Deployment Concern | Recommendation |
|---|---|
| Database | Apply migrations against PostgreSQL RDS during deployment. |
| Static frontend | Rebuild the Next.js application after pulling the branch. |
| WebSocket support | Run ASGI-compatible service and configure Nginx upgrade proxying for notification sockets. |
| Media files | Ensure app-store icon and thumbnail media are served from the configured media storage backend. |
| Background jobs | Run Celery workers if asynchronous notification delivery or email/push fanout is enabled. |

## Audit Conclusion

The repository architecture supports the requested feature set without requiring a disruptive rewrite. The implemented changes follow existing modular conventions, add database-level relationship safeguards, and expose the new features through both backend APIs and dashboard interfaces. The main future enhancement opportunity is to add richer event hooks across assignment, fee, attendance, announcement, and support workflows so every important academic action automatically emits a durable notification.
