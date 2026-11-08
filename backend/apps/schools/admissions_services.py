"""Rules for online admission applications.

Privacy first: these are children's records. Nothing here logs personal data,
the raw IP is never stored (keyed hash only), and no function returns an
application to an anonymous caller.
"""

import csv
import hashlib
import hmac
import logging
import re
import secrets
import uuid
from datetime import date, timedelta

from django.conf import settings
from django.core import signing
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from django.db import IntegrityError, transaction
from django.utils import timezone

from .admissions_models import (
    DEFAULT_FIELD_CONFIG,
    DOCUMENT_TYPES,
    FIELD_KEYS,
    AdmissionApplication,
    AdmissionAuditEntry,
    AdmissionSettings,
    ApplicationDocument,
    ApplicationStatus,
)
from .models import SchoolClass
from .public_site_services import client_ip, clean_text

logger = logging.getLogger(__name__)

RELATIONSHIPS = ('father', 'mother', 'uncle', 'aunt', 'elder_sibling', 'legal_guardian', 'other')
GENDERS = ('male', 'female', 'other')
PUBLIC_FIELDS = {
    'student_full_name', 'student_dob', 'student_gender', 'previous_school', 'class_applied',
    'guardian_name', 'guardian_relationship', 'guardian_phone', 'guardian_email', 'guardian_address',
    'message', 'consent', 'language', 'submission_id', 'form_token', 'website',
}
FILE_FIELD = 'documents'
FORM_TOKEN_SALT = 'admission-form'
DOWNLOAD_SALT = 'admission-document'
DOWNLOAD_MAX_AGE = 300  # seconds: five minutes
FORM_TOKEN_MAX_AGE = 6 * 3600
PER_CONTACT_DAILY_LIMIT = 3
_REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'  # no 0/O/1/I
_PHONE = re.compile(r'^\+?[0-9][0-9 ()\-]{6,24}$')

DEFAULT_CONSENT = {
    'en': 'I confirm the information is correct and I agree that the school may use it to process this admission application.',
    'fr': "Je confirme que les informations sont exactes et j'accepte que l'ecole les utilise pour traiter cette demande d'admission.",
}
DEFAULT_AUTO_REPLY = {
    'en': 'Thank you. We have received your application and will contact you.',
    'fr': 'Merci. Nous avons bien recu votre demande et nous vous contacterons.',
}


# -- small helpers ----------------------------------------------------------


def keyed_hash(value):
    """Stable keyed hash for abuse controls; the raw value is never stored."""
    value = str(value or '').strip().lower()
    if not value:
        return ''
    return hmac.new(settings.SECRET_KEY.encode(), value.encode(), hashlib.sha256).hexdigest()


def normalize_phone(value):
    return ''.join(ch for ch in str(value or '') if ch.isdigit())


def one_line(value, limit):
    return ' '.join(clean_text(value).split())[:limit]


def get_settings(school):
    obj, _ = AdmissionSettings.objects.get_or_create(school=school)
    return obj


def window_state(adm, today=None):
    today = today or timezone.localdate()
    if adm.opens_on and today < adm.opens_on:
        return 'not_yet_open'
    if adm.closes_on and today > adm.closes_on:
        return 'closed'
    return 'open'


def public_context(school):
    """(profile, admission settings, state) for a public slug-resolved school.

    state is 'unavailable' (unpublished, disabled or never configured), a window
    state, or 'open'.
    """
    from .public_profile import published_schools

    live = published_schools().select_related('public_profile').filter(pk=school.pk).first()
    if live is None or not live.public_profile.enrollment_enabled:
        return None, None, 'unavailable'
    adm = AdmissionSettings.objects.filter(school=school).first()
    if adm is None:
        return live.public_profile, None, 'unavailable'
    return live.public_profile, adm, window_state(adm)


def offered_classes(school, adm):
    queryset = SchoolClass.objects.filter(school=school)
    chosen = list(adm.classes_offered.values_list('id', flat=True)) if adm.pk else []
    if chosen:
        queryset = queryset.filter(id__in=chosen)
    return queryset.order_by('cycle', 'name')


def class_payload(school_class):
    return {'id': str(school_class.id), 'name': school_class.name,
            'group': school_class.get_cycle_display()}


