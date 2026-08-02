"""Storage for app data.

One table holds every uploaded app's records. Apps never create tables and
never run schema migrations, so a bad build cannot alter the structure that
holds student records.

Every row carries the app it belongs to and the school it belongs to. Those two
columns are the isolation: the SDK sets them and app code has no way to reach a
row without them matching.
"""

import uuid

from django.db import models
from django_extensions.db.models import TimeStampedModel


class AppRecord(TimeStampedModel):
    """One record in one app's collection, for one school."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    #: Matches AppManifest.key. Not a foreign key: an app can be pulled from a
    #: release without orphaning the rows a school still owns.
    app_key = models.CharField(max_length=64, db_index=True)
    school = models.ForeignKey(
        'schools.School',
        on_delete=models.CASCADE,
        related_name='app_records',
    )
    collection = models.CharField(max_length=64, db_index=True)

    #: The record itself, shaped by the collection the app declared. Validated
    #: against that declaration on every write.
    data = models.JSONField(default=dict)

    #: Who created it, where the app recorded that. Null for records written by
    #: a scheduled job, which has no user.
    created_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='app_records_created',
    )

    class Meta:
        db_table = 'app_records'
        verbose_name = 'App record'
        verbose_name_plural = 'App records'
        indexes = [
            # The shape of every query the SDK can produce.
            models.Index(fields=['app_key', 'school', 'collection']),
            models.Index(fields=['app_key', 'school', 'collection', '-created']),
        ]
        ordering = ['-created']

    def __str__(self):
        return f'{self.app_key}/{self.collection}/{self.id}'
