import uuid

from django.conf import settings
from django.db import models


class ProprietorSchoolLink(models.Model):
    """A founder-made link: this PROPRIETOR owns / oversees this school.

    A school may have several proprietors (co-owners) and a proprietor may have
    any number of schools, from any education category. The link grants READ-ONLY
    statistics of the school and the right to reset the login details of that
    school's SCHOOL_ADMIN / SUB_ADMIN accounts. Nothing else.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    proprietor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='proprietor_links',
    )
    school = models.ForeignKey(
        'schools.School', on_delete=models.CASCADE, related_name='proprietor_links',
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'proprietors_school_link'
        ordering = ['school__name']
        constraints = [
            models.UniqueConstraint(fields=['proprietor', 'school'], name='uniq_proprietor_school_link'),
        ]
        indexes = [models.Index(fields=['school'])]

    def __str__(self):
        return f'{self.proprietor_id} -> {self.school_id}'


class ProprietorActionLog(models.Model):
    """Audit trail of everything proprietor-related. Never holds a secret."""

    ACTION_CREATED = 'proprietor_created'
    ACTION_UPDATED = 'proprietor_updated'
    ACTION_DEACTIVATED = 'proprietor_deactivated'
    ACTION_ACTIVATED = 'proprietor_activated'
    ACTION_PASSWORD_ISSUED = 'proprietor_password_issued'
    ACTION_SCHOOLS_SET = 'schools_set'
    ACTION_REAUTH_FAILED = 'reauth_failed'
    ACTION_LOCKED_OUT = 'reauth_locked_out'
    ACTION_CREDENTIALS_RESET = 'credentials_reset'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    proprietor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='proprietor_action_logs',
    )
    school = models.ForeignKey(
        'schools.School', on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    target_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    action = models.CharField(max_length=40, db_index=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    detail = models.CharField(max_length=500, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'proprietors_action_log'
        ordering = ['-created_at']
        indexes = [models.Index(fields=['proprietor', 'created_at'])]

    def __str__(self):
        return f'{self.action} by {self.actor_id}'
