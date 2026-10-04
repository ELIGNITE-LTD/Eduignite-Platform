"""Announcement audiences: who may send to whom, and who receives each one.

Covers every scenario in the audience specification, through the real API
and the notification fan-out, for CEO, CTO, COO, another executive,
principals, teachers and parents at two different schools.
"""

import importlib

from django.apps import apps as django_apps
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.announcements.models import Announcement, AnnouncementAudienceGrant
from apps.notifications.models import Notification
from apps.registry.models import AppInstallation
from apps.schools.models import School

User = get_user_model()

FEED = '/api/v1/announcements/announcements/my_announcements/'
CREATE = '/api/v1/announcements/announcements/'
AUDIENCES = '/api/v1/announcements/announcements/audiences/'
GRANTS = '/api/v1/announcements/audience-grants/'


def _school(school_id, name):
    school = School.objects.create(
        id=school_id, name=name, short_name=school_id[:4], principal=f'{name} Principal',
        location='Yaounde', email=f'{school_id.lower()}@example.com', phone='237650600600',
        school_type='mixed', subsystem='bilingual',
    )
    AppInstallation.objects.get_or_create(school=school, app_key='announcements', defaults={'is_enabled': True})
    return school


def _user(matricule, role, school=None):
    return User.objects.create_user(
        matricule=matricule, name=matricule, email=f'{matricule.lower()}@example.com',
        role=role, school=school, password='pass12345',
    )


