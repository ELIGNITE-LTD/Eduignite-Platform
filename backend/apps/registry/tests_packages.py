"""Tests for uploaded app packages: reading, validating and checking.

All of these run without a database — they build real .eia zips in memory and
push them through the same reader and checker the upload endpoint uses. The
lifecycle itself needs rows, so it is covered by the state-machine table rather
than by saving builds.
"""

import io
import json
import zipfile

from django.test import SimpleTestCase

from apps.registry.checks import run_checks
from apps.registry.lifecycle import ALLOWED
from apps.registry.build_models import BuildState
from apps.registry.manifest import ManifestError
from apps.registry.manifest_schema import manifest_from_dict
from apps.registry.package import PackageError, read_package

GOOD_MANIFEST = {
    'key': 'teacher_attendance',
    'version': '1.0.0',
    'runtime_api': '1.x',
    'name': 'Teacher Attendance',
    'summary': 'Clock-in register and monthly reports for teaching staff.',
    'icon': 'ClipboardCheck',
    'publisher': 'EduIgnite',
    'scope': 'both',
    'pricing': {'model': 'subscription', 'price': 15000, 'currency': 'XAF'},
    'roles': ['SCHOOL_ADMIN', 'TEACHER'],
    'collections': [
        {
            'name': 'clock_events',
            'fields': [
                {'name': 'teacher', 'type': 'reference', 'to': 'core.user',
                 'required': True, 'indexed': True},
                {'name': 'date', 'type': 'date', 'required': True, 'indexed': True},
                {'name': 'status', 'type': 'enum', 'values': ['present', 'absent', 'late']},
            ],
        }
    ],
    'screens': [
        {'id': 'register', 'title': 'Daily Register', 'route': '/register',
         'roles': ['TEACHER'], 'entry': 'web/register.js'},
    ],
    'permissions': {
        'core': ['users:read'],
        'collections': ['clock_events:read', 'clock_events:write'],
    },
    'jobs': [],
}

GOOD_SERVER = '''
def register_clock_in(ctx, request):
    """Record a clock-in for the calling teacher."""
    return ctx.data.collection('clock_events').insert({
        'teacher': ctx.user.id,
        'date': request['date'],
        'status': 'present',
    })


def todays_register(ctx, request):
    return ctx.data.collection('clock_events').query(where={'date': request['date']})
'''


