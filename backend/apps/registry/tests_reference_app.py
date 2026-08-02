"""Teacher Attendance, end to end.

The reference app is packaged from source at test time rather than from a
committed .eia, so this always tests what is actually in apps-source/ and
cannot pass against a stale artifact somebody forgot to rebuild.

Covers the real pipeline — read, check, unpack, import, execute — with a stub
standing in only for the database, which the unit suite cannot reach. If this
passes, an app can be built, reviewed and run.
"""

import io
import json
import os
import shutil
import tempfile
import unittest
import zipfile

from django.test import SimpleTestCase, override_settings

from apps.registry.checks import run_checks
from apps.registry.loader import import_handler, unpack
from apps.registry.package import read_package

SOURCE = os.path.abspath(
    os.path.join(
        os.path.dirname(__file__), '..', '..', '..',
        'apps-source', 'teacher-attendance',
    )
)

STAFF = [
    {'id': 'u-1', 'name': 'Ayuk Bernard', 'role': 'TEACHER'},
    {'id': 'u-2', 'name': 'Ngwa Comfort', 'role': 'TEACHER'},
    {'id': 'u-3', 'name': 'Tabi Grace', 'role': 'SCHOOL_ADMIN'},
]


def package_reference_app() -> io.BytesIO:
    """Zip apps-source/teacher-attendance exactly as build.py does."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name in ('manifest.json', 'CHANGELOG.md'):
            path = os.path.join(SOURCE, name)
            if os.path.isfile(path):
                archive.write(path, name)
        for directory in ('server', 'web', 'assets', 'migrations'):
            base = os.path.join(SOURCE, directory)
            if not os.path.isdir(base):
                continue
            for root, _dirs, files in os.walk(base):
                for filename in sorted(files):
                    if filename.endswith('.pyc') or filename.startswith('.'):
                        continue
                    full = os.path.join(root, filename)
                    arcname = os.path.relpath(full, SOURCE).replace(os.sep, '/')
                    archive.write(full, arcname)
    buffer.seek(0)
    return buffer


# ---------------------------------------------------------------- stub SDK


class _StubCollection:
    def __init__(self, store):
        self.store = store

    def query(self, where=None, order_by=None, limit=None, offset=0):
        rows = list(self.store.values())
        for key, value in (where or {}).items():
            field, _, operator = key.partition('__')
            if operator == 'startswith':
                rows = [r for r in rows if str(r.get(field, '')).startswith(value)]
            else:
                rows = [r for r in rows if r.get(field) == value]
        return rows[: (limit or 100)]

    def insert(self, values):
        record = {'id': f'rec-{len(self.store) + 1}', **values}
        self.store[record['id']] = record
        return record

    def update(self, record_id, values):
        record = self.store.get(record_id)
        if record is None:
            return None
        record.update(values)
        return record


class _StubData:
    def __init__(self):
        self.store = {}

    def collection(self, name):
        if name != 'clock_events':
            raise AssertionError(f'app reached for an undeclared collection: {name}')
        return _StubCollection(self.store)


class _StubCore:
    def staff(self, roles=None):
        return [p for p in STAFF if not roles or p['role'] in roles]


class _StubContext:
    def __init__(self):
        self.data = _StubData()
        self.core = _StubCore()


@unittest.skipUnless(os.path.isdir(SOURCE), 'reference app source not present')
class ReferenceAppTests(SimpleTestCase):
    """If this passes, an app can be built, reviewed and run."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.contents = read_package(package_reference_app())

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix='eia-ref-')
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)

    def _handlers(self):
        path = os.path.join(self.tmp, 'app.eia')
        with open(path, 'wb') as handle:
            handle.write(package_reference_app().read())
        with override_settings(APP_RUNTIME_ROOT=os.path.join(self.tmp, 'runtime')):
            directory = unpack(path, 'teacher_attendance', '1.0.0')
            return {
                name: import_handler(
                    'teacher_attendance', '1.0.0', f'handlers.{name}', directory
                )
                for name in ('mark', 'register_for_day', 'monthly_summary')
            }

    # -- packaging --------------------------------------------------------

    def test_the_package_reads_and_validates(self):
        manifest = self.contents.manifest
        self.assertEqual(manifest.key, 'teacher_attendance')
        self.assertEqual(manifest.scope.value, 'both')
        self.assertEqual(manifest.pricing.value, 'subscription')
        self.assertEqual(sorted(manifest.routes), ['/register', '/report'])

    def test_it_passes_the_automated_review_checks(self):
        report = run_checks(self.contents)
        self.assertTrue(report.passed, '; '.join(report.errors))

    def test_the_manifest_on_disk_matches_what_was_packaged(self):
        with open(os.path.join(SOURCE, 'manifest.json'), encoding='utf-8') as handle:
            on_disk = json.load(handle)
        self.assertEqual(on_disk['version'], self.contents.raw_manifest['version'])

    # -- behaviour --------------------------------------------------------

    def test_the_register_lists_every_member_of_staff(self):
        handlers = self._handlers()
        result = handlers['register_for_day'](_StubContext(), {'date': '2026-03-16'})
        self.assertEqual(result['total'], 3)
        self.assertEqual(result['marked'], 0)
        self.assertEqual(
            [e['name'] for e in result['entries']],
            ['Ayuk Bernard', 'Ngwa Comfort', 'Tabi Grace'],
        )

    def test_marking_twice_corrects_rather_than_duplicating(self):
        """A teacher marked in error must be correctable, not doubled."""
        handlers = self._handlers()
        ctx = _StubContext()
        handlers['mark'](ctx, {'date': '2026-03-16', 'teacher': 'u-1', 'status': 'present'})
        result = handlers['mark'](
            ctx, {'date': '2026-03-16', 'teacher': 'u-1', 'status': 'absent'}
        )
        self.assertEqual(len(ctx.data.store), 1)
        self.assertEqual(result['record']['status'], 'absent')

    def test_the_name_is_stored_beside_the_reference(self):
        """So a report still reads correctly after someone leaves the school."""
        handlers = self._handlers()
        ctx = _StubContext()
        result = handlers['mark'](
            ctx, {'date': '2026-03-16', 'teacher': 'u-1', 'status': 'present'}
        )
        self.assertEqual(result['record']['teacher_name'], 'Ayuk Bernard')

    def test_days_are_kept_apart(self):
        handlers = self._handlers()
        ctx = _StubContext()
        handlers['mark'](ctx, {'date': '2026-03-16', 'teacher': 'u-1', 'status': 'present'})
        other = handlers['register_for_day'](ctx, {'date': '2026-03-17'})
        self.assertEqual(other['marked'], 0)

    def test_the_monthly_summary_aggregates_across_days(self):
        handlers = self._handlers()
        ctx = _StubContext()
        handlers['mark'](ctx, {'date': '2026-03-16', 'teacher': 'u-2',
                               'status': 'late', 'minutes_late': 25})
        handlers['mark'](ctx, {'date': '2026-03-17', 'teacher': 'u-2',
                               'status': 'late', 'minutes_late': 5})
        summary = handlers['monthly_summary'](ctx, {'month': '2026-03'})
        entry = next(s for s in summary['staff'] if s['name'] == 'Ngwa Comfort')
        self.assertEqual(entry['late'], 2)
        self.assertEqual(entry['minutes_late'], 30)
        self.assertFalse(summary['truncated'])

    # -- refusals ---------------------------------------------------------

    def test_bad_input_is_refused_rather_than_stored(self):
        handlers = self._handlers()
        ctx = _StubContext()
        self.assertIn('error', handlers['mark'](ctx, {'teacher': 'u-1', 'status': 'present'}))
        self.assertIn('error', handlers['mark'](
            ctx, {'date': '2026-03-16', 'teacher': 'u-1', 'status': 'holiday'}
        ))
        self.assertIn('error', handlers['monthly_summary'](ctx, {'month': 'March'}))
        self.assertEqual(len(ctx.data.store), 0)
