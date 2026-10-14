from django.db import models
from django.core.validators import MinValueValidator
from django_extensions.db.models import TimeStampedModel
import uuid
import secrets
from decimal import Decimal


class FeeStructure(TimeStampedModel):
    ROLE_CHOICES = [
        ('STUDENT', 'Student'),
        ('PARENT', 'Parent'),
        ('TEACHER', 'Teacher'),
        ('STAFF', 'Staff'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='fee_structures')
    name = models.CharField(max_length=255, help_text='e.g., School Fees 2024-2025, Exam Fees')
    role = models.CharField(max_length=50, choices=ROLE_CHOICES, default='STUDENT')
    sub_school = models.ForeignKey(
        'schools.SubSchool',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='fee_structures',
        help_text='Optional sub-school target. When set (and no class), the fee applies to every class in this sub-school.'
    )
    school_class = models.ForeignKey(
        'schools.SchoolClass',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='fee_structures',
        help_text='Optional class/form target for student fee types.'
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal('0'))])
    currency = models.CharField(max_length=3, default='XAF')
    academic_year = models.CharField(max_length=20)
    due_date = models.DateField(null=True, blank=True)
    is_mandatory = models.BooleanField(default=True)
    description = models.TextField(blank=True, null=True)

    class Meta:
        ordering = ['-academic_year', 'role', 'name']
        unique_together = [['school', 'name', 'academic_year']]
        indexes = [
            models.Index(fields=['school', 'academic_year']),
            models.Index(fields=['school', 'school_class', 'academic_year']),
        ]

    def __str__(self):
        return f"{self.name} - {self.amount} {self.currency}"


class Payment(TimeStampedModel):
    # Platform/subscription charges are collected through mobile money
    # (MTN / Orange). School fees recorded by the bursar may also be taken as
    # cash or bank transfer. 'mobile_money' is kept for backwards compatibility
    # with historical records.
    PAYMENT_METHOD_CHOICES = [
        ('mtn_momo', 'MTN Mobile Money'),
        ('orange_money', 'Orange Money'),
        ('mobile_money', 'Mobile Money'),
        ('cash', 'Cash'),
        ('bank_transfer', 'Bank Transfer'),
    ]

    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('confirmed', 'Confirmed'),
        ('rejected', 'Rejected'),
        ('refunded', 'Refunded'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='payments')
    payer = models.ForeignKey('users.User', on_delete=models.CASCADE, related_name='payments')
    fee_structure = models.ForeignKey(FeeStructure, on_delete=models.SET_NULL, null=True, blank=True,
                                      related_name='payments')
    bursar = models.ForeignKey('users.User', on_delete=models.SET_NULL, null=True, blank=True,
                               related_name='processed_payments',
                               limit_choices_to={'role__in': ['BURSAR', 'SCHOOL_ADMIN']})
    amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal('0'))])
    currency = models.CharField(max_length=3, default='XAF')
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHOD_CHOICES)
    reference_number = models.CharField(max_length=100, unique=True, db_index=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    payment_date = models.DateField()
    confirmed_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True, null=True)
    receipt_number = models.CharField(max_length=100, null=True, blank=True, unique=True)

    class Meta:
        ordering = ['-payment_date', '-created']
        indexes = [
            models.Index(fields=['school', 'payment_date']),
            models.Index(fields=['payer', 'status']),
            models.Index(fields=['reference_number']),
        ]

    def __str__(self):
        return f"{self.reference_number} - {self.payer.get_full_name()} ({self.status})"

    def save(self, *args, **kwargs):
        if not self.reference_number:
            self.reference_number = self._generate_reference_number()
        super().save(*args, **kwargs)

    def _generate_reference_number(self):
        """Generate unique payment reference number"""
        from datetime import datetime
        timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
        random_suffix = secrets.token_hex(3).upper()
        return f"PAY-{timestamp}-{random_suffix}"


