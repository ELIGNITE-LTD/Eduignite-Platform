"""The records behind AI credits.

Five tables, each with one job:

  * `AICreditConfig` - every number the business may want to change: the daily
    allowance, the price of a credit, how tokens turn into credits. One row,
    edited by executives, so a price change is a form and not a deploy.
  * `AICreditAccount` - what a person holds right now, in two separate
    buckets: today's free allowance and credits they paid for.
  * `AICreditTransaction` - the ledger. Every movement of credits is a row, so
    any balance can be explained line by line.
  * `AICreditHold` - credits set aside while an AI request runs, so two
    requests at once cannot both spend the same credits, and a request that
    fails gives them back.
  * `AIUsageRecord` - what each AI request actually cost: tokens in and out,
    model, credits estimated and charged, and what the provider billed us.
    This is what the economics dashboard reads.
"""

import uuid
from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Q

from core.models import TimeStampedModel


def default_feature_multipliers():
    # How much heavier one feature's work is than a plain chat answer, on top
    # of the tokens it actually uses. Keys are the AI feature names used across
    # the platform; the last few are for features not built yet, so they are
    # priced the day they arrive.
    return {
        'chat': 1.0,
        'study_plan': 1.2,
        'grade_analysis': 1.0,
        'attendance_insight': 1.0,
        'exam_prep': 1.2,
        'parent_report': 1.0,
        'teacher_insight': 1.0,
        'ai_exam_generation': 1.5,
        'career_orientation': 1.3,
        'academic_roadmap': 1.3,
        'skill_gap_analysis': 1.2,
        'student_guidance': 1.2,
        # A question sent as a photo: the model has to read the picture before
        # it can start answering, so it weighs more than a typed question.
        'image_question': 1.5,
        'math_solver': 1.3,
        'quiz_generation': 1.5,
        'study_notes': 1.3,
        'document_analysis': 1.5,
        'lesson_generation': 2.0,
        'course_generation': 2.5,
    }


def default_model_multipliers():
    # A bigger model costs us more per token, so it costs the user more too.
    return {
        'openai/gpt-oss-120b': 1.0,
        'openai/gpt-oss-20b': 0.5,
        'llama-3.3-70b-versatile': 1.0,
        'llama-3.1-8b-instant': 0.3,
        'qwen/qwen3.8-27b': 1.0,
        'meta-llama/llama-4-scout-17b-16e-instruct': 1.0,
        'meta-llama/llama-4-maverick-17b-128e-instruct': 1.3,
    }


def default_feature_estimates():
    # What a typical request of each feature sends and receives, in tokens,
    # before the system prompt. Used only to estimate before the work starts;
    # the charge is always taken from what the provider reports afterwards.
    return {
        'study_plan': {'input_tokens': 900, 'output_tokens': 1500},
        'grade_analysis': {'input_tokens': 900, 'output_tokens': 1100},
        'attendance_insight': {'input_tokens': 700, 'output_tokens': 900},
        'exam_prep': {'input_tokens': 800, 'output_tokens': 1500},
        'parent_report': {'input_tokens': 800, 'output_tokens': 1000},
        'career_orientation': {'input_tokens': 1200, 'output_tokens': 1100},
        'academic_roadmap': {'input_tokens': 1200, 'output_tokens': 1600},
        'skill_gap_analysis': {'input_tokens': 1200, 'output_tokens': 1400},
        'student_guidance': {'input_tokens': 1400, 'output_tokens': 1600},
    }


def default_provider_costs():
    # What the AI provider charges us, in FCFA per million tokens. These are
    # starting estimates from Groq's published USD prices at about 600 FCFA to
    # the dollar; set them from the real invoice before trusting the margins.
    return {
        'openai/gpt-oss-120b': {'input_per_million': 90, 'cached_input_per_million': 45, 'output_per_million': 360},
        'openai/gpt-oss-20b': {'input_per_million': 45, 'cached_input_per_million': 23, 'output_per_million': 180},
        'llama-3.3-70b-versatile': {'input_per_million': 354, 'cached_input_per_million': 177, 'output_per_million': 474},
        'llama-3.1-8b-instant': {'input_per_million': 30, 'cached_input_per_million': 15, 'output_per_million': 48},
        'qwen/qwen3.8-27b': {'input_per_million': 174, 'cached_input_per_million': 174, 'output_per_million': 354},
        'meta-llama/llama-4-scout-17b-16e-instruct': {'input_per_million': 66, 'cached_input_per_million': 66, 'output_per_million': 204},
        'meta-llama/llama-4-maverick-17b-128e-instruct': {'input_per_million': 120, 'cached_input_per_million': 120, 'output_per_million': 360},
    }