def effective_field_config(adm):
    config = dict(DEFAULT_FIELD_CONFIG)
    for key, value in (adm.field_config or {}).items():
        if key in FIELD_KEYS and value in ('required', 'optional', 'hidden'):
            config[key] = value
    return config


def issue_form_token(school):
    return signing.TimestampSigner(salt=FORM_TOKEN_SALT).sign(str(school.pk))


def check_form_token(token, school):
    """Return None when fine, else an error code. Also the simple time trap."""
    if not token:
        return 'form_token'
    signer = signing.TimestampSigner(salt=FORM_TOKEN_SALT)
    try:
        value = signer.unsign(token, max_age=FORM_TOKEN_MAX_AGE)
    except signing.SignatureExpired:
        return 'form_expired'
    except signing.BadSignature:
        return 'form_token'
    if value != str(school.pk):
        return 'form_token'
    issued = signing.b62_decode(token.rsplit(':', 2)[1])
    if timezone.now().timestamp() - issued < getattr(settings, 'ADMISSION_MIN_FILL_SECONDS', 3):
        return 'too_fast'
    return None


def public_config(school, profile, adm, lang):
    config = effective_field_config(adm)
    consent = {code: (getattr(adm, f'consent_text_{code}') or DEFAULT_CONSENT[code]) for code in ('en', 'fr')}
    return {
        'school': {'name': school.name, 'slug': school.public_slug},
        'state': 'open',
        'lang': lang,
        'intake_year': adm.intake_year,
        'opens_on': adm.opens_on,
        'closes_on': adm.closes_on,
        'fields': {key: value for key, value in config.items() if value != 'hidden'},
        'classes': [class_payload(c) for c in offered_classes(school, adm)],
        'consent_text': consent,
        'relationships': list(RELATIONSHIPS),
        'documents': {
            'types': [t for t in (adm.allowed_document_types or []) if t in DOCUMENT_TYPES],
            'max_mb': adm.max_document_mb,
            'max_files': adm.max_documents,
        },
        'form_token': issue_form_token(school),
    }


# -- reference + audit ------------------------------------------------------


def new_reference():
    year = timezone.now().year
    return f'ADM-{year}-' + ''.join(secrets.choice(_REF_ALPHABET) for _ in range(6))


def write_audit(school, actor, action, application=None, from_status='', to_status='', detail=None):
    authed = bool(actor and getattr(actor, 'is_authenticated', False))
    return AdmissionAuditEntry.objects.create(
        school=school, application=application, actor=actor if authed else None,
        actor_name=((getattr(actor, 'name', '') or str(actor))[:200] if authed else 'public form'),
        action=action, from_status=from_status, to_status=to_status, detail=detail or {})


# -- public submission ------------------------------------------------------


class SubmissionError(Exception):
    def __init__(self, errors, status_code=400):
        self.errors = errors
        self.status_code = status_code


def _parse_date(value):
    try:
        return date.fromisoformat(str(value).strip())
    except (TypeError, ValueError):
        return None


def sniff_document(upload):
    """Detect the real type from the first bytes. Returns (kind, content_type) or (None, None)."""
    head = upload.read(16)
    upload.seek(0)
    if head.startswith(b'%PDF-'):
        return 'pdf', 'application/pdf'
    if head.startswith(b'\xff\xd8\xff'):
        return 'jpg', 'image/jpeg'
    if head.startswith(b'\x89PNG\r\n\x1a\n'):
        return 'png', 'image/png'
    return None, None


def _extension_kind(name):
    ext = (name.rsplit('.', 1)[-1] if '.' in name else '').lower()
    return {'jpeg': 'jpg'}.get(ext, ext)


def validate_documents(adm, files):
    errors, accepted = {}, []
    allowed = [t for t in (adm.allowed_document_types or []) if t in DOCUMENT_TYPES]
    if len(files) > adm.max_documents:
        errors[FILE_FIELD] = 'too_many_files'
        return errors, accepted
    limit = adm.max_document_mb * 1024 * 1024
    for upload in files:
        if upload.size > limit:
            errors[FILE_FIELD] = 'file_size'
            break
        kind, content_type = sniff_document(upload)
        if kind is None or kind not in allowed or _extension_kind(upload.name or '') != kind:
            errors[FILE_FIELD] = 'file_type'
            break
        accepted.append((upload, kind, content_type))
    return errors, accepted


