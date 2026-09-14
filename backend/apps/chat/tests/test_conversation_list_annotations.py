"""Regression tests for ConversationListSerializer's participant_count,
unread_count, and is_current_user_admin fields.

These used to call obj.participants.count() / a fresh
ConversationParticipant.objects.get() / obj.participant_records.filter(...)
per conversation, each bypassing the view's prefetch_related and issuing an
extra query. They now read from the already-prefetched participant_records/
participants caches -- this file pins down that the returned values are
still correct after that change, not just faster.
"""
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.chat.models import Conversation, ConversationParticipant, Message
from apps.schools.models import School


User = get_user_model()


class ConversationListAnnotationTests(APITestCase):
    def setUp(self):
        self.school = School.objects.create(
            id='CHAT-ANN', name='Chat Annotation Test School', short_name='CATS',
            principal='Principal Test', location='Kumba', email='chat-ann@example.com',
            phone='237655000000', school_type='general', subsystem='anglophone',
        )
        self.admin_user = User.objects.create_user(
            matricule='CHAT-ADM-001', name='Chat Admin', email='chat.admin@example.com',
            role='TEACHER', school=self.school, password='password123',
        )
        self.member_user = User.objects.create_user(
            matricule='CHAT-MEM-001', name='Chat Member', email='chat.member@example.com',
            role='TEACHER', school=self.school, password='password123',
        )
        self.conversation = Conversation.objects.create(
            conversation_type='group', name='Staff Room', school=self.school, created_by=self.admin_user,
        )
        ConversationParticipant.objects.create(conversation=self.conversation, user=self.admin_user, role='admin')
        ConversationParticipant.objects.create(conversation=self.conversation, user=self.member_user, role='member')
        Message.objects.create(conversation=self.conversation, sender=self.admin_user, text='Welcome!')
        Message.objects.create(conversation=self.conversation, sender=self.admin_user, text='Second message')

    def test_participant_count_and_admin_flag_and_unread_count(self):
        self.client.force_authenticate(self.member_user)

        response = self.client.get('/api/v1/chat/conversations/')

        self.assertEqual(response.status_code, 200)
        results = response.data['results'] if isinstance(response.data, dict) else response.data
        row = next(r for r in results if r['id'] == str(self.conversation.id))

        self.assertEqual(row['participant_count'], 2)
        self.assertFalse(row['is_current_user_admin'])
        # member_user never marked anything read, and didn't send either message.
        self.assertEqual(row['unread_count'], 2)

    def test_admin_participant_sees_their_own_admin_flag(self):
        self.client.force_authenticate(self.admin_user)

        response = self.client.get('/api/v1/chat/conversations/')

        results = response.data['results'] if isinstance(response.data, dict) else response.data
        row = next(r for r in results if r['id'] == str(self.conversation.id))
        self.assertTrue(row['is_current_user_admin'])
        # admin_user sent both messages -- excluded from their own unread count.
        self.assertEqual(row['unread_count'], 0)

    def test_unread_count_respects_last_read_at(self):
        participant = ConversationParticipant.objects.get(conversation=self.conversation, user=self.member_user)
        participant.last_read_at = timezone.now()
        participant.save(update_fields=['last_read_at'])
        Message.objects.create(conversation=self.conversation, sender=self.admin_user, text='After read')

        self.client.force_authenticate(self.member_user)
        response = self.client.get('/api/v1/chat/conversations/')

        results = response.data['results'] if isinstance(response.data, dict) else response.data
        row = next(r for r in results if r['id'] == str(self.conversation.id))
        self.assertEqual(row['unread_count'], 1)
