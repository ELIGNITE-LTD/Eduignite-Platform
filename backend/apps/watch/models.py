import uuid

from django.conf import settings
from django.db import models


class WatchIncident(models.Model):
    """One problem the system noticed on its own, grouped so a thousand repeats are one line with a count.

    Equal problems share a fingerprint; while one is open, repeats only raise its count and the people and schools
    it touched. A founder acknowledges it (someone is on it) and resolves it (it is fixed); a resolved problem that
    returns reopens the same incident instead of starting a new pile.
    """

    CATEGORIES = [
        ('server', 'Server errors'), ('client', 'App errors on devices'), ('security', 'Security'), ('health', 'System health'),
        ('payments', 'Payments'), ('ai', 'AI service'), ('email', 'Email delivery'), ('jobs', 'Background jobs'), ('traffic', 'Traffic'),
    ]
    SEVERITIES = [('info', 'Info'), ('warning', 'Warning'), ('critical', 'Critical')]
    STATUSES = [('open', 'Open'), ('acknowledged', 'Being handled'), ('resolved', 'Resolved'), ('ignored', 'Ignored')]
    RANK = {'info': 0, 'warning': 1, 'critical': 2}

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    fingerprint = models.CharField(max_length=64, db_index=True)
    category = models.CharField(max_length=12, choices=CATEGORIES)
    severity = models.CharField(max_length=10, choices=SEVERITIES, default='warning')
    source = models.CharField(max_length=12, blank=True)         # api, web, mobile, desktop, worker, monitor
    title = models.CharField(max_length=200)
    message = models.TextField(blank=True)
    details = models.JSONField(default=dict, blank=True)
    school = models.ForeignKey('schools.School', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    school_name = models.CharField(max_length=200, blank=True)
    count = models.PositiveIntegerField(default=1)
    affected_users = models.PositiveIntegerField(default=0)
    user_ids = models.JSONField(default=list, blank=True)        # up to 100 ids, to count distinct people
    affected_schools = models.JSONField(default=list, blank=True)  # up to 50 [{id, name}]
    first_seen = models.DateTimeField(auto_now_add=True)
    last_seen = models.DateTimeField()
    status = models.CharField(max_length=14, choices=STATUSES, default='open')
    acknowledged_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    resolved_at = models.DateTimeField(null=True, blank=True)
    last_alerted_at = models.DateTimeField(null=True, blank=True)
    last_alerted_count = models.PositiveIntegerField(default=0)
    alert_count = models.PositiveIntegerField(default=0)
    notes = models.JSONField(default=list, blank=True)           # [{at, by, text}]

    class Meta:
        db_table = 'watch_incidents'
        ordering = ['-last_seen']
        indexes = [
            models.Index(fields=['status', 'severity', '-last_seen']),
            models.Index(fields=['category', '-last_seen']),
        ]

    def __str__(self):
        return f'{self.severity}: {self.title}'


class WatchCheck(models.Model):
    """The latest result of one scheduled health check (database, cache, workers, disk, error rate...)."""

    key = models.CharField(max_length=40, unique=True)
    label = models.CharField(max_length=80)
    status = models.CharField(max_length=8, default='ok')        # ok | warn | fail
    detail = models.CharField(max_length=300, blank=True)
    latency_ms = models.PositiveIntegerField(null=True, blank=True)
    checked_at = models.DateTimeField()
    since = models.DateTimeField()                                # when it last changed status

    class Meta:
        db_table = 'watch_checks'
        ordering = ['key']


class WatchHourly(models.Model):
    """Counts per hour for the traffic chart: requests, server errors, client errors, failed sign-ins."""

    hour = models.DateTimeField(unique=True)
    requests = models.PositiveIntegerField(default=0)
    errors_5xx = models.PositiveIntegerField(default=0)
    errors_4xx = models.PositiveIntegerField(default=0)
    slow = models.PositiveIntegerField(default=0)
    client_errors = models.PositiveIntegerField(default=0)
    login_failures = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'watch_hourly'
        ordering = ['-hour']


class WatchAlertLog(models.Model):
    """Every alert email sent to the founders: what, when, to whom, and whether the provider took it."""

    incident = models.ForeignKey(WatchIncident, null=True, blank=True, on_delete=models.SET_NULL, related_name='alerts')
    kind = models.CharField(max_length=12)                        # critical, escalation, recurrence, recovery, digest, test
    subject = models.CharField(max_length=250)
    recipients = models.JSONField(default=list)
    delivered = models.PositiveSmallIntegerField(default=0)
    sent_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'watch_alert_log'
        ordering = ['-sent_at']
