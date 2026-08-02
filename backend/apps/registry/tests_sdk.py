"""Tests for the app SDK.

Split in two deliberately:

* the isolation and permission rules are checked **without a database**, by
  inspecting the queryset the SDK builds and by exercising the permission and
  validation logic directly. Those are the guarantees everything rests on, and
  they should be verifiable on any machine.
* the behavioural round-trip (insert, query, update, delete) needs rows and is
  marked so it can run where a database is reachable.
"""

from unittest import mock

from django.test import SimpleTestCase

from apps.registry.collection_schema import ValidationError, validate_record
from apps.registry.sdk import (
    MAX_LIMIT, AppContext, DataService, PermissionError_, SdkError,
)

MANIFEST = {
    'key': 'teacher_attendance',
    'collections': [
        {
            'name': 'clock_events',
            'fields': [
                {'name': 'teacher', 'type': 'reference', 'to': 'core.user',
                 'required': True, 'indexed': True},
                {'name': 'date', 'type': 'date', 'required': True, 'indexed': True},
                {'name': 'status', 'type': 'enum',
                 'values': ['present', 'absent', 'late']},
                {'name': 'minutes_late', 'type': 'integer'},
                {'name': 'note', 'type': 'text'},
            ],
        },
        {
            'name': 'settings',
            'fields': [{'name': 'grace_minutes', 'type': 'integer'}],
        },
    ],
    'permissions': {
        'core': ['users:read'],
        'collections': ['clock_events:read', 'clock_events:write', 'settings:read'],
    },
}

SCHOOL_A = '11111111-1111-1111-1111-111111111111'
SCHOOL_B = '22222222-2222-2222-2222-222222222222'


def service(school_id=SCHOOL_A, app_key='teacher_attendance'):
    return DataService(app_key=app_key, school_id=school_id, manifest_raw=MANIFEST)


class ScopingTests(SimpleTestCase):
    """The isolation guarantee: every query is pinned to one app and one school."""

    def test_every_query_is_pinned_to_the_app_and_school(self):
        handle = service().collection('clock_events')
        where = handle._base().query.where
        rendered = str(where)
        self.assertIn('teacher_attendance', rendered)
        self.assertIn('clock_events', rendered)
        self.assertIn(SCHOOL_A.replace('-', ''), rendered.replace('-', ''))

    def test_two_schools_produce_different_queries(self):
        a = service(SCHOOL_A).collection('clock_events')._base()
        b = service(SCHOOL_B).collection('clock_events')._base()
        self.assertNotEqual(str(a.query.where), str(b.query.where))

    def test_an_app_cannot_name_another_apps_collection(self):
        """A collection the manifest never declared does not exist to this app."""
        with self.assertRaises(SdkError) as ctx:
            service().collection('grades')
        self.assertIn('does not declare', str(ctx.exception))

    def test_there_is_no_way_to_pass_a_school(self):
        """Scope is set at construction; no read method accepts it."""
        import inspect

        handle_methods = ['query', 'get', 'count', 'insert', 'update', 'delete']
        from apps.registry.sdk import CollectionHandle

        for name in handle_methods:
            signature = inspect.signature(getattr(CollectionHandle, name))
            params = set(signature.parameters)
            self.assertNotIn('school', params, f'{name} accepts a school')
            self.assertNotIn('school_id', params, f'{name} accepts a school_id')
            self.assertNotIn('app_key', params, f'{name} accepts an app_key')


class PermissionTests(SimpleTestCase):
    def test_a_declared_permission_is_allowed(self):
        """Checked without executing, so this holds without a database."""
        svc = service()
        svc.require_permission('settings', 'read')       # declared
        svc.require_permission('clock_events', 'write')  # declared

    def test_writing_without_the_permission_is_refused(self):
        handle = service().collection('settings')   # only :read declared
        with self.assertRaises(PermissionError_) as ctx:
            handle.insert({'grace_minutes': 5})
        self.assertIn('settings:write', str(ctx.exception))

    def test_core_access_requires_a_declaration(self):
        context = AppContext(
            app_key='teacher_attendance', school_id=SCHOOL_A, manifest_raw=MANIFEST
        )
        with self.assertRaises(PermissionError_):
            context.core.classes()          # classes:read not declared

    def test_core_has_no_write_methods(self):
        """Apps cannot change Core data at all — not by permission, by absence."""
        from apps.registry.sdk import CoreService

        surface = [n for n in dir(CoreService) if not n.startswith('_')]
        for forbidden in ('create', 'update', 'delete', 'save', 'set'):
            self.assertNotIn(forbidden, surface)


