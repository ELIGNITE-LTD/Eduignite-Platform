"""Basic Education schools must have the Messaging (chat) app, and their
teachers/admins must be able to message each other and EduIgnite."""

from importlib import import_module

from django.apps import apps as django_apps
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from apps.chat.relations import are_users_related
from apps.registry import api as registry_api
from apps.registry.models import AppInstallation
from apps.registry.test_basic_fees_backfill import make_school

User = get_user_model()


def mk(matricule, role, school):
    return User.objects.create_user(
        matricule=matricule, name=matricule, email=f'{matricule.lower()}@example.org', role=role,
        school=school, password='password123', is_license_paid=True,
    )


class BasicChatTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.basic = make_school('CHT-B', 'basic')
        cls.basic_off = make_school('CHT-OFF', 'basic')
        cls.secondary = make_school('CHT-S', 'secondary')
        AppInstallation.objects.all().delete()
        AppInstallation.objects.create(
            school=cls.basic_off, app_key='chat', is_enabled=False, note='Off on purpose.',
        )

    def backfill(self):
        import_module('apps.registry.migrations.0009_backfill_chat_for_basic_schools').backfill(django_apps, None)

    def test_backfill_additive_idempotent_and_basic_only(self):
        self.backfill()
        self.backfill()
        self.assertTrue(registry_api.is_installed(self.basic, 'chat'))
        self.assertFalse(AppInstallation.objects.get(school=self.basic_off, app_key='chat').is_enabled)
        self.assertFalse(AppInstallation.objects.filter(school=self.secondary).exists())
        self.assertEqual(AppInstallation.objects.filter(app_key='chat').count(), 2)

    def test_new_basic_school_gets_chat_secondary_does_not(self):
        nb, ns = make_school('CHT-NB', 'basic'), make_school('CHT-NS', 'secondary')
        registry_api.install_defaults(nb)
        registry_api.install_defaults(ns)
        self.assertTrue(registry_api.is_installed(nb, 'chat'))
        self.assertFalse(registry_api.is_installed(ns, 'chat'))

    def test_teacher_and_admin_can_chat_with_each_other_and_eduignite(self):
        self.backfill()
        teacher = mk('TCH-CHT', 'TEACHER', self.basic)
        admin = mk('ADM-CHT', 'SCHOOL_ADMIN', self.basic)
        ceo = mk('CEO-CHT', 'CEO', None)
        for user in (teacher, admin):
            self.client.force_authenticate(user)
            body = self.client.get('/api/v1/registry/my-apps/').data
            self.assertIn('/dashboard/chat', body['routes'])
            self.assertEqual(self.client.get('/api/v1/chat/conversations/').status_code, 200)
        self.assertTrue(are_users_related(teacher, admin))
        self.assertTrue(are_users_related(admin, teacher))
        self.assertTrue(are_users_related(teacher, ceo))
        self.client.force_authenticate(teacher)
        r = self.client.post('/api/v1/chat/conversations/get-or-create-direct/', {'user_id': str(admin.id)}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        conv = r.data['id']
        m = self.client.post('/api/v1/chat/messages/', {'conversation_id': conv, 'text': 'Hello'}, format='json')
        self.assertIn(m.status_code, (200, 201), m.data)
        self.client.force_authenticate(admin)
        listed = self.client.get('/api/v1/chat/messages/', {'conversation_id': conv})
        self.assertEqual(listed.status_code, 200)

    def test_secondary_teacher_does_not_gain_founder_contact(self):
        teacher = mk('TCH-CHS', 'TEACHER', self.secondary)
        ceo = mk('CEO-CHS', 'CEO', None)
        self.assertFalse(are_users_related(teacher, ceo))
