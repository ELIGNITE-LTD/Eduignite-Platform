"""Outreach logic: CSV import, queueing, rendering and the paced sender.

Pacing is deliberate. A new sender that mails hundreds of strangers in a day is
flagged as spam and then none of EduIgnite's email (password resets, receipts)
arrives. So a founder can queue any number of schools at once; the sender
delivers at most ``OUTREACH_DAILY_CAP`` per day and carries on the next day.
"""

import csv
import html
import io
import logging
import re
import unicodedata
from datetime import timedelta

from django.conf import settings
from django.core.validators import validate_email
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone

from core.email_service import EmailEvent, send_transactional_email

from .models import (
    CampaignStatus, ContactStatus, Level, OutreachCampaign, OutreachContact, OutreachSend, Region, SendStatus,
)

logger = logging.getLogger(__name__)

MAX_IMPORT_ROWS = 5000
MAX_BATCH_SELECT = 5000
SAFE_CAP_CEILING = 500  # a configured cap above this is clamped

# --------------------------------------------------------------------------
# Normalisers: accept English and French spellings
# --------------------------------------------------------------------------


def _fold(value):
    text = unicodedata.normalize('NFKD', str(value or '')).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z]+', ' ', text.lower()).strip()


_REGIONS = {
    'adamawa': Region.ADAMAWA, 'adamaoua': Region.ADAMAWA,
    'centre': Region.CENTRE, 'center': Region.CENTRE, 'central': Region.CENTRE,
    'east': Region.EAST, 'est': Region.EAST,
    'far north': Region.FAR_NORTH, 'extreme nord': Region.FAR_NORTH,
    'littoral': Region.LITTORAL, 'coastal': Region.LITTORAL,
    'north': Region.NORTH, 'nord': Region.NORTH,
    'north west': Region.NORTH_WEST, 'northwest': Region.NORTH_WEST, 'nord ouest': Region.NORTH_WEST, 'nw': Region.NORTH_WEST,
    'south': Region.SOUTH, 'sud': Region.SOUTH,
    'south west': Region.SOUTH_WEST, 'southwest': Region.SOUTH_WEST, 'sud ouest': Region.SOUTH_WEST, 'sw': Region.SOUTH_WEST,
    'west': Region.WEST, 'ouest': Region.WEST,
}

_LEVELS = (
    (('nursery', 'maternelle', 'preschool', 'pre school', 'kindergarten'), Level.NURSERY),
    (('primary', 'primaire', 'elementary'), Level.PRIMARY),
    (('technical', 'technique', 'vocational', 'professionnel', 'commercial'), Level.TECHNICAL),
    (('university', 'universite', 'higher', 'superieur', 'tertiary', 'institute', 'institut', 'grande ecole'), Level.HIGHER),
    (('secondary', 'secondaire', 'college', 'lycee', 'high school', 'grammar', 'cems', 'ces'), Level.SECONDARY),
)


def normalize_region(value):
    key = _fold(value)
    if key in _REGIONS:
        return _REGIONS[key]
    return Region.UNKNOWN


def normalize_level(value):
    key = _fold(value)
    for words, level in _LEVELS:
        if any(key == w or key.startswith(w + ' ') or (' ' + w) in (' ' + key) for w in words):
            return level
    return Level.OTHER


def default_language(region):
    """North-West and South-West are English-speaking; the rest of Cameroon is mostly French."""
    return 'en' if region in (Region.NORTH_WEST, Region.SOUTH_WEST) else 'fr'


def clean_email(value):
    email = (value or '').strip().lower()
    try:
        validate_email(email)
    except ValidationError:
        return ''
    return email


# --------------------------------------------------------------------------
# Import
# --------------------------------------------------------------------------

def _header(name):
    return _fold(name).replace(' ', '_')


_ALIASES = {
    'school_name': ('school_name', 'school', 'name', 'institution', 'ecole', 'etablissement'),
    'level': ('level', 'education_level', 'type', 'niveau', 'category'),
    'region': ('region', 'province'),
    'town': ('town', 'city', 'ville', 'location', 'locality'),
    'email': ('email', 'e_mail', 'mail', 'contact_email'),
    'phone': ('phone', 'telephone', 'tel', 'mobile', 'whatsapp'),
    'website': ('website', 'site', 'url', 'web'),
    'source_url': ('source_url', 'source', 'source_link'),
    'language': ('language', 'lang', 'langue'),
}