class AnnouncementAudienceTests(TestCase):
    def setUp(self):
        cache.clear()
        self.school_a = _school('SCHA', 'School Alpha')
        self.school_b = _school('SCHB', 'School Beta')

        self.ceo = _user('EDU-CEO-T1', 'CEO')
        self.cto = _user('EDU-CTO-T1', 'CTO')
        self.coo = _user('EDU-COO-T1', 'COO')
        self.designer = _user('EDU-DES-T1', 'DESIGNER')

        self.principal_a = _user('SCHA-ADMIN', 'SCHOOL_ADMIN', self.school_a)
        self.teacher_a = _user('SCHA-TE-001', 'TEACHER', self.school_a)
        self.parent_a = _user('SCHA-PA-0001', 'PARENT', self.school_a)
        self.principal_b = _user('SCHB-ADMIN', 'SCHOOL_ADMIN', self.school_b)
        self.teacher_b = _user('SCHB-TE-001', 'TEACHER', self.school_b)
        self.parent_b = _user('SCHB-PA-0001', 'PARENT', self.school_b)

    def _client(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def _post(self, user, **payload):
        body = {'title': payload.pop('title', 'Notice'), 'content': 'Body text', **payload}
        return self._client(user).post(CREATE, body, format='json')

    def _titles(self, user):
        response = self._client(user).get(FEED)
        self.assertEqual(response.status_code, 200, response.data)
        rows = response.data['results'] if isinstance(response.data, dict) else response.data
        return {row['title'] for row in rows}

    def _notified(self, announcement):
        return set(
            Notification.objects.filter(url=f'/dashboard/announcements/{announcement.id}')
            .values_list('recipient__matricule', flat=True)
        )

    # -- Executives other than the CEO -------------------------------------

    def test_cto_announcement_is_executive_only_and_never_reaches_schools(self):
        response = self._post(self.cto, title='CTO memo')
        self.assertEqual(response.status_code, 201, response.data)
        announcement = Announcement.objects.get(title='CTO memo')
        self.assertEqual(announcement.target, 'EXECUTIVE')
        self.assertIsNone(announcement.school_id)

        for executive in (self.ceo, self.coo, self.designer, self.cto):
            self.assertIn('CTO memo', self._titles(executive), executive.role)
        for school_user in (self.principal_a, self.teacher_a, self.parent_a, self.principal_b):
            self.assertNotIn('CTO memo', self._titles(school_user), school_user.role)

        notified = self._notified(announcement)
        self.assertEqual(notified, {self.ceo.matricule, self.coo.matricule, self.designer.matricule})

    def test_non_ceo_executives_only_have_the_executive_audience(self):
        for executive in (self.cto, self.coo, self.designer):
            data = self._client(executive).get(AUDIENCES).data
            self.assertEqual([t['value'] for t in data['targets']], ['EXECUTIVE'], executive.role)
            self.assertFalse(data['show_audience_picker'])
            self.assertFalse(data['can_choose_target_school'])

    def test_non_ceo_executive_cannot_address_schools(self):
        for target in ('ALL_SCHOOL_USERS', 'ALL_EDUIGNITE_USERS', 'PRINCIPAL', 'PARENT', 'TEACHER'):
            response = self._post(self.cto, title=f'try {target}', target=target)
            self.assertEqual(response.status_code, 400, (target, response.data))
        self.assertFalse(Announcement.objects.filter(title__startswith='try ').exists())

    # -- The CEO --------------------------------------------------------------

    def test_ceo_has_every_platform_audience(self):
        data = self._client(self.ceo).get(AUDIENCES).data
        self.assertEqual(
            [t['value'] for t in data['targets']],
            ['EXECUTIVE', 'ALL_SCHOOL_USERS', 'ALL_EDUIGNITE_USERS', 'PRINCIPAL', 'PARENT'],
        )
        self.assertTrue(data['show_audience_picker'])
        self.assertTrue(data['can_choose_target_school'])

    def test_ceo_all_school_users_reaches_schools_but_not_other_executives(self):
        self.assertEqual(self._post(self.ceo, title='To schools', target='ALL_SCHOOL_USERS').status_code, 201)
        for school_user in (self.principal_a, self.teacher_a, self.parent_a, self.teacher_b, self.parent_b):
            self.assertIn('To schools', self._titles(school_user), school_user.matricule)
        for executive in (self.cto, self.coo):
            self.assertNotIn('To schools', self._titles(executive), executive.role)
        self.assertIn('To schools', self._titles(self.ceo))

    def test_ceo_all_eduignite_users_reaches_everyone(self):
        self.assertEqual(self._post(self.ceo, title='To everyone', target='ALL_EDUIGNITE_USERS').status_code, 201)
        for person in (self.cto, self.coo, self.principal_a, self.teacher_b, self.parent_a):
            self.assertIn('To everyone', self._titles(person), person.matricule)

    def test_ceo_principal_audience_reaches_principals_only(self):
        self.assertEqual(self._post(self.ceo, title='Principals', target='PRINCIPAL').status_code, 201)
        self.assertIn('Principals', self._titles(self.principal_a))
        self.assertIn('Principals', self._titles(self.principal_b))
        for person in (self.teacher_a, self.parent_a, self.coo):
            self.assertNotIn('Principals', self._titles(person), person.matricule)

    def test_ceo_parent_announcement_for_one_school(self):
        response = self._post(self.ceo, title='Parents of Alpha', target='PARENT', target_school=self.school_a.id)
        self.assertEqual(response.status_code, 201, response.data)
        announcement = Announcement.objects.get(title='Parents of Alpha')

        self.assertIn('Parents of Alpha', self._titles(self.parent_a))
        for person in (self.parent_b, self.teacher_a, self.principal_a, self.coo):
            self.assertNotIn('Parents of Alpha', self._titles(person), person.matricule)
        self.assertEqual(self._notified(announcement), {self.parent_a.matricule})

    def test_target_school_is_only_valid_for_parent_announcements(self):
        response = self._post(self.ceo, title='Bad scope', target='PRINCIPAL', target_school=self.school_a.id)
        self.assertEqual(response.status_code, 400, response.data)

    # -- Grants ---------------------------------------------------------------

    def test_ceo_can_grant_an_executive_a_school_audience(self):
        grant = self._client(self.ceo).post(GRANTS, {'user': str(self.cto.id), 'audience': 'ALL_SCHOOL_USERS'}, format='json')
        self.assertEqual(grant.status_code, 201, grant.data)

        targets = [t['value'] for t in self._client(self.cto).get(AUDIENCES).data['targets']]
        self.assertEqual(targets, ['EXECUTIVE', 'ALL_SCHOOL_USERS'])
        self.assertEqual(self._post(self.cto, title='Granted', target='ALL_SCHOOL_USERS').status_code, 201)
        self.assertIn('Granted', self._titles(self.teacher_a))
        # The grant is exactly that audience and nothing more.
        self.assertEqual(self._post(self.cto, title='Not granted', target='PARENT').status_code, 400)

    def test_only_the_ceo_manages_grants(self):
        response = self._client(self.cto).post(GRANTS, {'user': str(self.coo.id), 'audience': 'PRINCIPAL'}, format='json')
        self.assertEqual(response.status_code, 403)
        self.assertFalse(AnnouncementAudienceGrant.objects.exists())

    # -- Schools --------------------------------------------------------------

    def test_school_announcement_stays_inside_its_school(self):
        self.assertEqual(self._post(self.principal_a, title='Staff meeting', target='TEACHER').status_code, 201)
        self.assertIn('Staff meeting', self._titles(self.teacher_a))
        self.assertIn('Staff meeting', self._titles(self.principal_a))
        for person in (self.parent_a, self.teacher_b, self.principal_b, self.ceo, self.cto):
            self.assertNotIn('Staff meeting', self._titles(person), person.matricule)

    def test_school_parent_announcement_reaches_only_that_schools_parents(self):
        announcement_response = self._post(self.principal_a, title='PTA', target='PARENT')
        self.assertEqual(announcement_response.status_code, 201)
        announcement = Announcement.objects.get(title='PTA')
        self.assertIn('PTA', self._titles(self.parent_a))
        for person in (self.parent_b, self.teacher_a):
            self.assertNotIn('PTA', self._titles(person), person.matricule)
        self.assertEqual(self._notified(announcement), {self.parent_a.matricule})

    def test_principal_cannot_use_platform_audiences(self):
        for target in ('ALL_SCHOOL_USERS', 'EXECUTIVE', 'ALL_EDUIGNITE_USERS', 'PRINCIPAL'):
            self.assertEqual(self._post(self.principal_a, title=target, target=target).status_code, 400, target)

    def test_principal_cannot_delete_a_ceo_announcement(self):
        self._post(self.ceo, title='Official', target='ALL_SCHOOL_USERS')
        announcement = Announcement.objects.get(title='Official')
        response = self._client(self.principal_a).delete(f'{CREATE}{announcement.id}/')
        self.assertEqual(response.status_code, 403)
        self.assertTrue(Announcement.objects.filter(pk=announcement.pk).exists())

    def test_teacher_cannot_create_platform_or_other_school_audiences(self):
        self.assertEqual(self._post(self.teacher_a, title='x', target='TEACHER').status_code, 400)
        self.assertEqual(self._post(self.teacher_a, title='Class notice', target='STUDENT').status_code, 201)


class AnnouncementRepairMigrationTests(TestCase):
    """The 0006 data migration applied to rows written under the old rules."""

    def setUp(self):
        self.migration = importlib.import_module('apps.announcements.migrations.0006_repair_announcement_audiences')
        self.school = School.objects.create(
            id='REPR', name='Repair School', short_name='REP', principal='P', location='Douala',
            email='repair@example.com', phone='237650700700', school_type='mixed', subsystem='bilingual',
        )
        self.ceo = _user('EDU-CEO-R1', 'CEO')
        self.cto = _user('EDU-CTO-R1', 'CTO')
        self.principal = _user('REPR-ADMIN', 'SCHOOL_ADMIN', self.school)

    def test_old_executive_announcement_is_made_executive_only_and_leaked_notification_removed(self):
        old = Announcement.objects.create(sender=self.cto, title='Old board memo', content='x', target='EXECUTIVE_BOARD')
        leaked = Notification.objects.create(
            recipient=self.principal, title='Announcement: Old board memo', message='x',
            notification_type='announcement', url=f'/dashboard/announcements/{old.id}',
        )
        kept = Notification.objects.create(
            recipient=self.ceo, title='Announcement: Old board memo', message='x',
            notification_type='announcement', url=f'/dashboard/announcements/{old.id}',
        )

        self.migration.repair(django_apps, None)

        old.refresh_from_db()
        self.assertEqual(old.target, 'EXECUTIVE')
        self.assertEqual(old.legacy_target, 'EXECUTIVE_BOARD')
        self.assertFalse(Notification.objects.filter(pk=leaked.pk).exists())
        self.assertTrue(Notification.objects.filter(pk=kept.pk).exists())

    def test_corrected_targets(self):
        corrected = self.migration._corrected_platform_target
        self.assertEqual(corrected('CEO', 'ALL'), 'ALL_EDUIGNITE_USERS')
        self.assertEqual(corrected('CEO', 'EXECUTIVE_BOARD'), 'EXECUTIVE')
        self.assertEqual(corrected('CEO', 'PARENT'), 'PARENT')
        self.assertEqual(corrected('CTO', 'ALL'), 'EXECUTIVE')
        self.assertEqual(corrected('COO', 'PARTNER'), 'EXECUTIVE')
