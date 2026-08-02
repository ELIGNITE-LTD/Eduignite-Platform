from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.users.tasks import process_draft_deletion_lifecycle


User = get_user_model()


class DraftLifecycleTaskTests(TestCase):
    def test_draft_lifecycle_sends_monthly_reminder_email(self):
        now = timezone.now()
        user = User.objects.create_user(
            matricule='DRAFT-REM-001',
            name='Draft Reminder User',
            email='draft.reminder@example.com',
            role='TEACHER',
            password='password123',
            is_active=False,
            is_drafted=True,
            drafted_at=now - timedelta(days=31),
            draft_delete_after=now + timedelta(days=120),
            draft_reason='Temporary school cleanup.',
        )

        with patch('core.email_service.send_draft_lifecycle_email', return_value=True) as email_mock:
            result = process_draft_deletion_lifecycle.run()

        user.refresh_from_db()
        self.assertIn('user_reminders=1', result)
        self.assertEqual(user.draft_reminder_count, 1)
        self.assertIsNotNone(user.draft_last_reminder_at)
        email_mock.assert_called_once()
        self.assertEqual(email_mock.call_args.kwargs['subject'], 'EduIgnite Draft account reminder')

    def test_draft_lifecycle_notifies_then_permanently_deletes_expired_user(self):
        now = timezone.now()
        user = User.objects.create_user(
            matricule='DRAFT-DEL-001',
            name='Draft Delete User',
            email='draft.delete@example.com',
            role='TEACHER',
            password='password123',
            is_active=False,
            is_drafted=True,
            drafted_at=now - timedelta(days=190),
            draft_delete_after=now - timedelta(days=1),
            draft_reason='Six-month draft retention expired.',
            draft_reminder_count=6,
        )

        with patch('core.email_service.send_draft_lifecycle_email', return_value=True) as email_mock:
            result = process_draft_deletion_lifecycle.run()

        self.assertIn('deleted_users=1', result)
        self.assertFalse(User.objects.filter(id=user.id).exists())
        email_mock.assert_called_once()
        self.assertEqual(email_mock.call_args.kwargs['subject'], 'EduIgnite account permanently deleted')