def import_contacts(file_obj, user=None):
    """Create or update contacts from a CSV file; return counts and per-row problems."""
    raw = file_obj.read()
    if isinstance(raw, bytes):
        raw = raw.decode('utf-8-sig', errors='replace')
    sample = raw[:2048]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=',;\t')
    except csv.Error:
        dialect = csv.excel
    reader = csv.DictReader(io.StringIO(raw), dialect=dialect)
    if not reader.fieldnames:
        return {'created': 0, 'updated': 0, 'skipped': 0, 'errors': [{'row': 1, 'reason': 'The file is empty.'}]}
    mapping = {}
    for field in reader.fieldnames:
        head = _header(field)
        for target, names in _ALIASES.items():
            if head in names and target not in mapping.values():
                mapping[field] = target
                break
    if 'email' not in mapping.values() or 'school_name' not in mapping.values():
        return {'created': 0, 'updated': 0, 'skipped': 0,
                'errors': [{'row': 1, 'reason': 'The file needs at least the columns school_name and email.'}]}

    created = updated = skipped = 0
    errors = []
    for number, row in enumerate(reader, start=2):
        if number - 1 > MAX_IMPORT_ROWS:
            errors.append({'row': number, 'reason': f'Only the first {MAX_IMPORT_ROWS} rows are imported at once.'})
            break
        data = {target: (row.get(field) or '').strip() for field, target in mapping.items()}
        email = clean_email(data.get('email'))
        name = data.get('school_name', '')[:200]
        if not email or not name:
            skipped += 1
            errors.append({'row': number, 'reason': 'Missing school name or a valid email address.'})
            continue
        region = normalize_region(data.get('region'))
        level = normalize_level(data.get('level'))
        language = (data.get('language') or '').lower()[:2]
        if language not in ('en', 'fr'):
            language = default_language(region)
        fields = {
            'school_name': name, 'level': level, 'region': region, 'town': data.get('town', '')[:120],
            'phone': data.get('phone', '')[:40], 'website': data.get('website', '')[:300],
            'source_url': data.get('source_url', '')[:500], 'language': language,
        }
        existing = OutreachContact.objects.filter(email__iexact=email).first()
        try:
            if existing is None:
                OutreachContact.objects.create(email=email, created_by=user, **fields)
                created += 1
            else:
                # Never reset what has already been sent or an opt-out; only fill in missing details.
                for key, value in fields.items():
                    current = getattr(existing, key)
                    unset = (not current or (key == 'region' and current == Region.UNKNOWN)
                             or (key == 'level' and current == Level.OTHER))
                    if value and unset:
                        setattr(existing, key, value)
                existing.save()
                updated += 1
        except Exception as exc:  # a bad row must not stop the import
            skipped += 1
            errors.append({'row': number, 'reason': str(exc)[:200]})
    return {'created': created, 'updated': updated, 'skipped': skipped, 'errors': errors[:50]}


# --------------------------------------------------------------------------
# Rendering
# --------------------------------------------------------------------------

def daily_cap():
    try:
        cap = int(getattr(settings, 'OUTREACH_DAILY_CAP', 25))
    except (TypeError, ValueError):
        cap = 25
    return max(1, min(cap, SAFE_CAP_CEILING))


def sent_today():
    start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
    return OutreachSend.objects.filter(status=SendStatus.SENT, sent_at__gte=start).count()


def unsubscribe_url(contact):
    base = getattr(settings, 'OUTREACH_UNSUBSCRIBE_BASE', 'https://api.eduignite.online/api/v1/outreach/unsubscribe')
    return f'{base.rstrip("/")}/{contact.unsubscribe_token}/'


def personalise(text, contact):
    return (text.replace('{school_name}', contact.school_name)
            .replace('{town}', contact.town or '')
            .replace('{region}', contact.get_region_display() if contact.region != Region.UNKNOWN else ''))