def validate_submission(school, adm, data):
    """Validate against the school's field configuration. Returns (clean, errors)."""
    config = effective_field_config(adm)
    unknown = set(data.keys()) - PUBLIC_FIELDS - {FILE_FIELD}
    hidden = {key for key, mode in config.items() if mode == 'hidden'} & set(data.keys())
    if unknown or hidden:
        return {}, {key: 'unknown_field' for key in sorted(unknown | hidden)}

    errors, clean = {}, {}

    def text(key, limit, required, minimum=0):
        value = one_line(data.get(key), limit + 1)
        if not value:
            if required:
                errors[key] = 'required'
            return ''
        if len(value) > limit:
            errors[key] = 'too_long'
        elif len(value) < minimum:
            errors[key] = 'invalid'
        return value[:limit]

    def mode(key):
        return config.get(key, 'hidden')

    clean['student_full_name'] = text('student_full_name', 200, True, 2)
    clean['guardian_name'] = text('guardian_name', 200, True, 2)

    dob_raw = str(data.get('student_dob') or '').strip()
    clean['student_dob'] = None
    if dob_raw:
        dob = _parse_date(dob_raw)
        today = timezone.localdate()
        if dob is None:
            errors['student_dob'] = 'invalid'
        elif dob > today:
            errors['student_dob'] = 'future'
        elif dob < today - timedelta(days=366 * 30):
            errors['student_dob'] = 'invalid'
        clean['student_dob'] = dob
    elif mode('student_dob') == 'required':
        errors['student_dob'] = 'required'

    gender = str(data.get('student_gender') or '').strip().lower()
    if gender and gender not in GENDERS:
        errors['student_gender'] = 'invalid'
    elif not gender and mode('student_gender') == 'required':
        errors['student_gender'] = 'required'
    clean['student_gender'] = gender

    clean['previous_school'] = text('previous_school', 200, mode('previous_school') == 'required')

    clean['class_applied'] = None
    class_raw = str(data.get('class_applied') or '').strip()
    if class_raw:
        try:
            class_id = uuid.UUID(class_raw)
        except ValueError:
            class_id = None
        chosen = offered_classes(school, adm).filter(id=class_id).first() if class_id else None
        if chosen is None:
            errors['class_applied'] = 'invalid'
        clean['class_applied'] = chosen
    elif mode('class_applied') == 'required':
        errors['class_applied'] = 'required'

    relationship = str(data.get('guardian_relationship') or '').strip().lower()
    if relationship and relationship not in RELATIONSHIPS:
        errors['guardian_relationship'] = 'invalid'
    elif not relationship and mode('guardian_relationship') == 'required':
        errors['guardian_relationship'] = 'required'
    clean['guardian_relationship'] = relationship

    phone = one_line(data.get('guardian_phone'), 31)
    if phone:
        digits = normalize_phone(phone)
        if not _PHONE.match(phone) or not 8 <= len(digits) <= 15:
            errors['guardian_phone'] = 'invalid'
    elif mode('guardian_phone') == 'required':
        errors['guardian_phone'] = 'required'
    clean['guardian_phone'] = phone

    email = str(data.get('guardian_email') or '').strip().lower()
    if email:
        try:
            if len(email) > 254 or any(ch in email for ch in '\r\n\t, ;<>'):
                raise DjangoValidationError('bad')
            validate_email(email)
        except DjangoValidationError:
            errors['guardian_email'] = 'invalid'
    elif mode('guardian_email') == 'required':
        errors['guardian_email'] = 'required'
    clean['guardian_email'] = email

    if not phone and not email and 'guardian_phone' not in errors and 'guardian_email' not in errors:
        errors['guardian_phone'] = 'contact_required'

    clean['guardian_address'] = text('guardian_address', 300, mode('guardian_address') == 'required')

    message = clean_text(data.get('message'))
    if len(message) > 2000:
        errors['message'] = 'too_long'
    elif not message and mode('message') == 'required':
        errors['message'] = 'required'
    clean['message'] = message[:2000]

    if str(data.get('consent')).lower() not in ('true', '1', 'on', 'yes'):
        errors['consent'] = 'required'
    clean['consent'] = 'consent' not in errors

    language = str(data.get('language') or 'en').lower()[:2]
    clean['language'] = language if language in ('en', 'fr') else 'en'
    clean['submission_id'] = str(data.get('submission_id') or '').strip()[:64]
    if clean['submission_id'] and not re.fullmatch(r'[A-Za-z0-9_\-]{8,64}', clean['submission_id']):
        errors['submission_id'] = 'invalid'
    return clean, errors


