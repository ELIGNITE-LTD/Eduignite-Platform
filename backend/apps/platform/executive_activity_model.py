"""The executive activity log model (re-exported from ``apps.platform.models``)."""

import uuid

from django.db import models
from django.utils import timezone


class ExecutiveActivityQuerySet(models.QuerySet):
    """Read-only history: rows are never edited or removed through the ORM.

    Retention is the one exception and goes through ``prune_executive_activity``
    (which uses ``_raw_delete`` deliberately). Nothing else may call these.
    """

    def update(self, **kwargs):
        raise PermissionError('ExecutiveActivityLog is immutable.')

    def delete(self):
        raise PermissionError('ExecutiveActivityLog is immutable.')


class ExecutiveActivityLog(models.Model):
    """Accountability trail of what platform executives (and founders) did.

    One row per recorded activity. Rows are append-only. Snapshots (actor name
    and role) keep the entry readable even if the account is later renamed or
    removed. Never stores request bodies, passwords, tokens or message text.

    ``ip_address`` is the raw client address on purpose: accountability needs
    it. Access is limited to the CEO and CTO (see ``IsFounderCEOOrCTO``).
    """

    class Outcome(models.TextChoices):
        SUCCESS = 'success', 'Success'
        DENIED = 'denied', 'Denied'
        FAILED = 'failed', 'Failed'
        ERROR = 'error', 'Error'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    actor = models.ForeignKey(
        'users.User', null=True, blank=True, on_delete=models.SET_NULL,
        related_name='executive_activity', editable=False,
    )
    actor_role = models.CharField(max_length=32, blank=True, default='')
    actor_name = models.CharField(max_length=255, blank=True, default='')
    module = models.CharField(max_length=64, blank=True, default='')
    action = models.CharField(max_length=48)
    target_type = models.CharField(max_length=64, blank=True, default='')
    target_id = models.CharField(max_length=64, blank=True, default='')
    target_label = models.CharField(max_length=255, blank=True, default='')
    summary = models.CharField(max_length=500, blank=True, default='')
    outcome = models.CharField(max_length=12, choices=Outcome.choices, default=Outcome.SUCCESS)
    method = models.CharField(max_length=10, blank=True, default='')
    path = models.CharField(max_length=300, blank=True, default='')
    status_code = models.PositiveSmallIntegerField(null=True, blank=True)
    ip_address = models.CharField(max_length=64, blank=True, default='')
    user_agent = models.CharField(max_length=255, blank=True, default='')
    request_id = models.CharField(max_length=64, blank=True, default='')
    created_at = models.DateTimeField(default=timezone.now, editable=False)

    objects = ExecutiveActivityQuerySet.as_manager()

    class Meta:
        app_label = 'platform'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['actor', '-created_at'], name='exec_act_actor_created'),
            models.Index(fields=['module', '-created_at'], name='exec_act_module_created'),
            models.Index(fields=['-created_at'], name='exec_act_created'),
        ]

    def __str__(self):
        return f'{self.created_at:%Y-%m-%d %H:%M} {self.actor_name} {self.action} {self.module}'

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise PermissionError('ExecutiveActivityLog is immutable.')
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise PermissionError('ExecutiveActivityLog is immutable.')
