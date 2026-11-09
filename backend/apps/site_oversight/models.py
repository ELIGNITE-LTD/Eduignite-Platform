"""Oversight of school public websites by executive staff.

A *case* is one block of a school's site: who blocked it, why, what the school
must do, and the publication status to restore on unblock. An *event* is one
append-only line of the timeline (block, unblock, updated steps, executive
publish / unpublish / edit-on-behalf). Events are never edited or deleted.
"""

import uuid

from django.conf import settings
from django.db import models


class CaseState(models.TextChoices):
    OPEN = 'open', 'Blocked'
    RESOLVED = 'resolved', 'Unblocked'


class OversightAction(models.TextChoices):
    BLOCK = 'block', 'Blocked'
    UNBLOCK = 'unblock', 'Unblocked'
    STEPS_UPDATED = 'steps_updated', 'Resolution steps updated'
    PUBLISH = 'publish', 'Published by staff'
    UNPUBLISH = 'unpublish', 'Unpublished by staff'
    EDIT = 'edit', 'Content edited by staff'
    DELETE_CONTENT = 'delete_content', 'Content deleted by staff'


class SiteOversightCase(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='site_oversight_cases')
    state = models.CharField(max_length=10, choices=CaseState.choices, default=CaseState.OPEN, db_index=True)
    # publication_status the site had when it was blocked; restored exactly on unblock.
    previous_status = models.CharField(max_length=12, default='unpublished')
    block_reason = models.TextField()
    resolution_steps = models.TextField(blank=True, default='')
    blocked_at = models.DateTimeField(auto_now_add=True)
    blocked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    blocked_by_name = models.CharField(max_length=200, blank=True, default='')
    blocked_by_role = models.CharField(max_length=32, blank=True, default='')
    blocked_by_department = models.CharField(max_length=80, blank=True, default='')
    unblocked_at = models.DateTimeField(null=True, blank=True)
    unblocked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    unblocked_by_name = models.CharField(max_length=200, blank=True, default='')
    unblock_reason = models.TextField(blank=True, default='')
    restored_status = models.CharField(max_length=12, blank=True, default='')
    # True for rows created by the backfill of sites locked before this system existed.
    migrated = models.BooleanField(default=False)

    class Meta:
        ordering = ['-blocked_at']
        indexes = [models.Index(fields=['school', 'state'])]
        constraints = [
            models.UniqueConstraint(fields=['school'], condition=models.Q(state='open'),
                                    name='one_open_oversight_case_per_school'),
        ]

    def __str__(self):
        return f'{self.school_id} {self.state}'


class SiteOversightEvent(models.Model):
    """Append-only timeline line."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='site_oversight_events')
    case = models.ForeignKey(SiteOversightCase, null=True, blank=True, on_delete=models.SET_NULL,
                             related_name='events')
    action = models.CharField(max_length=20, choices=OversightAction.choices)
    reason = models.TextField()
    resolution_steps = models.TextField(blank=True, default='')
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    actor_name = models.CharField(max_length=200, blank=True, default='')
    actor_role = models.CharField(max_length=32, blank=True, default='')
    actor_department = models.CharField(max_length=80, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['created_at']
        indexes = [models.Index(fields=['school', 'created_at'])]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise PermissionError('Oversight events are append-only.')
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise PermissionError('Oversight events are append-only.')

    def __str__(self):
        return f'{self.school_id} {self.action}'