class AICreditConfig(models.Model):
    """The one row of settings the credit engine prices everything with."""

    PARTIAL_CHARGE_ACTUAL = 'charge_actual'
    PARTIAL_CHARGE_HALF = 'charge_half'
    PARTIAL_REFUND = 'refund'
    PARTIAL_POLICY_CHOICES = [
        (PARTIAL_CHARGE_ACTUAL, 'Charge what was generated'),
        (PARTIAL_CHARGE_HALF, 'Charge half of what was generated'),
        (PARTIAL_REFUND, 'Charge nothing for a cut-off answer'),
    ]

    # --- Free or paying -------------------------------------------------------
    # Off: EduIgnite AI is free for everyone - nothing is charged or sold, and
    # every request is still recorded so its real cost can be studied. On:
    # AI is paid for in credits as below. Only the founders switch it.
    billing_enabled = models.BooleanField(
        default=False,
        help_text='Off: AI is free for everyone (testing). On: AI is paid for in credits.',
    )

    # --- The allowance -------------------------------------------------------
    daily_free_credits = models.PositiveIntegerField(default=100)
    guest_daily_free_credits = models.PositiveIntegerField(
        default=30,
        help_text='Daily free credits for people using a chat bot without an EduIgnite account.',
    )
    exempt_platform_executives = models.BooleanField(
        default=True,
        help_text='Executives run the platform and are never charged; their usage is still recorded.',
    )

    # --- Buying credits ------------------------------------------------------
    # Deliberately empty until the business sets it: the price of a credit is
    # a decision to take from real cost data, not a number to guess in code.
    # While it is empty, buying is switched off and says so.
    price_per_credit = models.DecimalField(
        max_digits=10, decimal_places=4, null=True, blank=True,
        validators=[MinValueValidator(Decimal('0'))],
        help_text='FCFA charged for one credit. Leave empty to keep purchases closed.',
    )
    currency = models.CharField(max_length=3, default='XAF')
    min_purchase_credits = models.PositiveIntegerField(default=100)
    max_purchase_credits = models.PositiveIntegerField(default=100000)

    # --- Turning AI work into credits ---------------------------------------
    credits_per_1k_input_tokens = models.DecimalField(max_digits=8, decimal_places=3, default=Decimal('1.000'))
    credits_per_1k_cached_input_tokens = models.DecimalField(max_digits=8, decimal_places=3, default=Decimal('0.250'))
    credits_per_1k_output_tokens = models.DecimalField(max_digits=8, decimal_places=3, default=Decimal('5.000'))
    minimum_charge = models.PositiveIntegerField(default=3, help_text='The least any answered request costs.')
    per_document_credits = models.PositiveIntegerField(default=2, help_text='Added for each attached document.')
    per_image_credits = models.PositiveIntegerField(
        default=5, help_text='Added for each image a question is sent with, on top of the tokens it uses.',
    )
    estimated_tokens_per_image = models.PositiveIntegerField(
        default=1300, help_text='Input tokens one image is expected to use, for estimates only.',
    )
    cached_response_credits = models.PositiveIntegerField(
        default=1, help_text='Charged when an answer is served from cache instead of generated.',
    )
    feature_multipliers = models.JSONField(default=default_feature_multipliers, blank=True)
    model_multipliers = models.JSONField(default=default_model_multipliers, blank=True)
    feature_estimates = models.JSONField(default=default_feature_estimates, blank=True)
    partial_response_policy = models.CharField(
        max_length=20, choices=PARTIAL_POLICY_CHOICES, default=PARTIAL_CHARGE_ACTUAL,
    )

    # --- How the apps behave -------------------------------------------------
    confirm_above_credits = models.PositiveIntegerField(
        default=30, help_text='Ask before starting any request estimated above this many credits.',
    )
    low_balance_threshold = models.PositiveIntegerField(default=20)
    hold_timeout_minutes = models.PositiveIntegerField(
        default=30, help_text='A hold older than this is returned; the request behind it has died.',
    )

    # --- What it costs us ----------------------------------------------------
    provider_costs = models.JSONField(default=default_provider_costs, blank=True)
    payment_processing_percent = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal('0'),
        help_text='Share of each credit sale kept by the payment gateway.',
    )
    infrastructure_cost_per_request = models.DecimalField(
        max_digits=10, decimal_places=4, default=Decimal('0'),
        help_text='FCFA of server cost to attribute to each AI request.',
    )

    updated_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'ai_credit_config'
        verbose_name = 'AI credit configuration'

    def __str__(self):
        return 'AI credit configuration'

    def save(self, *args, **kwargs):
        # One row, always the same one.
        self.pk = 1
        super().save(*args, **kwargs)

    @property
    def purchases_enabled(self):
        # Nothing is sold while AI is free.
        return self.billing_enabled and self.price_per_credit is not None and self.price_per_credit > 0


