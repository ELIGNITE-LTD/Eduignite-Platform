import uuid

from django.db import models


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class PartnerProfile(TimeStampedModel):
    """Extra details for a self-serve partner account (a User with role PARTNER).

    The partner's referral code, referral stats and earnings all live on the
    existing referral system (users.referral_code + orders.my-referral); this
    only holds who they are and where their commission should be paid.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        'users.User', on_delete=models.CASCADE, related_name='partner_profile',
    )
    organization = models.CharField(max_length=180, blank=True, default='')
    phone = models.CharField(max_length=40, blank=True, default='')
    country = models.CharField(max_length=80, blank=True, default='Cameroon')
    # Where the referral commission is paid out (mobile-money number).
    payout_momo_number = models.CharField(max_length=40, blank=True, default='')

    class Meta:
        verbose_name = 'Partner Profile'

    def __str__(self):
        return f'Partner {self.user_id}'


class InvestmentInterest(TimeStampedModel):
    """A partner's expression of interest in investing. No money moves online —
    this is a lead the EduIgnite team follows up on and arranges offline."""

    class Status(models.TextChoices):
        NEW = 'New', 'New'
        REVIEWING = 'Reviewing', 'Reviewing'
        CLOSED = 'Closed', 'Closed'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.ForeignKey(
        'users.User', on_delete=models.CASCADE, related_name='investment_interests',
    )
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    currency = models.CharField(max_length=10, default='XAF')
    message = models.TextField(blank=True, default='')
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.NEW)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['status', 'created_at'])]

    def __str__(self):
        return f'{self.partner_id} — {self.amount} {self.currency}'
