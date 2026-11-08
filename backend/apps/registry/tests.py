"""Registry tests that need no database.

The registry is built from declarations in source, so most of what can go wrong
is checkable without touching Postgres — which matters here, because the test
database is not reachable from every development machine.
"""

from django.test import SimpleTestCase, TestCase

from apps.registry import api as registry_api
from apps.registry.manifest import AppManifest, AppTier, ManifestError, all_manifests, register


class ManifestDeclarationTests(SimpleTestCase):
    def test_every_app_declares_itself(self):
        """Each shipped app should be in the catalogue."""
        keys = set(all_manifests())
        expected = {
            'students', 'schools', 'users', 'authentication', 'notifications',
            'attendance', 'grades', 'fees', 'chat', 'exams', 'library',
            'assignments', 'ai_features', 'live_classes', 'community',
        }
        missing = sorted(expected - keys)
        self.assertEqual(missing, [], f'Apps missing a declaration: {missing}')

    def test_keys_are_unique_and_slug_like(self):
        for key, manifest in all_manifests().items():
            self.assertEqual(key, manifest.key)
            self.assertTrue(
                key.replace('_', '').isalnum(),
                f'{key!r} is not a usable app key.',
            )

    def test_every_app_has_a_name_and_summary(self):
        for manifest in all_manifests().values():
            self.assertTrue(manifest.name, f'{manifest.key} has no name.')
            self.assertTrue(manifest.summary, f'{manifest.key} has no summary.')

    def test_core_apps_cannot_be_uninstalled(self):
        for manifest in all_manifests().values():
            if manifest.tier == AppTier.CORE:
                self.assertFalse(manifest.is_uninstallable, manifest.key)
            else:
                self.assertTrue(manifest.is_uninstallable, manifest.key)

    def test_student_records_is_core(self):
        """Student Management is the Core service everything reads through."""
        self.assertTrue(all_manifests()['students'].is_core)

    def test_duplicate_key_with_different_body_is_rejected(self):
        original = all_manifests()['attendance']
        clash = AppManifest(
            key='attendance',
            name='Something else entirely',
            summary='A different app claiming a taken key.',
        )
        with self.assertRaises(ManifestError):
            register(clash)
        # The real declaration must survive the failed attempt.
        self.assertEqual(all_manifests()['attendance'], original)

    def test_registering_the_same_manifest_twice_is_harmless(self):
        """Re-importing a declaration module must not explode."""
        existing = all_manifests()['attendance']
        register(existing)
        self.assertEqual(all_manifests()['attendance'], existing)

    def test_nameless_app_is_rejected(self):
        with self.assertRaises(ManifestError):
            register(AppManifest(key='ghost', name='', summary=''))


class CatalogueTests(SimpleTestCase):
    def test_catalogue_lists_core_apps_first(self):
        catalogue = registry_api.list_catalogue()
        tiers = [m.is_core for m in catalogue]
        self.assertEqual(
            tiers,
            sorted(tiers, reverse=True),
            'Core apps should sort ahead of the rest.',
        )

    def test_get_app_returns_none_for_unknown_key(self):
        self.assertIsNone(registry_api.get_app('not-a-real-app'))

    def test_core_apps_are_installed_without_any_row(self):
        """Core is the platform: available even for a school with no records."""
        self.assertTrue(registry_api.is_installed(None, 'students'))
        self.assertTrue(registry_api.is_installed(None, 'schools'))

    def test_optional_apps_need_an_installation(self):
        self.assertFalse(registry_api.is_installed(None, 'ai_features'))

    def test_unknown_app_is_never_installed(self):
        self.assertFalse(registry_api.is_installed(None, 'not-a-real-app'))
        self.assertFalse(registry_api.is_installed(None, ''))


class RouteCoverageTests(SimpleTestCase):
    def test_routes_are_absolute_dashboard_paths(self):
        for manifest in all_manifests().values():
            for route in manifest.routes:
                self.assertTrue(
                    route.startswith('/'),
                    f'{manifest.key}: route {route!r} should start with "/".',
                )

    def test_no_two_apps_claim_the_same_route(self):
        """A route resolving to two apps would make navigation ambiguous."""
        seen: dict = {}
        clashes = []
        for manifest in all_manifests().values():
            for route in manifest.routes:
                if route in seen and seen[route] != manifest.key:
                    clashes.append(f'{route} claimed by {seen[route]} and {manifest.key}')
                seen[route] = manifest.key
        self.assertEqual(clashes, [], '; '.join(clashes))

    def test_core_services_reference_real_apps(self):
        keys = set(all_manifests())
        for manifest in all_manifests().values():
            for service in manifest.core_services:
                self.assertIn(
                    service, keys, f'{manifest.key} depends on unknown service {service!r}.'
                )

    def test_apps_depending_on_a_core_service_name_a_core_app(self):
        """An app may only declare a dependency on something that is Core."""
        manifests = all_manifests()
        for manifest in manifests.values():
            for service in manifest.core_services:
                self.assertTrue(
                    manifests[service].is_core,
                    f'{manifest.key} depends on {service!r}, which is not a Core app.',
                )