class AICreditAccount(models.Model):
    """What one person holds, in two buckets that are never mixed."""

    user = models.OneToOneField('users.User', on_delete=models.CASCADE, related_name='ai_credit_account')
    # Today's allowance. Replaced, not added to, when a new day starts.
    daily_free_remaining = models.IntegerField(default=0)
    daily_free_allowance = models.IntegerField(default=0)
    # The day `daily_free_remaining` belongs to, in the credit timezone.
    cycle_date = models.DateField()
    # Paid for, and kept until spent.
    purchased_balance = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'ai_credit_accounts'
        constraints = [
            # The last line of defence: whatever goes wrong above, the
            # database refuses to store a negative balance.
            models.CheckConstraint(check=Q(daily_free_remaining__gte=0), name='ai_credit_free_not_negative'),
            models.CheckConstraint(check=Q(purchased_balance__gte=0), name='ai_credit_purchased_not_negative'),
        ]

    def __str__(self):
        return f'{self.user} - {self.daily_free_remaining} free, {self.purchased_balance} purchased'

    @property
    def total_available(self):
        return self.daily_free_remaining + self.purchased_balance


class AICreditTransaction(models.Model):
    """One line of the credit ledger. Written once, never edited."""

    DAILY_FREE = 'DAILY_FREE'
    DAILY_EXPIRY = 'DAILY_EXPIRY'
    AI_USAGE = 'AI_USAGE'
    PURCHASE = 'PURCHASE'
    REFUND = 'REFUND'
    BONUS = 'BONUS'
    ADMIN_ADJUSTMENT = 'ADMIN_ADJUSTMENT'
    TRANSFER = 'TRANSFER'
    KIND_CHOICES = [
        (DAILY_FREE, 'Daily free credits'),
        (DAILY_EXPIRY, 'Unused daily credits expired'),
        (AI_USAGE, 'AI usage'),
        (PURCHASE, 'Credit purchase'),
        (REFUND, 'Refund'),
        (BONUS, 'Bonus'),
        (ADMIN_ADJUSTMENT, 'Adjustment'),
        (TRANSFER, 'Moved between accounts'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey('users.User', on_delete=models.CASCADE, related_name='ai_credit_transactions')
    kind = models.CharField(max_length=20, choices=KIND_CHOICES, db_index=True)
    # Signed. What the two buckets moved by, and their sum.
    amount = models.IntegerField()
    free_delta = models.IntegerField(default=0)
    purchased_delta = models.IntegerField(default=0)
    # The account straight after this line was applied.
    balance_after = models.IntegerField()
    free_balance_after = models.IntegerField()
    purchased_balance_after = models.IntegerField()
    feature = models.CharField(max_length=50, blank=True, default='')
    description = models.CharField(max_length=255, blank=True, default='')
    # What caused it: an AI request, a payment, a day. A purchase or a usage
    # charge can only be recorded once per reference, which is what makes
    # crediting a payment twice, or charging a request twice, impossible.
    reference_id = models.CharField(max_length=100, blank=True, default='', db_index=True)
    usage = models.ForeignKey(
        'ai_features.AIUsageRecord', on_delete=models.SET_NULL, null=True, blank=True, related_name='transactions',
    )
    created_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
        help_text='The executive behind a manual adjustment.',
    )
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = 'ai_credit_transactions'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', '-created_at'], name='ai_credit_txn_user_idx'),
            models.Index(fields=['kind', 'created_at'], name='ai_credit_txn_kind_idx'),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['kind', 'reference_id'],
                condition=Q(kind__in=['PURCHASE', 'AI_USAGE']) & ~Q(reference_id=''),
                name='ai_credit_txn_unique_reference',
            ),
        ]

    def __str__(self):
        return f'{self.kind} {self.amount:+d} ({self.user})'


