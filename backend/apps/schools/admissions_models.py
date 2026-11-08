"""Online admission applications for a school's public site (additive).

Applications are about children, so everything here is private: no public
listing, no student data in any public API, documents in private storage that is
never served from MEDIA, and an audit trail of every admin action.
"""

import uuid

from django.conf import settings
from django.core.files.storage import FileSystemStorage
from django.db import models


class PrivateFileSystemStorage(FileSystemStorage):
    """Files here have no URL at all: they are streamed only by the signed-download view."""

    def url(self, name):
        raise ValueError('Private admission documents have no public URL.')


def private_storage():
    """Local private storage, outside MEDIA_ROOT and with no public URL.

    A callable so the (environment specific) path is not frozen into migrations.
    """
    root = getattr(settings, 'PRIVATE_MEDIA_ROOT', None) or (settings.BASE_DIR / 'private_media')
    # base_url=None: the file has no URL; it is streamed only by the signed-download view.
    return PrivateFileSystemStorage(location=str(root))


# Form fields a school can configure: value is 'required', 'optional' or 'hidden'.
FIELD_KEYS = (
    'student_dob', 'student_gender', 'previous_school', 'class_applied',
    'guardian_relationship', 'guardian_phone', 'guardian_email', 'guardian_address', 'message',
)
DEFAULT_FIELD_CONFIG = {
    'student_dob': 'required',
    'student_gender': 'optional',
    'previous_school': 'optional',
    'class_applied': 'required',
    'guardian_relationship': 'required',
    'guardian_phone': 'required',
    'guardian_email': 'optional',
    'guardian_address': 'optional',
    'message': 'optional',
}
DOCUMENT_TYPES = ('pdf', 'jpg', 'png')


def default_field_config():
    return dict(DEFAULT_FIELD_CONFIG)


def default_document_types():
    return list(DOCUMENT_TYPES)


class AdmissionSettings(models.Model):
    """Admission window and form configuration. One per school."""

    school = models.OneToOneField('schools.School', on_delete=models.CASCADE, related_name='admission_settings')
    opens_on = models.DateField(null=True, blank=True)
    closes_on = models.DateField(null=True, blank=True)
    intake_year = models.CharField(max_length=9, blank=True, default='')  # e.g. 2026 or 2026-2027
    # Classes offered: reuses the school's own class registry, never a copy.
    classes_offered = models.ManyToManyField('schools.SchoolClass', blank=True, related_name='+')
    field_config = models.JSONField(blank=True, default=default_field_config)
    allowed_document_types = models.JSONField(blank=True, default=default_document_types)
    max_document_mb = models.PositiveSmallIntegerField(default=5)
    max_documents = models.PositiveSmallIntegerField(default=4)
    consent_text_en = models.TextField(blank=True, default='')
    consent_text_fr = models.TextField(blank=True, default='')
    notification_email = models.EmailField(blank=True, default='')
    auto_reply_en = models.TextField(blank=True, default='')
    auto_reply_fr = models.TextField(blank=True, default='')
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Admission settings'
        verbose_name_plural = 'Admission settings'

    def __str__(self):
        return f'Admissions {self.school_id}'


class ApplicationStatus(models.TextChoices):
    NEW = 'new', 'New'
    UNDER_REVIEW = 'under_review', 'Under review'
    ACCEPTED = 'accepted', 'Accepted'
    REJECTED = 'rejected', 'Rejected'
    WAITLISTED = 'waitlisted', 'Waitlisted'
    ENROLLED = 'enrolled', 'Enrolled'


class AdmissionApplication(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='admission_applications')
    reference = models.CharField(max_length=20, unique=True)
    status = models.CharField(
        max_length=14, choices=ApplicationStatus.choices, default=ApplicationStatus.NEW, db_index=True)

    student_full_name = models.CharField(max_length=200)
    student_dob = models.DateField(null=True, blank=True)
    student_gender = models.CharField(max_length=10, blank=True, default='')
    previous_school = models.CharField(max_length=200, blank=True, default='')
    class_applied = models.ForeignKey(
        'schools.SchoolClass', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    class_applied_name = models.CharField(max_length=255, blank=True, default='')
    intake_year = models.CharField(max_length=9, blank=True, default='')

    guardian_name = models.CharField(max_length=200)
    guardian_relationship = models.CharField(max_length=40, blank=True, default='')
    guardian_phone = models.CharField(max_length=30, blank=True, default='')
    guardian_email = models.EmailField(blank=True, default='')
    guardian_address = models.CharField(max_length=300, blank=True, default='')
    message = models.TextField(blank=True, default='')

    language = models.CharField(max_length=2, default='en')
    consent_given = models.BooleanField(default=False)
    consent_at = models.DateTimeField(null=True, blank=True)

    # Abuse controls. Only keyed hashes are stored, never the raw IP.
    ip_hash = models.CharField(max_length=64, blank=True, default='')
    phone_hash = models.CharField(max_length=64, blank=True, default='', db_index=True)
    email_hash = models.CharField(max_length=64, blank=True, default='', db_index=True)
    user_agent = models.CharField(max_length=200, blank=True, default='')
    idempotency_key = models.CharField(max_length=64, blank=True, default='')
    fingerprint = models.CharField(max_length=64, blank=True, default='', db_index=True)

    handled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    internal_notes = models.TextField(blank=True, default='')
    enrolled_student_id = models.UUIDField(null=True, blank=True)
    status_changed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['school', 'status', '-created_at']),
            models.Index(fields=['school', '-created_at']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['school', 'idempotency_key'], condition=~models.Q(idempotency_key=''),
                name='admission_unique_idempotency_per_school'),
        ]

    def __str__(self):
        return self.reference


class ApplicationDocument(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    application = models.ForeignKey(AdmissionApplication, on_delete=models.CASCADE, related_name='documents')
    doc_type = models.CharField(max_length=12)  # sniffed type: pdf / jpg / png
    original_name = models.CharField(max_length=120, blank=True, default='')
    file = models.FileField(upload_to='admissions/%Y/', storage=private_storage, max_length=255)
    content_type = models.CharField(max_length=60, blank=True, default='')
    size = models.PositiveIntegerField(default=0)
    sha256 = models.CharField(max_length=64, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']


class AdmissionAuditEntry(models.Model):
    """Who did what to an application or to admission settings. No personal data in ``detail``."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='admission_audit')
    application = models.ForeignKey(
        AdmissionApplication, null=True, blank=True, on_delete=models.SET_NULL, related_name='audit')
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    actor_name = models.CharField(max_length=200, blank=True, default='')
    action = models.CharField(max_length=40)
    from_status = models.CharField(max_length=14, blank=True, default='')
    to_status = models.CharField(max_length=14, blank=True, default='')
    detail = models.JSONField(blank=True, default=dict)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['school', '-created_at'])]
