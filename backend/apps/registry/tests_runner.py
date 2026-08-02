"""Tests for loading and running app code.

The isolation rules are checked without a database. The end-to-end run is
attempted only where the platform can actually fork, and skips otherwise with
a clear reason rather than passing quietly — a test that silently does nothing
on the machine you develop on is worse than no test.
"""

import multiprocessing
import os
import shutil
import tempfile
import unittest
import zipfile

from django.test import SimpleTestCase, override_settings

from apps.registry.loader import LoaderError, import_handler, module_name, unpack
from apps.registry.runner import RunResult, _plain, run_handler
from apps.registry.tests_packages import GOOD_MANIFEST, build_eia

FORK = 'fork' in multiprocessing.get_all_start_methods()

HANDLER_SOURCE = '''
def add(ctx, request):
    return {'sum': int(request.get('a', 0)) + int(request.get('b', 0))}


def explode(ctx, request):
    raise ValueError('deliberate failure')


def spin(ctx, request):
    while True:
        pass


def leak_the_context(ctx, request):
    """Returning a non-plain object must be refused, not serialised."""
    return ctx
'''


class LoaderTests(SimpleTestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix='eduignite-runtime-')
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)

        self.package = os.path.join(self.tmp, 'app.eia')
        with open(self.package, 'wb') as handle:
            handle.write(build_eia(server=HANDLER_SOURCE).read())

    def _unpack(self):
        with override_settings(APP_RUNTIME_ROOT=os.path.join(self.tmp, 'runtime')):
            return unpack(self.package, 'teacher_attendance', '1.0.0')

    def test_only_server_code_is_unpacked(self):
        directory = self._unpack()
        self.assertTrue(os.path.isfile(os.path.join(directory, 'server', 'handlers.py')))
        # Web bundles are served from storage; they never land next to code
        # that is about to be imported.
        self.assertFalse(os.path.isdir(os.path.join(directory, 'web')))

    def test_a_handler_can_be_imported_and_called(self):
        directory = self._unpack()
        function = import_handler('teacher_attendance', '1.0.0', 'handlers.add', directory)
        self.assertEqual(function(None, {'a': 2, 'b': 3}), {'sum': 5})

    def test_a_missing_function_is_a_clear_error(self):
        directory = self._unpack()
        with self.assertRaises(LoaderError) as ctx:
            import_handler('teacher_attendance', '1.0.0', 'handlers.nope', directory)
        self.assertIn('nope', str(ctx.exception))

    def test_a_handler_must_name_a_module(self):
        directory = self._unpack()
        with self.assertRaises(LoaderError):
            import_handler('teacher_attendance', '1.0.0', 'add', directory)

    def test_versions_get_different_module_names(self):
        """Two versions of one app must never collide in sys.modules."""
        self.assertNotEqual(
            module_name('teacher_attendance', '1.0.0'),
            module_name('teacher_attendance', '1.0.1'),
        )

    def test_traversal_in_a_package_is_refused_at_unpack(self):
        evil = os.path.join(self.tmp, 'evil.eia')
        with zipfile.ZipFile(evil, 'w') as archive:
            archive.writestr('server/../../escaped.py', 'x = 1')
        with override_settings(APP_RUNTIME_ROOT=os.path.join(self.tmp, 'runtime')):
            with self.assertRaises(LoaderError):
                unpack(evil, 'teacher_attendance', '9.9.9')


class ResultConversionTests(SimpleTestCase):
    def test_plain_data_passes_through(self):
        self.assertEqual(_plain({'a': [1, 2, {'b': None}]}), {'a': [1, 2, {'b': None}]})

    def test_a_non_plain_return_is_refused(self):
        class Thing:
            pass

        with self.assertRaises(Exception):
            _plain(Thing())

    def test_keys_are_stringified(self):
        self.assertEqual(_plain({1: 'x'}), {'1': 'x'})


@unittest.skipUnless(FORK, 'needs fork; this platform cannot isolate app code')
class ForkedExecutionTests(SimpleTestCase):
    """Real execution in a real child process."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix='eduignite-run-')
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.package = os.path.join(self.tmp, 'app.eia')
        with open(self.package, 'wb') as handle:
            handle.write(build_eia(server=HANDLER_SOURCE).read())

    def _run(self, handler, payload=None, **overrides):
        settings = {'APP_RUNTIME_ROOT': os.path.join(self.tmp, 'runtime')}
        settings.update(overrides)
        with override_settings(**settings):
            return run_handler(
                app_key='teacher_attendance',
                version='1.0.0',
                handler=handler,
                manifest=GOOD_MANIFEST,
                package_path=self.package,
                school_id=None,
                payload=payload or {},
            )

    def test_a_handler_runs_and_returns_its_value(self):
        result = self._run('handlers.add', {'a': 20, 'b': 22})
        self.assertTrue(result.ok, result.error)
        self.assertEqual(result.value, {'sum': 42})

    def test_a_failing_handler_is_a_result_not_a_crash(self):
        result = self._run('handlers.explode')
        self.assertFalse(result.ok)
        self.assertEqual(result.error_type, 'ValueError')
        self.assertIn('deliberate failure', result.error)

    def test_an_infinite_loop_is_stopped(self):
        result = self._run('handlers.spin', APP_RUNTIME_TIMEOUT_SECONDS=2)
        self.assertFalse(result.ok)
        self.assertTrue(result.timed_out)

    def test_the_context_cannot_be_returned_to_the_caller(self):
        """A handler must not hand the ORM back across the process boundary."""
        result = self._run('handlers.leak_the_context')
        self.assertFalse(result.ok)


@unittest.skipIf(FORK, 'only relevant where fork is unavailable')
class NoIsolationTests(SimpleTestCase):
    """Where the platform cannot isolate, apps must be off rather than unsafe."""

    @override_settings(DEBUG=False, APP_RUNTIME_ALLOW_INLINE=False)
    def test_apps_are_refused_rather_than_run_in_the_web_process(self):
        result = run_handler(
            app_key='teacher_attendance',
            version='1.0.0',
            handler='handlers.add',
            manifest=GOOD_MANIFEST,
            package_path='unused',
            school_id=None,
        )
        self.assertFalse(result.ok)
        self.assertEqual(result.error_type, 'NoIsolation')
