"""Data migration: grant PROFILE_EDIT, ACM_READ, and ACM_WRITE to CEO and CTO.

Reported live: the CEO could not set the Academy profile (logo/tagline/
vision/mission/description via ProfileConfigUpdateView), feature/unfeature
a course in Course Spotlight (CourseViewSet.update's is_featured check), add
an FAQ entry (FAQEntryViewSet), or manage trainer profiles
(TrainerProfileViewSet) — every one of those is gated on PROFILE_EDIT (see
backend/apps/academy/views.py), which neither ``0002_bootstrap_ceo_coo_
permissions`` nor ``0003_grant_course_create_to_founders_and_coo`` ever
granted to CEO/CTO. Also adds ACM_READ/ACM_WRITE, the scopes
CourseTestimonialViewSet gates its moderation queue and approve/reject
actions on — CEO/CTO could not even list pending testimonials before this,
let alone moderate them (0002 granted ACM_READ to COO only).

Founder-parity note (same hard rule as 0002's and 0003's docstrings):
EduIgnite's two real founders, CEO and CTO, must always have strictly equal
rights — no capability one holds that the other lacks. All three scopes
below are granted to CEO and CTO together in the same loop; never grant one
without the other.

Purely additive: every scope any role already holds (per 0002/0003) is left
completely untouched, including COO's own independent ACM_READ grant. This
migration only adds PROFILE_EDIT/ACM_READ/ACM_WRITE to CEO/CTO.

Looked up by role (CEO / CTO), not a hardcoded matricule, for the same
reason as 0002/0003: the exact matricule differs per environment.
Idempotent via get_or_create, so it is safe to run in every environment and
safe to re-run.
"""

from django.db import migrations


def grant_profile_edit_and_acm_scopes(apps, schema_editor):
    User = apps.get_model('users', 'User')
    AcademyPermission = apps.get_model('academy', 'AcademyPermission')

    founder_scopes = ['PROFILE_EDIT', 'ACM_READ', 'ACM_WRITE']

    for user in User.objects.filter(role__in=['CEO', 'CTO']):
        for scope in founder_scopes:
            AcademyPermission.objects.get_or_create(user=user, scope=scope)


def noop_reverse(apps, schema_editor):
    """Deliberately a no-op, matching 0002's/0003's convention: reversing
    this migration should not strip a scope a human may have since decided
    to keep/re-grant by hand — bootstrap seeding is one-directional."""


class Migration(migrations.Migration):

    dependencies = [
        ('academy', '0003_grant_course_create_to_founders_and_coo'),
    ]

    operations = [
        migrations.RunPython(grant_profile_edit_and_acm_scopes, noop_reverse),
    ]
