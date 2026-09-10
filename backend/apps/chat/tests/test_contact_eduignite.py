"""Tests for the "always available" EduIgnite Companion -> EduIgnite chat
channel -- see ContactEduIgniteView and ChatAppOrSupportConversation in
apps/chat/views.py, and the SCHOOL_SUPPORT_ROLES founder-access fix in
apps/chat/relations.py.

Real production bug this covers: a school that never installed the optional
'chat' marketplace app got a 403 trying to message EduIgnite from the
Companion app at all -- and even for a school that HAD installed it, only a
SCHOOL_ADMIN session (not SUB_ADMIN/BURSAR/LIBRARIAN) ever saw EduIgnite in
their contact list. Follows this backend's existing convention (see
apps/academy/tests/test_academy.py, apps/offline_licensing/tests/
test_offline_licensing.py): plain TestCase + DRF's APIClient with
force_authenticate, no factory_boy.
"""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.chat.models import Conversation
from apps.chat.relations import get_related_user_ids
from apps.schools.models import School

User = get_user_model()


def _make_school(school_id='SCH-CHAT1'):
    return School.objects.create(
        id=school_id,
        name=f'{school_id} Secondary School',
        short_name=school_id,
        principal='Test Principal',
        location='Buea',
        email=f'{school_id.lower()}@example.com',
        phone='237654000000',
    )


def _make_user(matricule, role, school=None, name=None):
    return User.objects.create_user(
        matricule=matricule,
        name=name or matricule,
        email=f'{matricule.lower()}@example.com',
        role=role,
        school=school,
        password='pass12345',
    )


class ContactEduIgniteTests(TestCase):
    """POST /api/v1/chat/contact-eduignite/ -- must always succeed for a
    school-support user regardless of the 'chat' app entitlement, and never
    favor one founder over the other."""

    def setUp(self):
        self.school = _make_school()
        self.ceo = _make_user('EDU-CEO-0001', 'CEO')
        self.cto = _make_user('EDU-CTO-0001', 'CTO')
        self.admin = _make_user('SCH-CHAT1-ADM', 'SCHOOL_ADMIN', school=self.school)
        self.client = APIClient()

    def test_school_without_chat_app_can_still_contact_eduignite(self):
        # Deliberately grant no registry install for 'chat' -- this is the
        # exact real-world state of a school that never opted into the
        # optional chat marketplace app.
        self.client.force_authenticate(self.admin)
        res = self.client.post('/api/v1/chat/contact-eduignite/')
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)

        conversation_id = res.data['id']
        conversation = Conversation.objects.get(id=conversation_id)
        self.assertEqual(conversation.conversation_type, 'support')
        participant_ids = set(conversation.participants.values_list('id', flat=True))
        self.assertIn(self.admin.id, participant_ids)
        # Founder parity: both CEO and CTO are participants, never just one.
        self.assertIn(self.ceo.id, participant_ids)
        self.assertIn(self.cto.id, participant_ids)

    def test_repeat_calls_reuse_the_same_conversation(self):
        self.client.force_authenticate(self.admin)
        first = self.client.post('/api/v1/chat/contact-eduignite/')
        second = self.client.post('/api/v1/chat/contact-eduignite/')
        self.assertEqual(first.data['id'], second.data['id'])
        self.assertEqual(Conversation.objects.filter(conversation_type='support').count(), 1)

    def test_sub_admin_bursar_librarian_all_get_founders_in_related_users(self):
        # Before the relations.py fix, only SCHOOL_ADMIN's branch added
        # PRIMARY_FOUNDER_ROLES -- every other school-support role got an
        # empty (founder-less) related-users set.
        for role in ('SUB_ADMIN', 'BURSAR', 'LIBRARIAN'):
            user = _make_user(f'SCH-CHAT1-{role}', role, school=self.school)
            related_ids = get_related_user_ids(user)
            self.assertIn(str(self.ceo.id), related_ids, f'{role} should see the CEO')
            self.assertIn(str(self.cto.id), related_ids, f'{role} should see the CTO')

    def test_unauthenticated_request_is_rejected(self):
        res = self.client.post('/api/v1/chat/contact-eduignite/')
        self.assertIn(res.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))


class SupportConversationMessagingTests(TestCase):
    """Once a support conversation exists, sending and listing messages in
    it must also bypass the ordinary RequiresApp('chat') gate -- this is the
    ChatAppOrSupportConversation.has_permission carve-out (list/create never
    reach has_object_permission, since DRF only calls that for
    retrieve/update/destroy/detail actions)."""

    def setUp(self):
        self.school = _make_school('SCH-CHAT2')
        self.ceo = _make_user('EDU-CEO-0002', 'CEO')
        self.admin = _make_user('SCH-CHAT2-ADM', 'SCHOOL_ADMIN', school=self.school)
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        created = self.client.post('/api/v1/chat/contact-eduignite/')
        self.conversation_id = created.data['id']

    def test_send_and_list_messages_without_chat_app_installed(self):
        send = self.client.post(
            '/api/v1/chat/messages/',
            {'conversation_id': self.conversation_id, 'text': 'Hello EduIgnite'},
            format='json',
        )
        self.assertEqual(send.status_code, status.HTTP_201_CREATED, send.data)

        listed = self.client.get(f'/api/v1/chat/messages/?conversation_id={self.conversation_id}')
        self.assertEqual(listed.status_code, status.HTTP_200_OK, listed.data)

    def test_ordinary_conversation_still_requires_chat_app(self):
        # Regression guard: the carve-out must be scoped to 'support'
        # conversations specifically -- an ORDINARY conversation must still
        # be blocked for a school without the 'chat' app, same as before
        # this change.
        other_admin = _make_user('SCH-CHAT2-ADM2', 'SCHOOL_ADMIN', school=self.school)
        ordinary = Conversation.objects.create(
            name='Ordinary chat', conversation_type='direct', school=self.school,
            created_by=self.admin,
        )
        ordinary.add_participant(self.admin, role='member')
        ordinary.add_participant(other_admin, role='member')

        send = self.client.post(
            '/api/v1/chat/messages/',
            {'conversation_id': str(ordinary.id), 'text': 'Should be blocked'},
            format='json',
        )
        self.assertEqual(send.status_code, status.HTTP_403_FORBIDDEN, send.data)
