"""Uploaded apps and their builds.

Two records, because they answer different questions:

``AppPackage``  the app's identity over time — its key, who publishes it, and
                which build is currently live. One row per app, forever.
``AppBuild``    one submission — a version, its manifest, its file, and where
                it sits in the review lifecycle. Many rows per app, kept, so
                a rollback is re-pointing at a build that still exists rather
                than hoping someone kept the zip.

Builds are never deleted. A published build that a school is running must stay
readable even after it is superseded, or an offline device coming back would
find nothing to run.
"""

from django.db import models
from django_extensions.db.models import TimeStampedModel


def app_package_upload_to(instance, filename):
    return f'app_packages/{instance.package.key}/{instance.version}.eia'


class BuildState(models.TextChoices):
    """Where a submission sits. Mirrors the store-side lifecycle."""

    DRAFT = 'draft', 'Draft'
    SUBMITTED = 'submitted', 'Submitted'
    CHECKS_FAILED = 'checks_failed', 'Automated checks failed'
    IN_REVIEW = 'in_review', 'In review'
    REJECTED = 'rejected', 'Rejected'
    APPROVED = 'approved', 'Approved'
    PUBLISHED = 'published', 'Published'
    DEPRECATED = 'deprecated', 'Deprecated'
    PULLED = 'pulled', 'Pulled'


class AppPackage(TimeStampedModel):
    """An uploaded app's identity across every version of it."""

    key = models.CharField(
        max_length=64,
        unique=True,
        help_text='Permanent. Installations and school data reference it.',
    )
    name = models.CharField(max_length=120)
    publisher = models.CharField(max_length=120, default='EduIgnite')

    #: The build schools get when they install or update. Null until the first
    #: build is published.
    live_build = models.ForeignKey(
        'registry.AppBuild',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='live_for',
    )
    is_listed = models.BooleanField(
        default=True,
        help_text='Off hides the app from the store without affecting schools that have it.',
    )

    #: Which schools may see and install this app. When visible_to_all is True
    #: the app is in every school's store; otherwise only the listed schools
    #: can see it. The publisher sets this before publishing.
    visible_to_all = models.BooleanField(default=True)
    visible_school_ids = models.JSONField(default=list, blank=True)

    #: A real app icon, uploaded by the founder and stored as a data URL so it
    #: needs no separate file serving and shows offline. Empty falls back to the
    #: manifest's lucide icon name.
    icon_image = models.TextField(blank=True, default='')
    #: A full description shown on the app's store page, beyond the one-line
    #: summary in the manifest. Founder-editable without a rebuild.
    description = models.TextField(blank=True, default='')

    #: Authoritative pricing, set by a founder and editable without a rebuild.
    #: Price is a commercial decision, not a code property — the manifest only
    #: supplies a default, seeded here on first upload. Shape:
    #: {"model": "free|one_time|subscription", "interval": "monthly|termly|yearly",
    #:  "price": 10000, "currency": "XAF"}.
    pricing = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = 'app_packages'
        ordering = ['name']

    def __str__(self):
        return f'{self.name} ({self.key})'


class AppBuild(TimeStampedModel):
    """One submitted version of an uploaded app."""

    package = models.ForeignKey(
        AppPackage, on_delete=models.CASCADE, related_name='builds'
    )
    version = models.CharField(max_length=32)
    runtime_api = models.CharField(max_length=16, default='1.x')

    #: The validated manifest, stored as sent. The source of truth for what
    #: this build declares; the registry reads it rather than the zip.
    manifest = models.JSONField(default=dict)
    changelog = models.TextField(blank=True, default='')

    package_file = models.FileField(upload_to=app_package_upload_to)
    size_bytes = models.BigIntegerField(default=0)
    checksum = models.CharField(max_length=64, blank=True, default='')

    state = models.CharField(
        max_length=20, choices=BuildState.choices, default=BuildState.DRAFT, db_index=True
    )
    check_report = models.JSONField(
        default=dict,
        help_text='Output of the automated checks, kept so a rejection can be explained.',
    )

    submitted_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='app_builds_submitted',
    )
    reviewed_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='app_builds_reviewed',
    )
    review_note = models.TextField(blank=True, default='')

    submitted_at = models.DateTimeField(null=True, blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    published_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'app_builds'
        ordering = ['-created']
        constraints = [
            models.UniqueConstraint(
                fields=['package', 'version'], name='unique_version_per_package'
            ),
        ]
        indexes = [
            models.Index(fields=['package', 'state']),
        ]

    def __str__(self):
        return f'{self.package.key} {self.version} ({self.state})'

    @property
    def is_installable(self) -> bool:
        """Only a published build may be installed by a school."""
        return self.state == BuildState.PUBLISHED

    @property
    def is_runnable(self) -> bool:
        """Deprecated builds still run for schools already on them.

        Pulled builds do not: pulling is what we do when a build is actively
        harmful, and it has to stop running everywhere.
        """
        return self.state in (BuildState.PUBLISHED, BuildState.DEPRECATED)
