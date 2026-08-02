"""Which apps a school has, and until when.

One row per (school, app). No row means the app was never installed; a row with
``is_enabled=False`` means it was installed and then turned off, which is a
different thing — the school's data is still there and re-enabling restores it.

Uninstalling never deletes data. Schools lose access, keep their records, and a
founder can put the app back. Anything else would make an accidental uninstall
unrecoverable, which for a term's worth of attendance or marks is unacceptable.
"""

from django.db import models
from django_extensions.db.models import TimeStampedModel


class AppInstallation(TimeStampedModel):
    """A school's licence to use one app."""

    school = models.ForeignKey(
        'schools.School',
        on_delete=models.CASCADE,
        related_name='app_installations',
    )
    #: Matches AppManifest.key. Not a foreign key — apps live in code, not rows,
    #: so an app can be withdrawn from a release without orphaning history.
    app_key = models.CharField(max_length=64, db_index=True)

    is_enabled = models.BooleanField(
        default=True,
        help_text='Off means the school keeps its data but cannot open the app.',
    )
    #: Roles at this school that get the app. Empty means everyone the app is
    #: built for. A school can narrow it — e.g. install an app for teachers only
    #: — and only those users see it and can open it.
    allowed_roles = models.JSONField(default=list, blank=True)
    licence_expiry = models.DateField(
        null=True,
        blank=True,
        help_text='Blank means no expiry. A past date blocks access.',
    )

    #: Which build of an uploaded app this school is running. Null for
    #: built-in apps, which have no version of their own — they ship with the
    #: release. A school stays on its pinned build until an administrator takes
    #: an update, so a published update never moves a school mid-term.
    pinned_build = models.ForeignKey(
        'registry.AppBuild',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='installations',
    )

    installed_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='app_installations_made',
    )
    installed_at = models.DateTimeField(auto_now_add=True)
    disabled_at = models.DateTimeField(null=True, blank=True)
    note = models.TextField(blank=True, default='')

    class Meta:
        db_table = 'app_installations'
        verbose_name = 'App installation'
        verbose_name_plural = 'App installations'
        constraints = [
            models.UniqueConstraint(
                fields=['school', 'app_key'],
                name='unique_app_per_school',
            ),
        ]
        indexes = [
            models.Index(fields=['school', 'is_enabled']),
            models.Index(fields=['app_key', 'is_enabled']),
        ]
        ordering = ['app_key']

    def __str__(self):
        state = 'enabled' if self.is_enabled else 'disabled'
        return f'{self.app_key} @ {self.school_id} ({state})'

    @property
    def is_expired(self) -> bool:
        if self.licence_expiry is None:
            return False
        from django.utils import timezone

        return self.licence_expiry < timezone.now().date()

    @property
    def is_active(self) -> bool:
        """Enabled and not past its licence expiry."""
        return self.is_enabled and not self.is_expired


class UserAppInstallation(TimeStampedModel):
    """A person's own installation of an app.

    Separate from AppInstallation because the two answer different questions.
    A school licence says the app is *available*; a user installation says this
    person actually put it in their account. Teacher Attendance needs both: the
    school pays, and an authorised member of staff opts in.

    Study material — GCE Past Questions, Math O-Level — needs only this one, so
    a single teacher can install it without the whole school buying anything.
    """

    user = models.ForeignKey(
        'users.User',
        on_delete=models.CASCADE,
        related_name='app_installations',
    )
    app_key = models.CharField(max_length=64, db_index=True)

    is_enabled = models.BooleanField(default=True)
    licence_expiry = models.DateField(
        null=True,
        blank=True,
        help_text='Blank means no expiry. Used by subscription apps.',
    )
    installed_at = models.DateTimeField(auto_now_add=True)
    disabled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'user_app_installations'
        verbose_name = 'User app installation'
        verbose_name_plural = 'User app installations'
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'app_key'],
                name='unique_app_per_user',
            ),
        ]
        indexes = [
            models.Index(fields=['user', 'is_enabled']),
        ]
        ordering = ['app_key']

    def __str__(self):
        state = 'enabled' if self.is_enabled else 'disabled'
        return f'{self.app_key} @ user {self.user_id} ({state})'

    @property
    def is_expired(self) -> bool:
        if self.licence_expiry is None:
            return False
        from django.utils import timezone

        return self.licence_expiry < timezone.now().date()

    @property
    def is_active(self) -> bool:
        return self.is_enabled and not self.is_expired


# Uploaded apps and their builds live in their own module for readability;
# re-exported here so Django discovers them and imports stay conventional.
from .data_models import AppRecord  # noqa: E402,F401
from .build_models import (  # noqa: E402,F401
    AppBuild,
    AppPackage,
    BuildState,
    app_package_upload_to,
)
