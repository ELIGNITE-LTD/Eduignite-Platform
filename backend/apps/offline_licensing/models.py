"""Models backing EduIgnite Offline licensing, QR activation, chunked sync,
and offline-to-cloud migration.

See ``scratchpad/wave2-contract.md`` (wire contract shared with the desktop
and companion-mobile agents) and product spec sections 5-9 for the business
rules these models exist to support. Field names below are the *real* backend
schema — do not confuse them with the descriptive table names used in the
spec's illustrative tables (e.g. ``student_identities``), which are not real
table names.
"""

import uuid

from django.db import models


class DeviceRegistration(models.Model):
    """One desktop installation's hardware fingerprint, tracked per school.

    ``device_id`` follows the wire contract's ``HW-XXXX-XXXX`` display format
    (first 8 hex chars of a SHA-256 hash of machine-specific identifiers,
    grouped). Anti-cloning checks and device-replacement flows key off this.
    """

    class Status(models.TextChoices):
        ACTIVE = 'active', 'Active'
        REPLACED = 'replaced', 'Replaced'
        REVOKED = 'revoked', 'Revoked'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey(
        'schools.School', on_delete=models.CASCADE, related_name='offline_devices',
    )
    device_id = models.CharField(
        max_length=32,
        db_index=True,
        help_text='HW-XXXX-XXXX formatted hardware fingerprint reported by the desktop app.',
    )
    fingerprint_metadata = models.JSONField(
        default=dict,
        blank=True,
        help_text=(
            'Raw inputs behind the fingerprint (platform, arch, cpu model, '
            'machine-guid presence, etc.) kept for support/audit only — never '
            'used to re-derive or validate the hash server-side.'
        ),
    )
    status = models.CharField(
        max_length=10, choices=Status.choices, default=Status.ACTIVE, db_index=True,
    )
    registered_at = models.DateTimeField(auto_now_add=True)
    replaced_by = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='replaces',
        help_text='The new DeviceRegistration approved to take over this one, if any.',
    )

    class Meta:
        db_table = 'offline_device_registrations'
        ordering = ['-registered_at']
        constraints = [
            # A given hardware fingerprint may only be the *active* device for
            # a school once at a time. A revoked/replaced row for the same
            # fingerprint (e.g. re-registering after a wipe) does not block a
            # fresh active row.
            models.UniqueConstraint(
                fields=['school', 'device_id'],
                condition=models.Q(status='active'),
                name='offline_licensing_one_active_device_per_fingerprint',
            ),
        ]
        indexes = [
            models.Index(fields=['school', 'status']),
        ]

    def __str__(self):
        return f'{self.device_id} ({self.school_id}) - {self.status}'


class LicensePlanPricing(models.Model):
    """Configurable annual licensing price per plan.

    Per spec section 5, the license fee "must not be hardcoded... allowing
    for seasonal discounts, regional pricing adjustments". This is edited via
    Django admin by EduIgnite Office operators; the desktop/companion apps
    never see this table directly, only the resulting signed certificate.
    """

    class Plan(models.TextChoices):
        FIRST_YEAR_FREE = 'first_year_free', 'First Year Free'
        ANNUAL = 'annual', 'Annual'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    plan = models.CharField(max_length=30, choices=Plan.choices)
    price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    currency = models.CharField(max_length=3, default='XAF')
    active = models.BooleanField(default=True, db_index=True)
    effective_from = models.DateField()
    region = models.CharField(
        max_length=100,
        blank=True,
        default='',
        help_text='Optional region this price applies to; blank means all regions.',
    )
    note = models.CharField(
        max_length=255,
        blank=True,
        default='',
        help_text='e.g. "Back-to-school 2027 discount".',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'offline_license_plan_pricing'
        ordering = ['-effective_from']
        indexes = [
            models.Index(fields=['plan', 'active', 'effective_from']),
        ]

    def __str__(self):
        return f'{self.plan} - {self.price} {self.currency} (from {self.effective_from})'


class QRChallenge(models.Model):
    """A short-lived activation/renewal/replacement challenge shown as a QR
    code on the desktop app and redeemed via the companion app.

    Anti-replay: redemption must check ``used_at`` is still null AND the
    challenge has not expired. ``challenge_id`` is generated client-side
    (desktop) as a UUID string, per the wire contract.
    """

    class Purpose(models.TextChoices):
        ACTIVATION = 'activation', 'Activation'
        RENEWAL = 'renewal', 'Renewal'
        DEVICE_REPLACEMENT = 'device_replacement', 'Device Replacement'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    challenge_id = models.CharField(max_length=64, unique=True, db_index=True)
    school = models.ForeignKey(
        'schools.School', on_delete=models.CASCADE, related_name='offline_qr_challenges',
    )
    device_id = models.CharField(max_length=32)
    purpose = models.CharField(max_length=20, choices=Purpose.choices)
    nonce = models.CharField(max_length=64)
    previous_device_id = models.CharField(
        max_length=32,
        blank=True,
        default='',
        help_text='Only set for purpose=device_replacement, per the wire contract.',
    )
    created_at = models.DateTimeField(help_text='createdAt as reported by the desktop app.')
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    redeemed_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
        help_text='The authenticated technician (companion app) who redeemed this challenge.',
    )

    class Meta:
        db_table = 'offline_qr_challenges'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['school', 'used_at']),
            models.Index(fields=['expires_at']),
        ]

    def __str__(self):
        return f'{self.challenge_id} ({self.purpose})'


