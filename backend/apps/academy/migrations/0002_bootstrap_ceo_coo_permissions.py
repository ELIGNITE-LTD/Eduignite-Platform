"""Data migration: seed AcademyPermission rows for the platform's real CEO,
CTO, and COO founder/leadership accounts, per the contract's "Bootstrap"
section.

Founder-parity note: EduIgnite's two real founders are CEO and CTO, and per
explicit product direction they must have strictly equal rights across the
entire platform -- no capability one holds that the other lacks. This is
purely additive: every other role's scopes (COO included) stand exactly as
the source spec describes, untouched. The CTO block below is the only
deviation from the original spec text, which named the CEO as sole holder
of course-governance authority.

Looked up by role (CEO / CTO / COO) rather than a hardcoded matricule, since
the exact matricule can differ per environment. Idempotent via
get_or_create so it is safe to run in every environment (including ones
missing any of these roles -- it simply grants nothing for that role) and
safe to re-run.
"""

from django.db import migrations


def grant_founder_and_coo_permissions(apps, schema_editor):
    User = apps.get_model('users', 'User')
    AcademyPermission = apps.get_model('academy', 'AcademyPermission')

    # CEO and CTO: identical top-tier scopes -- founder parity, see module
    # docstring. Do not grant one without the other.
    founder_scopes = ['COURSE_ASSIGN', 'COURSE_APPROVE']
    coo_scopes = ['ACM_READ', 'ANALYTICS_VIEW']

    for user in User.objects.filter(role__in=['CEO', 'CTO']):
        for scope in founder_scopes:
            AcademyPermission.objects.get_or_create(user=user, scope=scope)

    for user in User.objects.filter(role='COO'):
        for scope in coo_scopes:
            AcademyPermission.objects.get_or_create(user=user, scope=scope)


def noop_reverse(apps, schema_editor):
    """Deliberately a no-op: reversing this migration should not strip
    permissions a human may have since then decided to keep/re-grant by
    hand — bootstrap seeding is one-directional."""


class Migration(migrations.Migration):

    dependencies = [
        ('academy', '0001_initial'),
        ('users', '0011_founderprofile_primary_share_units_and_more'),
    ]

    operations = [
        migrations.RunPython(grant_founder_and_coo_permissions, noop_reverse),
    ]