def _fingerprint(school, clean):
    parts = [
        str(school.pk), clean['student_full_name'].lower(), str(clean['student_dob'] or ''),
        normalize_phone(clean['guardian_phone']), clean['guardian_email'],
        str(getattr(clean['class_applied'], 'id', '') or ''),
    ]
    return keyed_hash('|'.join(parts))


def _contact_limit_hit(school, phone_hash, email_hash):
    since = timezone.now() - timedelta(days=1)
    recent = AdmissionApplication.objects.filter(school=school, created_at__gte=since)
    for field, value in (('phone_hash', phone_hash), ('email_hash', email_hash)):
        if value and recent.filter(**{field: value}).count() >= PER_CONTACT_DAILY_LIMIT:
            return True
    return False


def submit_application(school, adm, clean, documents, request):
    """Create the application. Returns (application, created)."""
    key = clean['submission_id']
    if key:
        existing = AdmissionApplication.objects.filter(school=school, idempotency_key=key).first()
        if existing:
            return existing, False
    fingerprint = _fingerprint(school, clean)
    day_ago = timezone.now() - timedelta(days=1)
    same = AdmissionApplication.objects.filter(
        school=school, fingerprint=fingerprint, created_at__gte=day_ago).first()
    if same:
        return same, False

    phone_hash = keyed_hash(normalize_phone(clean['guardian_phone']))
    email_hash = keyed_hash(clean['guardian_email'])
    if _contact_limit_hit(school, phone_hash, email_hash):
        raise SubmissionError({'detail': 'contact_limit'}, 429)

    ua = re.sub(r'[\x00-\x1f\x7f]', '', request.META.get('HTTP_USER_AGENT', ''))[:200]
    school_class = clean['class_applied']
    try:
        with transaction.atomic():
            for _ in range(5):
                reference = new_reference()
                if not AdmissionApplication.objects.filter(reference=reference).exists():
                    break
            application = AdmissionApplication.objects.create(
                school=school, reference=reference,
                student_full_name=clean['student_full_name'], student_dob=clean['student_dob'],
                student_gender=clean['student_gender'], previous_school=clean['previous_school'],
                class_applied=school_class, class_applied_name=school_class.name if school_class else '',
                intake_year=adm.intake_year,
                guardian_name=clean['guardian_name'], guardian_relationship=clean['guardian_relationship'],
                guardian_phone=clean['guardian_phone'], guardian_email=clean['guardian_email'],
                guardian_address=clean['guardian_address'], message=clean['message'],
                language=clean['language'], consent_given=True, consent_at=timezone.now(),
                ip_hash=keyed_hash(client_ip(request)), phone_hash=phone_hash, email_hash=email_hash,
                user_agent=ua, idempotency_key=key, fingerprint=fingerprint)
            for upload, kind, content_type in documents:
                store_document(application, upload, kind, content_type)
            write_audit(school, None, 'submitted', application, to_status=ApplicationStatus.NEW)
            transaction.on_commit(lambda: notify_submission(application.pk))
    except IntegrityError:
        # A concurrent double submit won the idempotency constraint.
        existing = AdmissionApplication.objects.filter(school=school, idempotency_key=key).first() if key else None
        if existing:
            return existing, False
        raise
    return application, True


def store_document(application, upload, kind, content_type):
    digest = hashlib.sha256()
    for chunk in upload.chunks():
        digest.update(chunk)
    upload.seek(0)
    name = re.sub(r'[^\w.\- ]', '', (upload.name or 'document').rsplit('/', 1)[-1])[:100] or 'document'
    doc = ApplicationDocument(
        application=application, doc_type=kind, original_name=name,
        content_type=content_type, size=upload.size, sha256=digest.hexdigest())
    doc.file.save(f'{uuid.uuid4().hex}.{kind}', upload, save=False)
    doc.save()
    return doc


# -- notifications ----------------------------------------------------------