class AICreditHold(models.Model):
    """Credits set aside for a request that is still running."""

    HELD = 'HELD'
    SETTLED = 'SETTLED'
    RELEASED = 'RELEASED'
    STATUS_CHOICES = [(HELD, 'Held'), (SETTLED, 'Settled'), (RELEASED, 'Released')]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey('users.User', on_delete=models.CASCADE, related_name='ai_credit_holds')
    ai_request = models.OneToOneField(
        'ai_features.AIRequest', on_delete=models.SET_NULL, null=True, blank=True, related_name='credit_hold',
    )
    feature = models.CharField(max_length=50)
    estimated_credits = models.PositiveIntegerField()
    free_amount = models.PositiveIntegerField(default=0)
    purchased_amount = models.PositiveIntegerField(default=0)
    # Free credits held from one day are not given back on the next.
    cycle_date = models.DateField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=HELD, db_index=True)
    release_reason = models.CharField(max_length=255, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'ai_credit_holds'
        ordering = ['-created_at']
        indexes = [models.Index(fields=['status', 'created_at'], name='ai_credit_hold_status_idx')]

    def __str__(self):
        return f'{self.estimated_credits} held for {self.feature} ({self.status})'

    @property
    def amount(self):
        return self.free_amount + self.purchased_amount


class AIUsageRecord(TimeStampedModel):
    """What one AI request used, what it was charged, and what it cost us."""

    COMPLETED = 'completed'
    PARTIAL = 'partial'
    FAILED = 'failed'
    EXEMPT = 'exempt'
    CACHED = 'cached'
    STATUS_CHOICES = [
        (COMPLETED, 'Completed'),
        (PARTIAL, 'Partial (cut off)'),
        (FAILED, 'Failed - not charged'),
        (EXEMPT, 'Exempt - not charged'),
        (CACHED, 'Served from cache'),
    ]

    user = models.ForeignKey('users.User', on_delete=models.CASCADE, related_name='ai_usage_records')
    school = models.ForeignKey(
        'schools.School', on_delete=models.SET_NULL, null=True, blank=True, related_name='ai_usage_records',
    )
    ai_request = models.ForeignKey(
        'ai_features.AIRequest', on_delete=models.SET_NULL, null=True, blank=True, related_name='usage_records',
    )
    hold = models.OneToOneField(AICreditHold, on_delete=models.SET_NULL, null=True, blank=True, related_name='usage')
    feature = models.CharField(max_length=50, db_index=True)
    # Where the question was asked: the apps, or a chat bot.
    channel = models.CharField(max_length=20, default='app', db_index=True)
    model = models.CharField(max_length=100, blank=True, default='')
    provider_calls = models.PositiveIntegerField(default=0)
    input_tokens = models.PositiveIntegerField(default=0)
    output_tokens = models.PositiveIntegerField(default=0)
    cached_tokens = models.PositiveIntegerField(default=0)
    documents_count = models.PositiveIntegerField(default=0)
    images_count = models.PositiveIntegerField(default=0)
    estimated_credits = models.PositiveIntegerField(default=0)
    # What the work was worth by the pricing rules, what was actually taken
    # from the account, and any difference the platform absorbed.
    actual_credits = models.PositiveIntegerField(default=0)
    charged_credits = models.PositiveIntegerField(default=0)
    waived_credits = models.PositiveIntegerField(default=0)
    provider_cost = models.DecimalField(max_digits=12, decimal_places=4, default=Decimal('0'))
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default=COMPLETED, db_index=True)
    processing_time_ms = models.PositiveIntegerField(default=0)
    error = models.CharField(max_length=255, blank=True, default='')

    class Meta:
        db_table = 'ai_usage_records'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', '-created_at'], name='ai_usage_user_idx'),
            models.Index(fields=['feature', 'created_at'], name='ai_usage_feature_idx'),
        ]

    def __str__(self):
        return f'{self.feature} {self.charged_credits} credits ({self.user})'