class Invoice(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    payment = models.OneToOneField(Payment, on_delete=models.CASCADE, related_name='invoice')
    invoice_number = models.CharField(max_length=100, unique=True, db_index=True)
    issued_at = models.DateTimeField(auto_now_add=True)
    issued_by = models.ForeignKey('users.User', on_delete=models.SET_NULL, null=True,
                                  related_name='issued_invoices')
    pdf_file = models.FileField(upload_to='invoices/', null=True, blank=True)

    class Meta:
        ordering = ['-issued_at']
        indexes = [
            models.Index(fields=['invoice_number']),
        ]

    def __str__(self):
        return f"Invoice {self.invoice_number}"

    def save(self, *args, **kwargs):
        if not self.invoice_number:
            self.invoice_number = self._generate_invoice_number()
        super().save(*args, **kwargs)

    def _generate_invoice_number(self):
        """Generate unique invoice number"""
        from django.utils import timezone
        date_str = timezone.now().strftime('%Y%m%d')
        count = Invoice.objects.filter(
            invoice_number__startswith=f"INV-{date_str}"
        ).count()
        return f"INV-{date_str}-{count + 1:05d}"


class SchoolFeeAssignment(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='school_fee_assignments')
    school_class = models.ForeignKey('schools.SchoolClass', on_delete=models.CASCADE, related_name='fee_assignments')
    academic_year = models.CharField(max_length=20)
    amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal('0'))])
    currency = models.CharField(max_length=3, default='XAF')
    notes = models.TextField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_school_fee_assignments',
    )
    updated_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='updated_school_fee_assignments',
    )

    class Meta:
        ordering = ['school_class__name', '-academic_year']
        unique_together = [['school_class', 'academic_year']]
        indexes = [
            models.Index(fields=['school', 'academic_year']),
            models.Index(fields=['school_class', 'is_active']),
        ]

    def __str__(self):
        return f"{self.school_class.name} - {self.academic_year} ({self.amount} {self.currency})"

    def save(self, *args, **kwargs):
        if self.school_class_id and not self.school_id:
            self.school = self.school_class.school
        super().save(*args, **kwargs)


class StudentSchoolFeeRecord(TimeStampedModel):
    STATUS_UNPAID = 'unpaid'
    STATUS_INCOMPLETE = 'incomplete'
    STATUS_PAID = 'paid'
    STATUS_CHOICES = [
        (STATUS_UNPAID, 'Unpaid'),
        (STATUS_INCOMPLETE, 'Incomplete Payment'),
        (STATUS_PAID, 'Paid'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='student_school_fee_records')
    fee_assignment = models.ForeignKey(
        SchoolFeeAssignment,
        on_delete=models.CASCADE,
        related_name='student_records',
    )
    student = models.ForeignKey('students.Student', on_delete=models.CASCADE, related_name='school_fee_records')
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal('0'))])
    amount_paid = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0'))],
    )
    balance = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0'))],
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_UNPAID)
    notes = models.TextField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    last_recorded_at = models.DateTimeField(null=True, blank=True)
    updated_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='updated_student_school_fee_records',
    )

    class Meta:
        ordering = ['fee_assignment__school_class__name', 'student__user__name']
        unique_together = [['fee_assignment', 'student']]
        indexes = [
            models.Index(fields=['school', 'status']),
            models.Index(fields=['student', 'is_active']),
            models.Index(fields=['fee_assignment', 'is_active']),
        ]

    def __str__(self):
        return f"{self.student.user.get_full_name()} - {self.fee_assignment.school_class.name} ({self.status})"

    def save(self, *args, **kwargs):
        if self.fee_assignment_id and not self.school_id:
            self.school = self.fee_assignment.school
        if self.fee_assignment_id and self.total_amount is None:
            self.total_amount = self.fee_assignment.amount
        from .ledger import apply_school_fee_status

        apply_school_fee_status(self)
        super().save(*args, **kwargs)