def render_email(campaign_subject, campaign_body, contact):
    """Return (subject, html, text) with the unsubscribe footer. Body is plain text from the founder."""
    subject = personalise(campaign_subject, contact).strip()
    body = personalise(campaign_body, contact).strip()
    unsub = unsubscribe_url(contact)
    french = contact.language == 'fr'
    footer_text = (
        f"\n\n--\nEduIgnite Team | info@eduignite.online | https://eduignite.online\n"
        + (f"Vous ne souhaitez plus recevoir nos messages ? Se desinscrire : {unsub}" if french
           else f"Do not want to hear from us again? Unsubscribe: {unsub}")
    )
    paragraphs = ''.join(
        f'<p style="margin:0 0 14px">{html.escape(p).replace(chr(10), "<br>")}</p>'
        for p in re.split(r'\n\s*\n', body) if p.strip())
    footer_html = (
        '<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 12px">'
        '<p style="font-size:12px;color:#6b7280;margin:0">EduIgnite Team &middot; '
        '<a href="mailto:info@eduignite.online">info@eduignite.online</a> &middot; '
        '<a href="https://eduignite.online">eduignite.online</a></p>'
        f'<p style="font-size:12px;color:#6b7280;margin:6px 0 0">'
        + (f'Vous ne souhaitez plus recevoir nos messages ? <a href="{html.escape(unsub)}">Se d&eacute;sinscrire</a>'
           if french else f'Do not want to hear from us again? <a href="{html.escape(unsub)}">Unsubscribe</a>')
        + '</p>')
    html_body = ('<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#111827">'
                 + paragraphs + footer_html + '</div>')
    return subject, html_body, body + footer_text


def _deliver(contact, subject, body):
    sender = getattr(settings, 'OUTREACH_FROM_EMAIL', 'info@eduignite.online')
    subject_r, html_body, text_body = render_email(subject, body, contact)
    unsub = unsubscribe_url(contact)
    return send_transactional_email(
        event=EmailEvent.OUTREACH,
        to_email=contact.email,
        to_name=contact.school_name,
        subject=subject_r,
        html=html_body,
        text=text_body,
        sender_name=getattr(settings, 'OUTREACH_FROM_NAME', 'EduIgnite Team'),
        reply_to_email=getattr(settings, 'OUTREACH_REPLY_TO', sender),
        sender_email=sender,
        headers={'List-Unsubscribe': f'<{unsub}>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'},
    )


def send_test(user, subject, body):
    """Send the message to the signed-in user's own address, with a sample school."""
    sample = OutreachContact(school_name='Sample School', town='Douala', region=Region.LITTORAL,
                             email=user.email, language='en')
    return _deliver(sample, subject, body)


# --------------------------------------------------------------------------
# Queueing and the paced sender
# --------------------------------------------------------------------------

def queue_campaign(user, contact_ids, subject, body, resend=False):
    """Queue one campaign. Contacts already emailed are skipped unless ``resend``; opt-outs and bounces never."""
    ids = list(dict.fromkeys(contact_ids))[:MAX_BATCH_SELECT]
    contacts = list(OutreachContact.objects.filter(id__in=ids))
    counts = {'queued': 0, 'already_contacted': 0, 'unsubscribed': 0, 'bounced': 0, 'already_queued': 0}
    eligible = []
    for contact in contacts:
        if contact.status == ContactStatus.UNSUBSCRIBED:
            counts['unsubscribed'] += 1
        elif contact.status == ContactStatus.BOUNCED:
            counts['bounced'] += 1
        elif contact.status == ContactStatus.QUEUED:
            counts['already_queued'] += 1
        elif contact.sent_count > 0 and not resend:
            counts['already_contacted'] += 1
        else:
            eligible.append(contact)
    if not eligible:
        return None, counts
    with transaction.atomic():
        campaign = OutreachCampaign.objects.create(subject=subject.strip(), body=body.strip(), sent_by=user)
        OutreachSend.objects.bulk_create([OutreachSend(campaign=campaign, contact=c) for c in eligible])
        OutreachContact.objects.filter(id__in=[c.id for c in eligible]).update(status=ContactStatus.QUEUED)
    counts['queued'] = len(eligible)
    return campaign, counts


