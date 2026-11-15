"""Founder outreach: schools EduIgnite would like to reach, and the emails sent to them.

A contact is a school that is NOT (yet) on EduIgnite, with its public contact
address. Nothing here touches ``schools.School`` or any school's own data.
"""

import secrets
import uuid

from django.conf import settings
from django.db import models
from django.db.models.functions import Lower


def _token():
    return secrets.token_urlsafe(24)


class Region(models.TextChoices):
    ADAMAWA = 'adamawa', 'Adamawa'
    CENTRE = 'centre', 'Centre'
    EAST = 'east', 'East'
    FAR_NORTH = 'far_north', 'Far North'
    LITTORAL = 'littoral', 'Littoral'
    NORTH = 'north', 'North'
    NORTH_WEST = 'north_west', 'North-West'
    SOUTH = 'south', 'South'
    SOUTH_WEST = 'south_west', 'South-West'
    WEST = 'west', 'West'
    UNKNOWN = 'unknown', 'Region not set'


class Level(models.TextChoices):
    NURSERY = 'nursery', 'Nursery'
    PRIMARY = 'primary', 'Primary'
    SECONDARY = 'secondary', 'Secondary'
    TECHNICAL = 'technical', 'Technical / vocational'
    HIGHER = 'higher', 'Higher education'
    OTHER = 'other', 'Other'


class ContactStatus(models.TextChoices):
    NEW = 'new', 'Not contacted'
    QUEUED = 'queued', 'Queued'
    SENT = 'sent', 'Contacted'
    FAILED = 'failed', 'Failed'
    BOUNCED = 'bounced', 'Bounced'
    UNSUBSCRIBED = 'unsubscribed', 'Unsubscribed'


class OutreachContact(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school_name = models.CharField(max_length=200)
    level = models.CharField(max_length=12, choices=Level.choices, default=Level.OTHER, db_index=True)
    region = models.CharField(max_length=12, choices=Region.choices, default=Region.UNKNOWN, db_index=True)
    town = models.CharField(max_length=120, blank=True, default='')
    email = models.EmailField(max_length=254)
    phone = models.CharField(max_length=40, blank=True, default='')
    website = models.URLField(max_length=300, blank=True, default='')
    source_url = models.URLField(max_length=500, blank=True, default='')
    language = models.CharField(max_length=2, choices=[('en', 'English'), ('fr', 'French')], default='en')
    notes = models.CharField(max_length=500, blank=True, default='')
    status = models.CharField(max_length=14, choices=ContactStatus.choices, default=ContactStatus.NEW, db_index=True)
    sent_count = models.PositiveIntegerField(default=0)
    first_sent_at = models.DateTimeField(null=True, blank=True)
    last_sent_at = models.DateTimeField(null=True, blank=True)
    last_error = models.CharField(max_length=300, blank=True, default='')
    unsubscribed_at = models.DateTimeField(null=True, blank=True)
    unsubscribe_token = models.CharField(max_length=64, unique=True, default=_token, editable=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'outreach_contacts'
        ordering = ['region', 'level', 'school_name']
        constraints = [models.UniqueConstraint(Lower('email'), name='outreach_contact_unique_email')]
        indexes = [models.Index(fields=['region', 'level', 'status'], name='outreach_region_level_status')]

    def __str__(self):
        return f'{self.school_name} <{self.email}>'

    def save(self, *args, **kwargs):
        self.email = (self.email or '').strip().lower()
        super().save(*args, **kwargs)


class CampaignStatus(models.TextChoices):
    RUNNING = 'running', 'Sending'
    DONE = 'done', 'Finished'
    CANCELLED = 'cancelled', 'Cancelled'


class OutreachCampaign(models.Model):
    """One message written by a founder or an assigned executive, sent to the contacts they selected."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    subject = models.CharField(max_length=200)
    body = models.TextField(max_length=8000)
    status = models.CharField(max_length=10, choices=CampaignStatus.choices, default=CampaignStatus.RUNNING)
    sent_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'outreach_campaigns'
        ordering = ['-created_at']


class SendStatus(models.TextChoices):
    QUEUED = 'queued', 'Queued'
    SENT = 'sent', 'Sent'
    FAILED = 'failed', 'Failed'
    SKIPPED = 'skipped', 'Skipped'
    CANCELLED = 'cancelled', 'Cancelled'


class OutreachSend(models.Model):
    """One email to one contact within a campaign (the audit trail of who was emailed, when)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    campaign = models.ForeignKey(OutreachCampaign, on_delete=models.CASCADE, related_name='sends')
    contact = models.ForeignKey(OutreachContact, on_delete=models.CASCADE, related_name='sends')
    status = models.CharField(max_length=10, choices=SendStatus.choices, default=SendStatus.QUEUED, db_index=True)
    error = models.CharField(max_length=300, blank=True, default='')
    queued_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'outreach_sends'
        ordering = ['queued_at']
        constraints = [models.UniqueConstraint(fields=['campaign', 'contact'], name='outreach_send_once_per_campaign')]
        indexes = [models.Index(fields=['status', 'queued_at'], name='outreach_send_queue')]
