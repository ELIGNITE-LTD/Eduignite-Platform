"""Emails for school account requests and school activation.

Uses the platform's one email path, ``core.email_service.send_transactional_email``
(Brevo), through three approved events. Rules every function here follows:

* sent only after the database transaction commits (``transaction.on_commit``);
* never raises: a failed send is logged and the request/activation goes on;
* sent at most once per event and recipient: the unique key in
  ``EmailNotificationLog`` is claimed before sending (retries and double clicks
  find it taken); a failed send releases the claim so it can be retried;
* user-supplied text is HTML-escaped by the shared layout helpers and stripped
  of line breaks before it reaches a subject line;
* a password is never put in an email. Sign-in is by matricule with the
  password the requester was given, or "Forgot password" for a fresh one.

Bodies are English followed by French.
"""

import logging
import re

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils.html import escape

from core import email_service
from core.email_service import EmailEvent

from .models import EmailNotificationLog, Order

logger = logging.getLogger(__name__)

BRAND = 'EduIgnite'
EXECUTIVE_ROLES = ('CEO', 'CTO')


# -- helpers ----------------------------------------------------------------


def _clean(value, limit=120):
    """Single-line, trimmed text, safe for a subject line or header."""
    return re.sub(r'[\r\n\t\x00-\x1f]+', ' ', str(value or '')).strip()[:limit]


def _deliverable(email):
    return email_service._is_deliverable_email(email)


def executive_recipients():
    """Emails of the CEO and CTO, plus (or instead, see settings) EXECUTIVE_NOTIFY_EMAILS."""
    from django.contrib.auth import get_user_model

    extra = [e.strip() for e in (getattr(settings, 'EXECUTIVE_NOTIFY_EMAILS', None) or []) if e and e.strip()]
    found = []
    if not (extra and getattr(settings, 'EXECUTIVE_NOTIFY_EMAILS_ONLY', False)):
        User = get_user_model()
        found = list(
            User.objects.filter(role__in=EXECUTIVE_ROLES, is_active=True)
            .exclude(email='').values_list('email', flat=True)
        )
    out, seen = [], set()
    for email in [*found, *extra]:
        email = email.strip()
        if _deliverable(email) and email.lower() not in seen:
            seen.add(email.lower())
            out.append(email)
    return out


def _send_once(key, event, to_email, to_name, subject, html, text):
    """Send one email at most once per ``key``. Returns True when it was sent now."""
    try:
        if not _deliverable(to_email):
            return False
        try:
            with transaction.atomic():
                log = EmailNotificationLog.objects.create(key=key[:190], event=event.value, recipient=to_email[:254])
        except IntegrityError:
            return False  # already sent (or being sent) for this event
        try:
            ok = email_service.send_transactional_email(
                event=event, to_email=to_email, to_name=_clean(to_name) or to_email,
                subject=_clean(subject, 200), html=html, text=text, sender_name=BRAND,
            )
        except Exception:  # noqa: BLE001 - email must never break the business action
            logger.exception('Account-request email failed: %s to %s', event.value, to_email)
            ok = False
        if not ok:
            log.delete()  # release the claim so a later retry can send it
        return bool(ok)
    except Exception:  # noqa: BLE001
        logger.exception('Account-request email could not be processed: %s', key)
        return False


def _after_commit(fn, *args):
    def run():
        try:
            fn(*args)
        except Exception:  # noqa: BLE001
            logger.exception('Account-request notification failed: %s', getattr(fn, '__name__', fn))

    transaction.on_commit(run)


def _page(title, intro_en, intro_fr, rows, button=None, footer_en='', footer_fr=''):
    from core.email_service import _button, _details_table, _layout

    parts = [
        f'<p style="font-size:15px;line-height:1.7;margin-top:0;">{escape(intro_en)}</p>',
        _details_table(rows),
    ]
    if button:
        parts.append(_button(*button))
    if footer_en:
        parts.append(f'<p style="font-size:14px;line-height:1.7;">{escape(footer_en)}</p>')
    parts.append('<hr style="border:none;border-top:1px solid #dce7f0;margin:22px 0;">')
    parts.append(f'<p style="font-size:15px;line-height:1.7;">{escape(intro_fr)}</p>')
    if footer_fr:
        parts.append(f'<p style="font-size:14px;line-height:1.7;">{escape(footer_fr)}</p>')
    return _layout(title, title, ''.join(parts), BRAND)