class BasicAdminRoutesAreCoreTests(SimpleTestCase):
    """The Classes and Subjects tabs of a basic school's admin must never be gated."""

    def test_classes_and_subjects_routes_belong_to_a_core_app(self):
        manifests = all_manifests()
        for route in ('/dashboard/classes', '/dashboard/subjects', '/dashboard/sections', '/dashboard/admissions'):
            owners = [m for m in manifests.values() if route in m.routes]
            self.assertEqual(len(owners), 1, f'{route} must be claimed by exactly one app.')
            self.assertTrue(owners[0].is_core, f'{route} is owned by {owners[0].key}, which is not Core.')


class GuardReachabilityTests(SimpleTestCase):
    """A guard that cannot run is worse than no guard: it looks protective.

    DRF ignores ``permission_classes`` entirely once ``get_permissions()`` is
    overridden. A ``RequiresApp`` sitting in ``permission_classes`` on such a
    class enforces nothing at runtime while reading as enforcement in review,
    so it is checked here rather than left to memory.
    """

    def test_no_guard_is_shadowed_by_get_permissions(self):
        import ast
        import io
        import os

        shadowed = []
        for root, dirs, files in os.walk('apps'):
            dirs[:] = [d for d in dirs if d not in ('__pycache__', 'migrations')]
            for name in files:
                if not name.endswith('.py'):
                    continue
                path = os.path.join(root, name).replace(os.sep, '/')
                source = io.open(path, encoding='utf-8').read()
                if 'RequiresApp' not in source:
                    continue
                try:
                    tree = ast.parse(source)
                except SyntaxError:  # pragma: no cover
                    continue
                for node in ast.walk(tree):
                    if not isinstance(node, ast.ClassDef):
                        continue
                    guarded_attr = False
                    get_perms = None
                    for item in node.body:
                        if isinstance(item, ast.Assign) and any(
                            getattr(t, 'id', '') == 'permission_classes' for t in item.targets
                        ):
                            if 'RequiresApp' in ast.unparse(item.value):
                                guarded_attr = True
                        if isinstance(item, ast.FunctionDef) and item.name == 'get_permissions':
                            get_perms = item
                    if guarded_attr and get_perms is not None:
                        if 'RequiresApp' not in ast.unparse(get_perms):
                            shadowed.append(f'{path}:{node.lineno} {node.name}')

        self.assertEqual(
            shadowed,
            [],
            'These classes declare a RequiresApp guard that get_permissions() '
            'silently discards. Add the guard inside get_permissions() too:\n  '
            + '\n  '.join(shadowed),
        )

    def test_every_optional_app_guards_at_least_one_endpoint(self):
        """A sellable app whose endpoints are unguarded is not actually sold."""
        import io
        import os

        from apps.registry.manifest import all_manifests

        unguarded = []
        for manifest in all_manifests().values():
            if manifest.is_core or not manifest.api_prefixes:
                continue
            app_dir = os.path.join('apps', manifest.key)
            if not os.path.isdir(app_dir):
                continue
            found = False
            for name in os.listdir(app_dir):
                if not name.endswith('.py'):
                    continue
                source = io.open(os.path.join(app_dir, name), encoding='utf-8').read()
                if f'RequiresApp({manifest.key!r})' in source or (
                    'RequiresApp(' in source and manifest.key in source
                ):
                    found = True
                    break
            if not found:
                unguarded.append(manifest.key)

        self.assertEqual(
            unguarded,
            [],
            'These apps are sold separately but enforce nothing server-side: '
            f'{unguarded}. Hiding them in navigation is not enforcement.',
        )


class WiringRouteOwnershipTests(TestCase):
    """Routes whose API is app-gated, or that a locked school must reach, are claimed."""

    def owner(self, route):
        from apps.registry.manifest import all_manifests

        owners = [m for m in all_manifests().values() if route in m.routes]
        self.assertEqual(len(owners), 1, f'{route} owned by {[m.key for m in owners]}')
        return owners[0]

    def test_subscription_page_is_owned_by_a_core_app(self):
        self.assertTrue(self.owner('/dashboard/subscription').is_core)

    def test_fees_no_longer_owns_subscription(self):
        self.assertNotIn('/dashboard/subscription', self.owner('/dashboard/fees').routes)

    def test_basic_school_routes_are_claimed(self):
        self.assertEqual(self.owner('/dashboard/class-marks').key, 'grades')
        self.assertEqual(self.owner('/dashboard/conduct').key, 'grades')
        self.assertTrue(self.owner('/dashboard/health-records').is_core)
        self.assertTrue(self.owner('/dashboard/certificates').is_core)
        self.assertTrue(self.owner('/dashboard/classes').is_core)
        self.assertTrue(self.owner('/dashboard/subjects').is_core)
        self.assertTrue(self.owner('/dashboard/sections').is_core)

    def test_basic_schools_get_fees_by_default_secondary_do_not(self):
        from apps.registry import api as registry_api
        from apps.schools.models import School

        basic = School.objects.create(id='WIR-B', name='B', short_name='B', principal='P', location='L',
                                      email='b@x.org', education_category='basic')
        secondary = School.objects.create(id='WIR-S', name='S', short_name='S', principal='P', location='L',
                                          email='s@x.org', education_category='secondary')
        registry_api.install_defaults(basic)
        registry_api.install_defaults(secondary)
        self.assertTrue(registry_api.is_installed(basic, 'fees'))
        self.assertTrue(registry_api.is_installed(basic, 'grades'))
        self.assertFalse(registry_api.is_installed(secondary, 'fees'))
        self.assertTrue(registry_api.is_installed(secondary, 'grades'))
