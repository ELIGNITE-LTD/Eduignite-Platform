"""Small helpers to fan out in-app notifications for user-facing actions."""

import io
import json
import os

from .models import Notification

_FIREBASE_READY = None


def _firebase():
    """Lazily initialise firebase-admin from the FIREBASE_SERVICE_ACCOUNT_JSON
    environment variable. Returns the messaging module or None."""
    global _FIREBASE_READY
    if _FIREBASE_READY is not None:
        return _FIREBASE_READY or None
    try:
        raw = os.environ.get('FIREBASE_SERVICE_ACCOUNT_JSON', '')
        if not raw:
            # Deploy-friendly fallback: a git-ignored JSON file dropped on the
            # server (backend/firebase-service-account.json).
            from django.conf import settings as dj_settings

            candidate = os.path.join(str(dj_settings.BASE_DIR), 'firebase-service-account.json')
            if os.path.exists(candidate):
                raw = io.open(candidate, encoding='utf-8').read()
        if not raw:
            _FIREBASE_READY = False
            return None
        import firebase_admin
        from firebase_admin import credentials, messaging

        if not firebase_admin._apps:
            firebase_admin.initialize_app(credentials.Certificate(json.loads(raw)))
        _FIREBASE_READY = messaging
        return messaging
    except Exception:  # noqa: BLE001
        _FIREBASE_READY = False
        return None


def _send_fcm(recipients, title, message):
    """Real device push (works even when the app is closed) to every active
    registered device of the recipients. Never raises."""
    try:
        messaging = _firebase()
        if not messaging:
            return
        from .models import NotificationDevice

        tokens = list(
            NotificationDevice.objects.filter(
                user__in=[r for r in recipients if r is not None], active=True
            ).values_list('token', flat=True)[:500]
        )
        if not tokens:
            return
        msg = messaging.MulticastMessage(
            notification=messaging.Notification(title=title[:100], body=message[:200]),
            tokens=tokens,
        )
        response = messaging.send_each_for_multicast(msg)
        # Deactivate dead tokens so the table stays clean.
        dead = [tokens[i] for i, r in enumerate(response.responses) if not r.success]
        if dead:
            NotificationDevice.objects.filter(token__in=dead).update(active=False)
    except Exception:  # noqa: BLE001
        pass


def _expand_with_parents(recipients):
    """Every notification for a student is mirrored to that student's linked
    parents/guardians, so parents stay informed about their children."""
    try:
        from apps.students import api as students_api

        student_users = [r for r in recipients if r is not None and getattr(r, 'role', None) == 'STUDENT']
        if not student_users:
            return recipients
        student_ids = list(
            students_api.list_students().filter(user__in=student_users).values_list('id', flat=True)
        )
        guardians_by_student = students_api.get_guardian_users_by_student(student_ids)
        parents = {
            parent.id: parent
            for guardians in guardians_by_student.values()
            for parent in guardians
        }.values()
        if not parents:
            return recipients
        seen = {getattr(r, 'id', None) for r in recipients}
        return list(recipients) + [p for p in parents if p.id not in seen]
    except Exception:  # noqa: BLE001
        return recipients


def notify_users(recipients, title, message, notification_type='platform', sender=None,
                 mirror_to_parents=True):
    """Bulk-create a notification for each recipient (and their parents, when
    a recipient is a student). Never raises — a notification failure must not
    break the action that triggered it.

    Set ``mirror_to_parents=False`` when the caller sends the parents their own,
    separately worded message. The default mirror copies the recipient's text
    verbatim, so a learner-addressed "You have been promoted…" would otherwise
    reach the parent worded as if they were the child.
    """
    try:
        if mirror_to_parents:
            recipients = _expand_with_parents(recipients)
        rows = [
            Notification(
                recipient=recipient,
                sender=sender,
                title=title[:255],
                message=message,
                notification_type=notification_type,
            )
            for recipient in recipients
            if recipient is not None and (sender is None or recipient.id != sender.id)
        ]
        if rows:
            Notification.objects.bulk_create(rows, batch_size=500)
            _send_fcm([row.recipient for row in rows], title, message)
    except Exception:  # noqa: BLE001
        pass
