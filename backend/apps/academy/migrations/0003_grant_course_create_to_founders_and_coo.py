"""Data migration: grant COURSE_CREATE to CEO, CTO, and COO.

Product direction (see the task this migration ships with): the COO runs
EduIgnite Academy day-to-day -- uploading/managing courses is their main
job -- while CEO and CTO hold an oversight/approval role but must also be
able to personally create/upload courses themselves, exactly like the COO
can. Before this migration, ``0002_bootstrap_ceo_coo_permissions`` granted
CEO/CTO only COURSE_ASSIGN + COURSE_APPROVE, and COO only ACM_READ +
ANALYTICS_VIEW -- none of the three actually held COURSE_CREATE, which is
what ``CourseViewSet.create`` requires (see
``backend/apps/academy/views.py`` ``get_permissions()``). That meant none of
CEO, CTO, or COO could create a course through the normal course-creation
flow at all. This migration closes that gap.

Founder-parity note (same hard rule as 0002's docstring): EduIgnite's two
real founders, CEO and CTO, must always have strictly equal rights -- no
capability one holds that the other lacks. CEO and CTO are granted
COURSE_CREATE together in the same loop below; never grant one without the
other.

Purely additive: every scope any of these three roles already holds (per
0002) is left completely untouched. This migration only adds COURSE_CREATE
on top.

Looked up by role (CEO / CTO / COO) rather than a hardcoded matricule, for
the same reason as 0002: the exact matricule differs per environment.
Idempotent via get_or_create, so it is safe to run in every environment
(including ones missing any of these roles) and safe to re-run.
"""

from django.db import migrations


def grant_course_create(apps, schema_editor):
    User = apps.get_model('users', 'User')
    AcademyPermission = apps.get_model('academy', 'AcademyPermission')

    for user in User.objects.filter(role__in=['CEO', 'CTO', 'COO']):
        AcademyPermission.objects.get_or_create(user=user, scope='COURSE_CREATE')


def noop_reverse(apps, schema_editor):
    """Deliberately a no-op, matching 0002's convention: reversing this
    migration should not strip a scope a human may have since decided to
    keep/re-grant by hand -- bootstrap seeding is one-directional."""


class Migration(migrations.Migration):

    dependencies = [
        ('academy', '0002_bootstrap_ceo_coo_permissions'),
    ]

    operations = [
        migrations.RunPython(grant_course_create, noop_reverse),
    ]