def _text(*lines):
    return '\n'.join(line for line in lines if line)


def _schools_link():
    return email_service._front_end_url('/dashboard/schools?status=pending')


def _login_link():
    return email_service._front_end_url('/login')


# -- 1. a request arrives ---------------------------------------------------


def _notify_executives(key_prefix, rows, school_name, kind_en):
    recipients = executive_recipients()
    subject = f'New school request: {_clean(school_name, 100)}'
    html = _page(
        'New school request / Nouvelle demande d\'ecole',
        f'A new {kind_en} is waiting for your review.',
        'Une nouvelle demande est en attente de votre examen.',
        rows,
        button=('Open pending schools', _schools_link()),
    )
    text = _text(
        f'A new {kind_en} is waiting for review: {_clean(school_name)}.',
        *[f'{label}: {_clean(value, 200)}' for label, value in rows if value],
        f'Review: {_schools_link()}',
        'Une nouvelle demande est en attente de votre examen.',
    )
    for email in recipients:
        _send_once(f'{key_prefix}:exec:{email.lower()}', EmailEvent.SCHOOL_REQUEST_RECEIVED, email,
                   'EduIgnite executive', subject, html, text)


def _acknowledge(key, to_email, to_name, school_name):
    subject = 'We received your EduIgnite request / Demande bien recue'
    html = _page(
        'Request received / Demande recue',
        f'Hello {_clean(to_name)}, we received your request for {_clean(school_name)}. '
        'Our team will review it and contact you. Once your school account is created you will '
        'receive another email with your login details.',
        f'Bonjour {_clean(to_name)}, nous avons bien recu votre demande pour {_clean(school_name)}. '
        'Notre equipe va l\'examiner et vous contacter. Des que le compte de votre ecole sera cree, '
        'vous recevrez un nouvel email avec vos informations de connexion.',
        [('School / Ecole', _clean(school_name))],
    )
    text = _text(
        f'Hello {_clean(to_name)}, we received your request for {_clean(school_name)}.',
        'Our team will review it and contact you. You will get another email when your account is created.',
        f'Bonjour, nous avons bien recu votre demande pour {_clean(school_name)}. Nous vous contacterons.',
    )
    _send_once(key, EmailEvent.SCHOOL_REQUEST_ACK, to_email, to_name, subject, html, text)


def send_order_received(order_id):
    order = Order.objects.filter(pk=order_id).first()
    if not order:
        return
    rows = [
        ('School / Ecole', _clean(order.school_name)),
        ('Type', 'School account request'),
        ('Contact person', _clean(order.full_name)),
        ('Role', _clean(order.occupation)),
        ('Phone / WhatsApp', _clean(order.whatsapp_number, 40)),
        ('Email', _clean(order.email, 254)),
        ('Location', _clean(', '.join(p for p in (order.sub_division, order.division, order.region) if p), 200)),
    ]
    _notify_executives(f'order:{order.pk}:received', rows, order.school_name, 'school account request')
    _acknowledge(f'order:{order.pk}:ack', order.email, order.full_name, order.school_name)