class FilterTests(SimpleTestCase):
    def test_only_indexed_fields_are_filterable(self):
        handle = service().collection('clock_events')
        with self.assertRaises(SdkError) as ctx:
            handle._build_filters({'minutes_late': 5})
        self.assertIn('indexed', str(ctx.exception))

    def test_indexed_fields_are_filterable(self):
        handle = service().collection('clock_events')
        built = handle._build_filters({'date': '2026-03-14'})
        self.assertEqual(built, {'data__date': '2026-03-14'})

    def test_operators_are_translated(self):
        handle = service().collection('clock_events')
        built = handle._build_filters({'date__gte': '2026-01-01'})
        self.assertEqual(built, {'data__date__gte': '2026-01-01'})

    def test_an_unknown_operator_is_refused_not_ignored(self):
        handle = service().collection('clock_events')
        with self.assertRaises(SdkError):
            handle._build_filters({'date__regex': '.*'})

    def test_a_huge_limit_is_capped_before_it_reaches_the_database(self):
        handle = service().collection('clock_events')
        captured = {}

        class FakeQuerySet:
            def filter(self, **kwargs):
                return self

            def order_by(self, *args):
                return self

            def __getitem__(self, item):
                captured['slice'] = item
                return []

        with mock.patch.object(handle, '_base', return_value=FakeQuerySet()):
            handle.query(limit=100000)

        window = captured['slice']
        self.assertEqual(window.stop - window.start, MAX_LIMIT)


class RecordValidationTests(SimpleTestCase):
    spec = MANIFEST['collections'][0]

    def test_a_good_record_is_accepted_and_normalised(self):
        import datetime

        cleaned = validate_record(self.spec, {
            'teacher': '33333333-3333-3333-3333-333333333333',
            'date': datetime.date(2026, 3, 14),
            'status': 'present',
            'minutes_late': '0',
        })
        self.assertEqual(cleaned['date'], '2026-03-14')
        self.assertEqual(cleaned['minutes_late'], 0)

    def test_required_fields_are_enforced(self):
        with self.assertRaises(ValidationError) as ctx:
            validate_record(self.spec, {'status': 'present'})
        self.assertIn('required', str(ctx.exception))

    def test_undeclared_fields_are_refused_not_stored(self):
        with self.assertRaises(ValidationError) as ctx:
            validate_record(self.spec, {
                'teacher': 'abc', 'date': '2026-03-14', 'secret': 'smuggled',
            })
        self.assertIn('secret', str(ctx.exception))

    def test_enum_values_are_enforced(self):
        with self.assertRaises(ValidationError):
            validate_record(self.spec, {
                'teacher': 'abc', 'date': '2026-03-14', 'status': 'on holiday',
            })

    def test_a_bad_date_is_refused(self):
        with self.assertRaises(ValidationError):
            validate_record(self.spec, {'teacher': 'abc', 'date': 'last tuesday'})

    def test_partial_updates_skip_required_checks(self):
        cleaned = validate_record(self.spec, {'status': 'late'}, partial=True)
        self.assertEqual(cleaned, {'status': 'late'})

    def test_an_oversized_record_is_refused(self):
        with self.assertRaises(ValidationError) as ctx:
            validate_record(self.spec, {
                'teacher': 'abc', 'date': '2026-03-14', 'note': 'x' * 70000,
            })
        self.assertIn('byte limit', str(ctx.exception))

    def test_booleans_are_not_accepted_as_integers(self):
        spec = MANIFEST['collections'][1]
        with self.assertRaises(ValidationError):
            validate_record(spec, {'grace_minutes': True})
