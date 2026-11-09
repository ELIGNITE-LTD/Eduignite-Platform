"""Tell a school's administrators what staff did to their public website.

An in-app notification is created in the same transaction as the action; the
email goes out after commit through the platform's approved-event path
(apps.orders.api building blocks: escaped, idempotent per event and recipient,
never raises). No password, token or contact detail beyond the staff member's
name and department is included.
"""

import logging

from django.contrib.auth import get_user_model

from apps.notifications.models import NotificationPriority, NotificationType
from apps.notifications.services import create_notification
from apps.orders import api as orders_api
from core import email_service
from core.email_service import EmailEvent

from .models import OversightAction

logger = logging.getLogger(__name__)
PAGE = '/dashboard/school-website'

# action -> (english headline, french headline)
HEADLINES = {
    OversightAction.BLOCK: ('Your school website was blocked', 'Le site web de votre ecole a ete bloque'),
    OversightAction.UNBLOCK: ('Your school website block was lifted',
                              'Le blocage du site web de votre ecole est leve'),
    OversightAction.STEPS_UPDATED: ('Update: what to do to resolve the website block',
                                    "Mise a jour : ce qu'il faut faire pour lever le blocage du site"),
    OversightAction.PUBLISH: ('Your school website was published by EduIgnite staff',
                              "Le site web de votre ecole a ete publie par l'equipe EduIgnite"),
    OversightAction.UNPUBLISH: ('Your school website was taken offline by EduIgnite staff',
                                "Le site web de votre ecole a ete mis hors ligne par l'equipe EduIgnite"),
    OversightAction.EDIT: ('EduIgnite staff edited your school website',
                           "L'equipe EduIgnite a modifie le site web de votre ecole"),
    OversightAction.DELETE_CONTENT: ('EduIgnite staff removed content from your school website',
                                     "L'equipe EduIgnite a supprime du contenu de votre site web"),
}


def school_admins(school):
    User = get_user_model()
    return list(User.objects.filter(school=school, role__in=['SCHOOL_ADMIN', 'SUB_ADMIN'], is_active=True))


def _next_step(event, case):
    if event.action == OversightAction.UNBLOCK:
        restored = (case.restored_status if case else '') or 'unpublished'
        if restored == 'published':
            return 'Your site is live again.', 'Votre site est de nouveau en ligne.'
        return (f'The block is lifted. Your site stays as it was before ({restored}).',
                "Le blocage est leve. Votre site reste dans son etat precedent.")
    if case and case.state == 'open':
        return ('Your site is offline until the issue is resolved. Follow the steps above, then contact Customer Care.',
                "Votre site est hors ligne jusqu'a la resolution du probleme. Suivez les etapes ci-dessus "
                "puis contactez le service client.")
    return ('You can review the change on your School Website page.',
            "Vous pouvez consulter la modification sur la page Site web de l'ecole.")


def _steps_for(event, case):
    return event.resolution_steps or (case.resolution_steps if case and case.state == 'open' else '')


def _summary(event, case):
    clean = orders_api.clean_line
    en, _ = HEADLINES[event.action]
    parts = [f'{en}. By {clean(event.actor_name, 80)} ({clean(event.actor_department, 60)}).',
             f'Reason: {clean(event.reason, 500)}']
    steps = _steps_for(event, case)
    if steps:
        parts.append(f'What to do: {clean(steps, 500)}')
    return ' '.join(parts)


def notify_school_admins(event, case):
    """In-app now (same transaction), email after commit. Never raises."""
    try:
        en, _fr = HEADLINES[event.action]
        priority = NotificationPriority.HIGH if event.action in (
            OversightAction.BLOCK, OversightAction.STEPS_UPDATED) else NotificationPriority.NORMAL
        summary = _summary(event, case)
        for admin in school_admins(event.school):
            create_notification(recipient=admin, title=en, message=summary, sender=event.actor,
                                notification_type=NotificationType.PLATFORM, priority=priority,
                                icon='globe', url=PAGE)
        orders_api.after_commit(send_emails, str(event.pk))
    except Exception:  # noqa: BLE001 - notifying must never break the action
        logger.exception('Site oversight notification failed for event %s', getattr(event, 'pk', None))


def send_emails(event_id):
    from .models import SiteOversightEvent

    event = SiteOversightEvent.objects.select_related('school', 'case').filter(pk=event_id).first()
    if not event:
        return
    clean = orders_api.clean_line
    case = event.case
    en, fr = HEADLINES[event.action]
    next_en, next_fr = _next_step(event, case)
    school_name = clean(event.school.name)
    steps = _steps_for(event, case)
    rows = [
        ('School / Ecole', school_name),
        ('Action', clean(en, 200)),
        ('By / Par', clean(f'{event.actor_name} - {event.actor_department}', 200)),
        ('Reason / Motif', event.reason),
        ('What you must do / A faire', steps),
        ('What happens next / Suite', f'{next_en} / {next_fr}'),
    ]
    link = email_service._front_end_url(PAGE)
    html = orders_api.email_page(
        f'{en} / {fr}',
        f'{en}. Details are below.', f'{fr}. Les details sont ci-dessous.', rows,
        button=('Open School Website', link),
    )
    text = orders_api.email_text(
        f'{en} ({school_name}).',
        f'By: {clean(event.actor_name, 80)} ({clean(event.actor_department, 60)})',
        f'Reason: {clean(event.reason, 1000)}',
        f'What to do: {clean(steps, 1000)}' if steps else '',
        next_en, f'Open: {link}', fr, next_fr,
    )
    for admin in school_admins(event.school):
        if admin.email:
            orders_api.send_once(f'site-oversight:{event.pk}:{admin.pk}', EmailEvent.SITE_OVERSIGHT_NOTICE,
                                 admin.email, admin.name, f'{en} / {fr}', html, text)
