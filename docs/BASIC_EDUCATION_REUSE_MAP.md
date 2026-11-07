# Basic Education integration: audit and reuse map

Source: Basic Education Integration Directive. Audit date 2026-11-07, branch `feat/basic-education`.
Paths are relative to `backend/apps/` unless they start with `apps/`.

## Key facts

- `schools.School.school_type` is `general | technical | mixed` (curriculum track). It is NOT an education level. A new `education_category` field is needed (`basic | secondary | higher`), defaulting to `secondary` so existing schools keep behaving as before.
- Matricules: all in `users/matricules.py`. School `{SHORT}{SEQ:02d}{YY}`; school users `{school.matricule}{ROLE2}{N}` (student `ST` + 4 digits). Basic Education enrollment must call `generate_school_user_matricule(school, STUDENT)` unchanged. The School matricule is the only school identifier (no separate "central number").
- `students.Student.user` is a mandatory OneToOne to `User`. Pupils without a login currently get a placeholder `@students.eduignite.local` user (`students/serializers.py` `StudentCreateSerializer`). Making `user` nullable is a risky migration and needs a decision.
- Teachers are `User(role=TEACHER)`. Links: `grades.ClassSubject.teacher`, `SchoolClass.class_master`. No class-level teacher assignment yet.
- `apps.academics` is not in INSTALLED_APPS (dead code). Live year is `SchoolSettings.academic_year` (string).
- Terms/sequences: exactly 6 sequences over 3 terms (`grades/sequence_defaults.py`), scores 0-20, letters A-F, coefficients. Nursery/primary may need other scales.
- Isolation is manual per viewset (`get_queryset` filters by `user.school`). New viewsets must copy the pattern.
- Frontends: website, mobile, desktop are forked copies of `apps/website/src`. Every UI change is made three times. No test runner in them (typecheck/lint only; builds ignore errors). `apps/offline-desktop` has vitest and SQLite.
- Deployment in the repo is AWS only. No Contabo/Oracle references.

## Reuse / extend / missing

| Requirement | Verdict | Where |
|---|---|---|
| Education category on school + create form | Extend (new field) | `schools/models.py`, `SchoolCreateSerializer`, `apps/website/src/components/forms/add-school-form.tsx`, `lib/api/types.ts` |
| Section config (nursery/primary/both) | Extend | `SchoolSettings.sections` JSON already exists |
| Nursery/primary class levels | Extend | `config/cameroon_data.py` CLASS_LEVELS, `SchoolClass.Cycle`, `lib/cameroon-education-system.ts`, Form-1 defaults in `students/models.py`, `_infer_level` |
| Matricule generation | Reuse unchanged | `users/matricules.py` |
| Pupil without login | Missing (decision needed) | `students/models.py` |
| Guardians / parent links | Reuse | `Guardian`, `StudentGuardian`, `ParentStudentLink` |
| Class-centred teacher assignment | Extend | add class-teacher link; keep `ClassSubject.teacher` for secondary |
| Subjects per class | Reuse | `grades.ClassSubject` |
| Attendance (daily register) | Extend | `attendance/models.py` is per period and subject |
| Marks/assessment scales | Extend | `grades/` hardcodes 0-20, 6 sequences |
| Report cards | Extend | `grades/utils.py`, `lib/cameroon-report-card.ts` |
| ID cards | Extend | `students/views.py student_card`, `dashboard/id-cards` |
| Fees, payments | Reuse | `fees/` is level-agnostic |
| Comms, notifications, AI | Reuse | existing apps |
| Offline sync | Extend | `offline_licensing` chunks (teachers/students only), `apps/offline-desktop` sync queue |
| Sidebar/dashboards by category | Extend | `dashboard-sidebar.tsx` `routes` + `categories` filter |
| Public site / SEO | Update | see seo-content agent file list |