def notify_submission(application_id):
    """School notice and guardian acknowledgement. Idempotent, never raises."""
    try:
        from core.email_service import EmailEvent
        from apps.orders import api as mail

        application = AdmissionApplication.objects.select_related('school').filter(pk=application_id).first()
        if application is None:
            return
        school = application.school
        adm = AdmissionSettings.objects.filter(school=school).first()
        link = settings.FRONTEND_URL.rstrip('/') + '/dashboard/admissions' if getattr(settings, 'FRONTEND_URL', '') else ''
        recipient = (adm.notification_email if adm and adm.notification_email else school.email) or ''
        # The school notice carries the reference and class only, no child details.
        rows = [('Reference', application.reference), ('Class', mail.clean_line(application.class_applied_name))]
        subject = f'New admission application {application.reference}'
        html = mail.email_page(
            'New admission application / Nouvelle demande d\'admission',
            f'{school.name} has received a new admission application. Open the dashboard to review it.',
            f'{school.name} a recu une nouvelle demande d\'admission. Ouvrez le tableau de bord pour la consulter.',
            rows, button=('Open applications', link) if link else None)
        text = mail.email_text(
            f'New admission application {application.reference} for {mail.clean_line(school.name)}.',
            f'Review it: {link}' if link else '')
        mail.send_once(f'admission:{application.pk}:school', EmailEvent.ADMISSION_RECEIVED, recipient,
                       school.name, subject, html, text)

        if application.guardian_email:
            lang = application.language if application.language in ('en', 'fr') else 'en'
            custom = (getattr(adm, f'auto_reply_{lang}', '') if adm else '') or DEFAULT_AUTO_REPLY[lang]
            custom = mail.clean_line(custom, 1000)
            en = custom if lang == 'en' else DEFAULT_AUTO_REPLY['en']
            fr = custom if lang == 'fr' else DEFAULT_AUTO_REPLY['fr']
            ack_rows = [('School / Ecole', mail.clean_line(school.name)), ('Reference', application.reference)]
            subject = f'Application received / Demande recue: {application.reference}'
            html = mail.email_page('Application received / Demande recue', en, fr, ack_rows)
            text = mail.email_text(en, fr, f'Reference: {application.reference}')
            mail.send_once(f'admission:{application.pk}:ack', EmailEvent.ADMISSION_ACK,
                           application.guardian_email, application.guardian_name, subject, html, text)
    except Exception:  # noqa: BLE001 - mail must never break a request
        logger.exception('Admission notification failed for application %s', application_id)


# -- signed document download ----------------------------------------------


def make_download_token(document, user):
    return signing.TimestampSigner(salt=DOWNLOAD_SALT).sign(f'{document.pk}:{document.application_id}:{user.pk}')


def read_download_token(token, user):
    """Return (document_id, application_id) or raise signing errors / PermissionError."""
    value = signing.TimestampSigner(salt=DOWNLOAD_SALT).unsign(token, max_age=DOWNLOAD_MAX_AGE)
    doc_id, app_id, user_id = value.split(':')
    if str(user.pk) != user_id:
        raise PermissionError('token not issued to this user')
    return doc_id, app_id


# -- enrolment --------------------------------------------------------------


def export_rows(queryset):
    """CSV rows with spreadsheet-formula neutralisation."""
    def safe(value):
        value = '' if value is None else str(value)
        return "'" + value if value[:1] in ('=', '+', '-', '@', '\t', '\r') else value

    header = ['reference', 'status', 'submitted', 'intake_year', 'student_name', 'date_of_birth', 'gender',
              'class_applied', 'previous_school', 'guardian_name', 'relationship', 'phone', 'email', 'address']
    yield header
    for a in queryset.iterator():
        yield [safe(v) for v in (
            a.reference, a.status, a.created_at.date().isoformat(), a.intake_year, a.student_full_name,
            a.student_dob.isoformat() if a.student_dob else '', a.student_gender, a.class_applied_name,
            a.previous_school, a.guardian_name, a.guardian_relationship, a.guardian_phone,
            a.guardian_email, a.guardian_address)]


class _Echo:
    def write(self, value):
        return value


def csv_stream(queryset):
    writer = csv.writer(_Echo())
    for row in export_rows(queryset):
        yield writer.writerow(row)