def send_order_processed(order_id):
    order = Order.objects.filter(pk=order_id).first()
    if not order or order.status != 'processed':
        return
    html = _page(
        'Your school account is ready / Votre compte est pret',
        f'Hello {_clean(order.full_name)}, your EduIgnite school account for {_clean(order.school_name)} '
        'has been created. Your login matricule and the first sign-in steps are sent to the school\'s '
        'official email address. Sign in with your matricule and password, or use "Forgot password" '
        'on the login page to choose a new one.',
        f'Bonjour {_clean(order.full_name)}, le compte EduIgnite de {_clean(order.school_name)} a ete cree. '
        'Votre matricule et les premieres etapes de connexion sont envoyes a l\'adresse officielle de '
        'l\'ecole. Connectez-vous avec votre matricule, ou utilisez "Mot de passe oublie" pour en choisir un nouveau.',
        [('School / Ecole', _clean(order.school_name))],
        button=('Open EduIgnite login', _login_link()),
    )
    text = _text(
        f'Your EduIgnite school account for {_clean(order.school_name)} has been created.',
        f'Sign in: {_login_link()} (use "Forgot password" to choose a password).',
        'Votre compte EduIgnite a ete cree. Utilisez "Mot de passe oublie" pour choisir un mot de passe.',
    )
    _send_once(f'order:{order.pk}:processed', EmailEvent.SCHOOL_ACCOUNT_ACTIVATED, order.email, order.full_name,
               f'Your EduIgnite account is ready / Compte pret: {_clean(order.school_name, 80)}', html, text)


def notify_order_received(order_id):
    _after_commit(send_order_received, order_id)


def notify_order_processed(order_id):
    _after_commit(send_order_processed, order_id)


# -- 2. the school is activated --------------------------------------------


def send_school_activated(school_id, requester_id=None):
    from django.contrib.auth import get_user_model

    from apps.schools.models import School

    User = get_user_model()
    school = School.objects.select_related('principal_user').filter(pk=school_id).first()
    if not school or school.is_drafted:
        return
    admin = school.principal_user
    requester = User.objects.filter(pk=requester_id).first() if requester_id else None
    matricule = getattr(admin, 'matricule', '') or ''
    rows = [('School / Ecole', _clean(school.name)), ('Login matricule / Matricule', _clean(matricule, 60))]
    html = _page(
        'Your school is active / Votre ecole est active',
        f'{_clean(school.name)} has been activated on EduIgnite. Sign in with the matricule below and the '
        'temporary password you received when the school was created; you will be asked to choose your own. '
        'If you no longer have it, use "Forgot password" on the login page.',
        f'{_clean(school.name)} a ete activee sur EduIgnite. Connectez-vous avec le matricule ci-dessus et le '
        'mot de passe temporaire recu a la creation; vous devrez en choisir un nouveau. '
        'Sinon, utilisez "Mot de passe oublie" sur la page de connexion.',
        rows,
        button=('Open EduIgnite login', _login_link()),
    )
    text = _text(
        f'{_clean(school.name)} has been activated on EduIgnite.',
        f'Login matricule: {_clean(matricule, 60)}',
        f'Sign in: {_login_link()} (use "Forgot password" if you no longer have your temporary password).',
        'Votre ecole est active. Utilisez "Mot de passe oublie" si besoin.',
    )
    subject = f'Your school is active on EduIgnite / Ecole activee: {_clean(school.name, 80)}'
    sent_to = set()
    for email, name in ((getattr(requester, 'email', ''), getattr(requester, 'name', '')),
                        (getattr(admin, 'email', ''), getattr(admin, 'name', '')),
                        (school.email, school.principal)):
        if email and email.lower() not in sent_to and _deliverable(email):
            sent_to.add(email.lower())
            _send_once(f'school:{school.pk}:activated:{email.lower()}', EmailEvent.SCHOOL_ACCOUNT_ACTIVATED,
                       email, name or school.name, subject, html, text)


def notify_school_activated(school_id, requester_id=None):
    _after_commit(send_school_activated, school_id, requester_id)


# -- 3. proprietor accounts (apps.proprietors) --------------------------------
#
# Neither email below ever contains a password.