def build_eia(manifest=None, server=GOOD_SERVER, web=('web/register.js',),
              changelog='First release.', extra=None):
    """Produce a real .eia in memory."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('manifest.json', json.dumps(manifest or GOOD_MANIFEST))
        if server is not None:
            archive.writestr('server/handlers.py', server)
        for path in web:
            archive.writestr(path, 'export default function () {}')
        if changelog:
            archive.writestr('CHANGELOG.md', changelog)
        for path, body in (extra or {}).items():
            archive.writestr(path, body)
    buffer.seek(0)
    return buffer


class PackageReadingTests(SimpleTestCase):
    def test_a_good_package_reads(self):
        contents = read_package(build_eia())
        self.assertEqual(contents.manifest.key, 'teacher_attendance')
        self.assertEqual(contents.manifest.scope.value, 'both')
        self.assertIn('server/handlers.py', contents.server_files)
        self.assertIn('web/register.js', contents.web_files)

    def test_not_a_zip_is_rejected(self):
        with self.assertRaises(PackageError):
            read_package(io.BytesIO(b'this is not a zip'))

    def test_missing_manifest_is_rejected(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w') as archive:
            archive.writestr('server/handlers.py', 'x = 1')
        buffer.seek(0)
        with self.assertRaises(PackageError) as ctx:
            read_package(buffer)
        self.assertIn('manifest.json', str(ctx.exception))

    def test_path_traversal_is_rejected(self):
        """A package must not be able to name a file outside itself."""
        with self.assertRaises(PackageError):
            read_package(build_eia(extra={'../../etc/passwd': 'root'}))

    def test_unexpected_top_level_file_is_rejected(self):
        with self.assertRaises(PackageError) as ctx:
            read_package(build_eia(extra={'setup.py': 'import os'}))
        self.assertIn('Unexpected file', str(ctx.exception))

    def test_non_python_in_server_is_rejected(self):
        with self.assertRaises(PackageError):
            read_package(build_eia(extra={'server/notes.txt': 'hello'}))

    def test_screen_entry_must_exist_in_package(self):
        with self.assertRaises(PackageError) as ctx:
            read_package(build_eia(web=()))
        self.assertIn('not in the package', str(ctx.exception))


class ManifestValidationTests(SimpleTestCase):
    def _manifest(self, **overrides):
        raw = json.loads(json.dumps(GOOD_MANIFEST))
        raw.update(overrides)
        return raw

    def test_version_must_be_semver(self):
        with self.assertRaises(ManifestError):
            manifest_from_dict(self._manifest(version='1.0'))

    def test_runtime_api_must_be_declared(self):
        with self.assertRaises(ManifestError):
            manifest_from_dict(self._manifest(runtime_api='latest'))

    def test_uploaded_app_cannot_be_core(self):
        with self.assertRaises(ManifestError) as ctx:
            manifest_from_dict(self._manifest(tier='core'))
        self.assertIn('cannot declare itself Core', str(ctx.exception))

    def test_apps_cannot_request_write_on_core_data(self):
        raw = self._manifest()
        raw['permissions']['core'] = ['students:write']
        with self.assertRaises(ManifestError) as ctx:
            manifest_from_dict(raw)
        self.assertIn('cannot write Core data', str(ctx.exception))

    def test_permission_must_name_a_declared_collection(self):
        raw = self._manifest()
        raw['permissions']['collections'] = ['ghost:read']
        with self.assertRaises(ManifestError) as ctx:
            manifest_from_dict(raw)
        self.assertIn('does not declare', str(ctx.exception))

    def test_reference_must_point_at_something_apps_can_reach(self):
        raw = self._manifest()
        raw['collections'][0]['fields'][0]['to'] = 'core.payment'
        with self.assertRaises(ManifestError):
            manifest_from_dict(raw)

    def test_screen_role_must_be_declared_by_the_app(self):
        raw = self._manifest()
        raw['screens'][0]['roles'] = ['BURSAR']
        with self.assertRaises(ManifestError) as ctx:
            manifest_from_dict(raw)
        self.assertIn('does not declare', str(ctx.exception))

    def test_paid_app_needs_a_price(self):
        with self.assertRaises(ManifestError):
            manifest_from_dict(self._manifest(pricing={'model': 'subscription', 'price': 0}))

    def test_duplicate_route_is_rejected(self):
        raw = self._manifest()
        raw['screens'].append({
            'id': 'other', 'title': 'Other', 'route': '/register',
            'roles': ['TEACHER'], 'entry': 'web/register.js',
        })
        with self.assertRaises(ManifestError) as ctx:
            manifest_from_dict(raw)
        self.assertIn('claimed twice', str(ctx.exception))


class AutomatedCheckTests(SimpleTestCase):
    def test_a_good_build_passes(self):
        report = run_checks(read_package(build_eia()))
        self.assertTrue(report.passed, report.errors)

    def test_network_access_is_refused(self):
        source = GOOD_SERVER + '\nimport requests\n'
        report = run_checks(read_package(build_eia(server=source)))
        self.assertFalse(report.passed)
        self.assertTrue(any('requests' in e for e in report.errors))

    def test_reaching_the_database_directly_is_refused(self):
        source = 'from django.db import connection\n' + GOOD_SERVER
        report = run_checks(read_package(build_eia(server=source)))
        self.assertFalse(report.passed)

    def test_eval_is_refused(self):
        source = GOOD_SERVER + '\ndef sneaky(ctx):\n    return eval("1+1")\n'
        report = run_checks(read_package(build_eia(server=source)))
        self.assertFalse(report.passed)

    def test_undeclared_collection_write_is_caught(self):
        """Code doing more than the manifest admits to is the point of this check."""
        raw = json.loads(json.dumps(GOOD_MANIFEST))
        raw['permissions']['collections'] = ['clock_events:read']   # write removed
        report = run_checks(read_package(build_eia(manifest=raw)))
        self.assertFalse(report.passed)
        self.assertTrue(
            any('clock_events:write' in e for e in report.errors), report.errors
        )

    def test_version_must_increase_over_the_published_one(self):
        report = run_checks(
            read_package(build_eia()),
            published_key='teacher_attendance',
            published_version='2.0.0',
        )
        self.assertFalse(report.passed)
        self.assertTrue(any('not newer' in e for e in report.errors))

    def test_app_key_cannot_change(self):
        report = run_checks(
            read_package(build_eia()),
            published_key='something_else',
            published_version='0.9.0',
        )
        self.assertFalse(report.passed)
        self.assertTrue(any('orphans' in e for e in report.errors))

    def test_migration_without_a_reverse_is_refused(self):
        migration = 'def forward(ctx):\n    pass\n'
        report = run_checks(
            read_package(build_eia(extra={'migrations/0001_init.py': migration}))
        )
        self.assertFalse(report.passed)
        self.assertTrue(any('reverse()' in e for e in report.errors))

    def test_missing_changelog_is_only_a_warning(self):
        report = run_checks(read_package(build_eia(changelog='')))
        self.assertTrue(report.passed)
        self.assertTrue(any('CHANGELOG' in w for w in report.warnings))


class LifecycleRuleTests(SimpleTestCase):
    """The transition table itself, without touching the database."""

    def test_a_draft_cannot_be_published_directly(self):
        self.assertNotIn(BuildState.PUBLISHED, ALLOWED[BuildState.DRAFT])

    def test_a_draft_cannot_skip_review(self):
        self.assertNotIn(BuildState.APPROVED, ALLOWED[BuildState.DRAFT])

    def test_only_approved_builds_can_publish(self):
        can_publish = {
            state for state, targets in ALLOWED.items() if BuildState.PUBLISHED in targets
        }
        self.assertEqual(
            can_publish,
            {BuildState.APPROVED, BuildState.DEPRECATED, BuildState.PULLED},
            'Publishing must come from approval, or from restoring an older build.',
        )

    def test_a_failed_build_returns_to_the_author(self):
        self.assertIn(BuildState.DRAFT, ALLOWED[BuildState.CHECKS_FAILED])
        self.assertIn(BuildState.DRAFT, ALLOWED[BuildState.REJECTED])

    def test_every_state_is_reachable(self):
        reachable = {BuildState.DRAFT}
        for targets in ALLOWED.values():
            reachable |= set(targets)
        missing = set(BuildState) - reachable
        self.assertEqual(missing, set(), f'Unreachable states: {missing}')