class GatewayTransaction(TimeStampedModel):
    """A mobile-money collection initiated through Fapshi."""

    PROVIDER_FAPSHI = 'fapshi'
    PROVIDER_CHOICES = [
        (PROVIDER_FAPSHI, 'Fapshi'),
    ]

    PURPOSE_PLATFORM = 'platform_charge'
    PURPOSE_APP = 'app_purchase'
    PURPOSE_SCHOOL = 'school_subscription'
    PURPOSE_AI_CREDITS = 'ai_credits'
    PURPOSE_CHOICES = [
        (PURPOSE_PLATFORM, 'Platform Charge'),
        (PURPOSE_APP, 'App Purchase'),
        (PURPOSE_SCHOOL, 'School Subscription'),
        (PURPOSE_AI_CREDITS, 'AI Credits'),
    ]

    STATUS_PENDING = 'PENDING'
    STATUS_SUCCESS = 'SUCCESS'
    STATUS_FAILED = 'FAILED'
    STATUS_CANCELLED = 'CANCELLED'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending'),
        (STATUS_SUCCESS, 'Success'),
        (STATUS_FAILED, 'Failed'),
        (STATUS_CANCELLED, 'Cancelled'),
    ]

    # Which gateway world collected this money. Sandbox test payments must
    # never be counted as revenue, shown on a dashboard, or processed by a live
    # webhook, so every row is stamped with the mode it was created in and the
    # money-bearing code paths filter on it.
    ENV_LIVE = 'live'
    ENV_SANDBOX = 'sandbox'
    ENVIRONMENT_CHOICES = [
        (ENV_LIVE, 'Live'),
        (ENV_SANDBOX, 'Sandbox'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    provider = models.CharField(max_length=20, choices=PROVIDER_CHOICES, default=PROVIDER_FAPSHI)
    purpose = models.CharField(max_length=30, choices=PURPOSE_CHOICES, default=PURPOSE_PLATFORM)
    app_key = models.CharField(max_length=64, blank=True, default='',
                               help_text='For an app purchase: which app the payment installs.')
    app_roles = models.JSONField(default=list, blank=True,
                                 help_text='For an app purchase: the roles the school chose.')
    ai_credits = models.PositiveIntegerField(default=0,
                                             help_text='For an AI credit purchase: how many credits it buys.')
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='gateway_transactions',
                               null=True, blank=True)
    initiated_by = models.ForeignKey('users.User', on_delete=models.SET_NULL, null=True, blank=True,
                                     related_name='gateway_transactions')
    beneficiary = models.ForeignKey('users.User', on_delete=models.SET_NULL, null=True, blank=True,
                                    related_name='gateway_beneficiary_transactions',
                                    help_text='The student the payment is for.')
    payment = models.OneToOneField(Payment, on_delete=models.SET_NULL, null=True, blank=True,
                                   related_name='gateway_transaction')

    amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal('0'))])
    currency = models.CharField(max_length=3, default='XAF')
    phone_number = models.CharField(max_length=20)
    gateway = models.CharField(max_length=30, blank=True, default='')

    transaction_id = models.CharField(max_length=100, unique=True, db_index=True)
    provider_transaction_id = models.CharField(max_length=100, blank=True, default='', db_index=True)

    environment = models.CharField(
        max_length=10, choices=ENVIRONMENT_CHOICES, default=ENV_LIVE, db_index=True,
        help_text='Live money, or a sandbox test. Only live rows count as revenue.')

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    status_reason = models.CharField(max_length=255, blank=True, default='')
    raw_response = models.JSONField(default=dict, blank=True)
    processed = models.BooleanField(default=False,
                                    help_text='Whether the successful-payment side effects have been applied.')

    class Meta:
        ordering = ['-created']
        indexes = [
            models.Index(fields=['school', 'status'], name='fees_gwtxn_school_idx'),
            models.Index(fields=['transaction_id'], name='fees_gwtxn_txnid_idx'),
        ]

    def __str__(self):
        return f'{self.provider} {self.transaction_id} ({self.status})'

    def _generate_transaction_id(self):
        return f'EIGPU{uuid.uuid4().hex[:16].upper()}'

    def save(self, *args, **kwargs):
        if not self.transaction_id:
            self.transaction_id = self._generate_transaction_id()
        super().save(*args, **kwargs)