def send_proprietor_account_created(proprietor_id):
    from django.contrib.auth import get_user_model

    proprietor = get_user_model().objects.filter(pk=proprietor_id, role='PROPRIETOR').first()
    if not proprietor:
        return
    rows = [('Name', _clean(proprietor.name)), ('Role', 'Proprietor'),
            ('Login matricule / Matricule', _clean(proprietor.matricule, 60))]
    html = _page(
        'Your EduIgnite proprietor account / Votre compte proprietaire',
        'An EduIgnite proprietor account has been created for you. You will be able to follow the schools '
        'linked to you. Sign in with the matricule below and the temporary password the EduIgnite team gave you; '
        'you will be asked to choose your own password.',
        'Un compte proprietaire EduIgnite a ete cree pour vous. Connectez-vous avec le matricule ci-dessus et le '
        'mot de passe temporaire remis par l\'equipe EduIgnite; vous devrez en choisir un nouveau.',
        rows,
        button=('Open EduIgnite login', _login_link()),
        footer_en='If you do not have the temporary password, use "Forgot password" on the login page.',
        footer_fr='Sinon, utilisez "Mot de passe oublie" sur la page de connexion.',
    )
    text = _text(
        'An EduIgnite proprietor account has been created for you.',
        f'Login matricule: {_clean(proprietor.matricule, 60)}',
        f'Sign in: {_login_link()} (use "Forgot password" if you were not given the temporary password).',
        'Votre compte proprietaire EduIgnite a ete cree.',
    )
    _send_once(f'proprietor:{proprietor.pk}:created', EmailEvent.PROPRIETOR_ACCOUNT_CREATED, proprietor.email,
               proprietor.name, 'Your EduIgnite proprietor account / Votre compte proprietaire', html, text)


def notify_proprietor_account_created(proprietor_id):
    _after_commit(send_proprietor_account_created, proprietor_id)


def send_admin_credentials_changed(log_id, recipients):
    """Tell a school administrator a proprietor changed their login details.

    ``recipients`` is a list of addresses (the current one and, when the email
    was changed, the OLD one too so a hijack is noticed). One send per
    address per audit row.
    """
    from apps.proprietors.models import ProprietorActionLog

    log = (ProprietorActionLog.objects.select_related('proprietor', 'school', 'target_user')
           .filter(pk=log_id, action=ProprietorActionLog.ACTION_CREDENTIALS_RESET).first())
    if not log or not log.target_user or not log.proprietor:
        return
    admin, proprietor, school = log.target_user, log.proprietor, log.school
    school_name = _clean(getattr(school, 'name', ''))
    rows = [
        ('School / Ecole', school_name),
        ('Changed by / Modifie par', _clean(f'{proprietor.name} (proprietor / proprietaire)', 200)),
        ('What changed / Modifications', _clean(log.detail.replace('changed: ', ''), 200)),
        ('Your matricule (unchanged) / Votre matricule', _clean(admin.matricule, 60)),
    ]
    html = _page(
        'Your login details were changed / Vos informations de connexion ont change',
        f'The proprietor of {school_name} changed your EduIgnite login details. Your matricule stays the same. '
        'Ask the proprietor for your new temporary password; you may be asked to choose your own at next sign-in. '
        'Any session you had open was closed.',
        f'Le proprietaire de {school_name} a modifie vos informations de connexion EduIgnite. Votre matricule '
        'reste le meme. Demandez-lui votre nouveau mot de passe temporaire. Vos sessions ouvertes ont ete fermees.',
        rows,
        button=('Open EduIgnite login', _login_link()),
        footer_en='If you did not expect this change, contact EduIgnite support.',
        footer_fr='Si ce changement est inattendu, contactez le support EduIgnite.',
    )
    text = _text(
        f'The proprietor of {school_name} changed your EduIgnite login details ({_clean(log.detail, 200)}).',
        f'Your matricule is unchanged: {_clean(admin.matricule, 60)}. Any open session was closed.',
        'If you did not expect this, contact EduIgnite support.',
        'Le proprietaire de votre ecole a modifie vos informations de connexion.',
    )
    for email in sorted({e.strip() for e in recipients if e}):
        _send_once(f'admin-creds:{log.pk}:{email.lower()}', EmailEvent.ADMIN_CREDENTIALS_CHANGED, email,
                   admin.name, 'Your EduIgnite login details were changed / Informations de connexion modifiees',
                   html, text)


def notify_admin_credentials_changed(log_id, recipients):
    _after_commit(send_admin_credentials_changed, log_id, list(recipients))