def process_queue(limit=None):
    """Send queued emails up to today's remaining allowance. Returns how many were sent."""
    allowance = daily_cap() - sent_today()
    if limit is not None:
        allowance = min(allowance, limit)
    sent = 0
    while sent < allowance:
        with transaction.atomic():
            send = (OutreachSend.objects.select_for_update(skip_locked=True, of=('self',))
                    .filter(status=SendStatus.QUEUED).select_related('campaign', 'contact')
                    .order_by('queued_at').first())
            if send is None:
                break
            contact = send.contact
            if contact.status in (ContactStatus.UNSUBSCRIBED, ContactStatus.BOUNCED):
                send.status = SendStatus.SKIPPED
                send.error = 'contact opted out or bounced'
                send.save(update_fields=['status', 'error'])
                continue
            try:
                ok = _deliver(contact, send.campaign.subject, send.campaign.body)
                error = '' if ok else 'The email provider did not accept the message.'
            except Exception as exc:  # never let one address stop the batch
                logger.exception('Outreach send failed')
                ok, error = False, str(exc)[:300]
            now = timezone.now()
            if ok:
                send.status, send.sent_at, send.error = SendStatus.SENT, now, ''
                contact.status = ContactStatus.SENT
                contact.sent_count += 1
                contact.first_sent_at = contact.first_sent_at or now
                contact.last_sent_at = now
                contact.last_error = ''
                sent += 1
            else:
                send.status, send.error = SendStatus.FAILED, error
                contact.status = ContactStatus.FAILED if contact.sent_count == 0 else ContactStatus.SENT
                contact.last_error = error
            send.save(update_fields=['status', 'sent_at', 'error'])
            contact.save(update_fields=['status', 'sent_count', 'first_sent_at', 'last_sent_at', 'last_error',
                                        'updated_at'])
    _close_finished_campaigns()
    return sent


def _close_finished_campaigns():
    for campaign in OutreachCampaign.objects.filter(status=CampaignStatus.RUNNING):
        if not campaign.sends.filter(status=SendStatus.QUEUED).exists():
            campaign.status = CampaignStatus.DONE
            campaign.save(update_fields=['status'])


def cancel_queue():
    """Stop everything still waiting; contacts go back to their earlier state."""
    queued = OutreachSend.objects.filter(status=SendStatus.QUEUED)
    contact_ids = list(queued.values_list('contact_id', flat=True))
    count = queued.update(status=SendStatus.CANCELLED)
    for contact in OutreachContact.objects.filter(id__in=contact_ids, status=ContactStatus.QUEUED):
        contact.status = ContactStatus.SENT if contact.sent_count else ContactStatus.NEW
        contact.save(update_fields=['status', 'updated_at'])
    OutreachCampaign.objects.filter(status=CampaignStatus.RUNNING).update(status=CampaignStatus.CANCELLED)
    return count


def unsubscribe(token):
    contact = OutreachContact.objects.filter(unsubscribe_token=token).first()
    if contact is None:
        return None
    if contact.status != ContactStatus.UNSUBSCRIBED:
        contact.status = ContactStatus.UNSUBSCRIBED
        contact.unsubscribed_at = timezone.now()
        contact.save(update_fields=['status', 'unsubscribed_at', 'updated_at'])
        OutreachSend.objects.filter(contact=contact, status=SendStatus.QUEUED).update(status=SendStatus.CANCELLED)
    return contact


# --------------------------------------------------------------------------
# Summary for the screen
# --------------------------------------------------------------------------

def summary():
    rows = OutreachContact.objects.values('region').annotate(
        total=Count('id'),
        contacted=Count('id', filter=Q(sent_count__gt=0)),
        queued=Count('id', filter=Q(status=ContactStatus.QUEUED)),
    )
    by_region = {r['region']: r for r in rows}
    regions = []
    for value, label in Region.choices:
        r = by_region.get(value, {})
        total = r.get('total', 0)
        regions.append({
            'region': value, 'label': label, 'total': total,
            'contacted': r.get('contacted', 0), 'not_contacted': total - r.get('contacted', 0),
            'queued': r.get('queued', 0),
        })
    totals = OutreachContact.objects.aggregate(
        total=Count('id'),
        contacted=Count('id', filter=Q(sent_count__gt=0)),
        queued=Count('id', filter=Q(status=ContactStatus.QUEUED)),
        unsubscribed=Count('id', filter=Q(status=ContactStatus.UNSUBSCRIBED)),
        bounced=Count('id', filter=Q(status=ContactStatus.BOUNCED)),
    )
    return {
        'totals': {**totals, 'not_contacted': totals['total'] - totals['contacted']},
        'regions': regions,
        'daily_cap': daily_cap(),
        'sent_today': sent_today(),
        'queued': OutreachSend.objects.filter(status=SendStatus.QUEUED).count(),
    }