class LicenseIssuance(models.Model):
    """Audit trail of every License Certificate ever issued to a device."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey(
        'schools.School', on_delete=models.CASCADE, related_name='offline_license_issuances',
    )
    device = models.ForeignKey(
        DeviceRegistration, on_delete=models.CASCADE, related_name='license_issuances',
    )
    challenge = models.ForeignKey(
        QRChallenge,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='issuances',
    )
    plan = models.CharField(max_length=30, choices=LicensePlanPricing.Plan.choices)
    issued_at = models.DateTimeField()
    expires_at = models.DateTimeField()
    certificate_json = models.JSONField(
        help_text='The full {"payload": {...}, "signature": "..."} certificate as returned to the client.',
    )
    revoked = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'offline_license_issuances'
        ordering = ['-issued_at']
        indexes = [
            models.Index(fields=['school', 'device']),
            models.Index(fields=['device', 'revoked']),
        ]

    def __str__(self):
        return f'{self.plan} cert for {self.device_id} issued {self.issued_at:%Y-%m-%d}'


class SyncSession(models.Model):
    """One chunked sync run for a school's device."""

    class Status(models.TextChoices):
        OPEN = 'open', 'Open'
        COMPLETED = 'completed', 'Completed'
        FAILED = 'failed', 'Failed'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey(
        'schools.School', on_delete=models.CASCADE, related_name='offline_sync_sessions',
    )
    device = models.ForeignKey(
        DeviceRegistration, on_delete=models.CASCADE, related_name='sync_sessions',
    )
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.OPEN, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'offline_sync_sessions'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['school', 'status']),
        ]

    def __str__(self):
        return f'SyncSession {self.id} ({self.status})'

    @property
    def last_acked_chunk_index(self):
        """The highest chunk_index successfully received so far, or -1 if none.

        Lets the desktop client resume uploading right after this index
        instead of restarting the whole sync, per the wire contract's
        ``GET .../status/`` response.
        """
        latest = self.chunks.aggregate(models.Max('chunk_index'))['chunk_index__max']
        return -1 if latest is None else latest


class SyncChunk(models.Model):
    """One received, checksummed slice of a sync session's payload.

    Unique on (session, chunk_index) so a duplicate POST — e.g. after a
    dropped ack — is a no-op rather than double-counting.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(SyncSession, on_delete=models.CASCADE, related_name='chunks')
    chunk_index = models.PositiveIntegerField()
    total_chunks = models.PositiveIntegerField()
    checksum = models.CharField(max_length=64, help_text='sha256 hex of the chunk body JSON.')
    row_count = models.PositiveIntegerField(default=0)
    received_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'offline_sync_chunks'
        ordering = ['chunk_index']
        constraints = [
            models.UniqueConstraint(fields=['session', 'chunk_index'], name='offline_sync_chunk_unique_per_session'),
        ]

    def __str__(self):
        return f'chunk {self.chunk_index}/{self.total_chunks} of session {self.session_id}'


class MigrationJob(models.Model):
    """One offline-export-to-cloud migration attempt for a school.

    Defaults to a dry run (validate + report, no writes); only a request with
    ``confirm: true`` moves a job past ``dry_run``/``validated`` into
    ``imported``. See ``apps/offline_licensing/migration/`` for the transform
    and import logic this status tracks.
    """

    class Status(models.TextChoices):
        DRY_RUN = 'dry_run', 'Dry Run'
        VALIDATED = 'validated', 'Validated'
        IMPORTED = 'imported', 'Imported'
        FAILED = 'failed', 'Failed'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey(
        'schools.School', on_delete=models.CASCADE, related_name='offline_migration_jobs',
    )
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.DRY_RUN, db_index=True)
    report_json = models.JSONField(
        default=dict,
        blank=True,
        help_text='Per-domain counts of would-create/would-update (dry run) or created/updated (confirmed), plus any errors.',
    )
    created_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'offline_migration_jobs'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['school', 'status']),
        ]

    def __str__(self):
        return f'MigrationJob {self.id} ({self.status}) for {self.school_id}'
