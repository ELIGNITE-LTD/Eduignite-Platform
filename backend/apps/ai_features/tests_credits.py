"""AI credits: the daily allowance, charging by work done, buying, and failure.

The provider is faked at the Groq client, so every request runs the real path:
the view estimates and holds, `call_groq_api` reports the tokens, and the
meter settles or refunds. What each test checks is what a student or the
business would notice if it went wrong: a balance, a ledger line, a payment.
"""

import threading
from datetime import timedelta
from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.db import connection
from django.db.models import Sum
from django.test import TestCase, TransactionTestCase, override_settings
from rest_framework.test import APIClient

from apps.ai_features import credit_engine
from apps.ai_features import credit_pricing as pricing
from apps.ai_features.credit_models import (
    AICreditAccount,
    AICreditConfig,
    AICreditHold,
    AICreditTransaction,
    AIUsageRecord,
)
from apps.ai_features.models import AIRequest
from apps.fees.models import GatewayTransaction

User = get_user_model()

CHAT_URL = '/api/v1/ai/chat/'
BALANCE_URL = '/api/v1/ai/credits/'
ESTIMATE_URL = '/api/v1/ai/credits/estimate/'
HISTORY_URL = '/api/v1/ai/credits/history/'
USAGE_URL = '/api/v1/ai/credits/usage/'
PRICING_URL = '/api/v1/ai/credits/pricing/'
PURCHASE_URL = '/api/v1/ai/credits/purchase/'
QUOTA_URL = '/api/v1/ai/chat/quota/'
MODEL = 'openai/gpt-oss-120b'


def enable_billing(**fields):
    """Paying mode, as these tests describe it. AI is free by default."""
    config, _ = AICreditConfig.objects.get_or_create(pk=1)
    config.billing_enabled = True
    for key, value in fields.items():
        setattr(config, key, value)
    config.save()
    credit_engine.invalidate_config()
    return config


def completion(text='Here is the answer.', *, input_tokens=2200, output_tokens=300, cached=0, finish='stop'):
    """A fake Groq completion with the usage a real one reports."""
    result = MagicMock()
    choice = MagicMock()
    choice.message.content = text
    choice.finish_reason = finish
    result.choices = [choice]
    result.usage.prompt_tokens = input_tokens
    result.usage.completion_tokens = output_tokens
    result.usage.total_tokens = input_tokens + output_tokens
    result.usage.prompt_tokens_details.cached_tokens = cached
    return result


def groq_returning(*completions, error=None):
    """Patch the Groq client to answer with these completions, in order."""
    groq = patch('groq.Groq')
    mock = groq.start()
    create = mock.return_value.chat.completions.create
    if error is not None:
        create.side_effect = error
    else:
        create.side_effect = list(completions)
    return groq, create


def ledger_sum(user, field):
    return AICreditTransaction.objects.filter(user=user).aggregate(total=Sum(field))['total'] or 0


def held(user, field):
    return AICreditHold.objects.filter(user=user, status=AICreditHold.HELD).aggregate(total=Sum(field))['total'] or 0


class CreditTestMixin:
    def make_user(self, matricule, role='STUDENT', **extra):
        return User.objects.create_user(
            matricule=matricule, name='Test Person', email=f'{matricule.lower()}@example.org',
            role=role, password='not-a-real-password', **extra,
        )

    def configure(self, **fields):
        config, _ = AICreditConfig.objects.get_or_create(pk=1)
        for key, value in fields.items():
            setattr(config, key, value)
        config.save()
        enable_billing()
        return config

    def account(self, user):
        return AICreditAccount.objects.get(user=user)

    def set_balance(self, user, *, free=None, purchased=None, cycle_date=None):
        account = credit_engine.get_account(user)
        # Record the change on the ledger too, so the books still balance.
        free_delta = 0 if free is None else free - account.daily_free_remaining
        purchased_delta = 0 if purchased is None else purchased - account.purchased_balance
        if free is not None:
            account.daily_free_remaining = free
        if purchased is not None:
            account.purchased_balance = purchased
        if cycle_date is not None:
            account.cycle_date = cycle_date
        account.save()
        if free_delta or purchased_delta:
            AICreditTransaction.objects.create(
                user=user, kind=AICreditTransaction.ADMIN_ADJUSTMENT, amount=free_delta + purchased_delta,
                free_delta=free_delta, purchased_delta=purchased_delta,
                balance_after=account.total_available, free_balance_after=account.daily_free_remaining,
                purchased_balance_after=account.purchased_balance, description='test setup',
            )
        return account

    def assert_books_balance(self, user):
        """Every credit on the account is explained by the ledger and open holds."""
        account = self.account(user)
        self.assertEqual(ledger_sum(user, 'free_delta'), account.daily_free_remaining + held(user, 'free_amount'))
        self.assertEqual(ledger_sum(user, 'purchased_delta'), account.purchased_balance + held(user, 'purchased_amount'))


@override_settings(GROQ_API_KEY='test-key', GROQ_MODEL=MODEL, AI_CREDITS_TIMEZONE='Africa/Douala')
class DailyCreditTests(CreditTestMixin, TestCase):
    def setUp(self):
        enable_billing()
        self.student = self.make_user('CRD-DAY-1')
        self.api = APIClient()
        self.api.force_authenticate(self.student)

    def test_a_new_user_receives_100_free_credits(self):
        response = self.api.get(BALANCE_URL)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['daily_free_remaining'], 100)
        self.assertEqual(response.data['daily_free_limit'], 100)
        self.assertEqual(response.data['purchased_balance'], 0)
        self.assertEqual(response.data['total_available'], 100)
        line = AICreditTransaction.objects.get(user=self.student)
        self.assertEqual((line.kind, line.amount), (AICreditTransaction.DAILY_FREE, 100))

    def test_the_free_allowance_resets_and_does_not_accumulate(self):
        yesterday = credit_engine.credit_today() - timedelta(days=1)
        self.set_balance(self.student, free=30, purchased=0, cycle_date=yesterday)

        balance = self.api.get(BALANCE_URL).data

        self.assertEqual(balance['daily_free_remaining'], 100)  # not 130
        self.assertTrue(AICreditTransaction.objects.filter(
            user=self.student, kind=AICreditTransaction.DAILY_EXPIRY, amount=-30,
        ).exists())
        self.assert_books_balance(self.student)

    def test_purchased_credits_survive_the_daily_reset(self):
        self.set_balance(self.student, free=5, purchased=2500,
                         cycle_date=credit_today_minus(days=1))

        balance = self.api.get(BALANCE_URL).data

        self.assertEqual(balance['daily_free_remaining'], 100)
        self.assertEqual(balance['purchased_balance'], 2500)
        self.assertEqual(balance['total_available'], 2600)

    def test_the_reset_works_after_days_away_and_happens_once(self):
        self.set_balance(self.student, free=0, cycle_date=credit_today_minus(days=9))
        grants = AICreditTransaction.objects.filter(user=self.student, kind=AICreditTransaction.DAILY_FREE)
        before = grants.count()

        self.api.get(BALANCE_URL)
        self.api.get(BALANCE_URL)

        self.assertEqual(grants.count(), before + 1)
        self.assertEqual(self.account(self.student).cycle_date, credit_engine.credit_today())
        self.assertEqual(self.account(self.student).daily_free_remaining, 100)

    def test_the_day_turns_over_at_midnight_in_cameroon(self):
        reset = credit_engine.next_reset_at()
        self.assertEqual((reset.hour, reset.minute), (0, 0))
        self.assertEqual(str(reset.tzinfo), 'Africa/Douala')
        self.assertEqual(reset.date(), credit_engine.credit_today() + timedelta(days=1))

    def test_the_daily_allowance_is_configurable(self):
        self.configure(daily_free_credits=250)
        self.set_balance(self.student, cycle_date=credit_today_minus(days=1))

        self.assertEqual(self.api.get(BALANCE_URL).data['daily_free_remaining'], 250)


def credit_today_minus(days):
    return credit_engine.credit_today() - timedelta(days=days)


@override_settings(GROQ_API_KEY='test-key', GROQ_MODEL=MODEL, AI_CHAT_MAX_TOKENS=2400)
class ChatUsageTests(CreditTestMixin, TestCase):
    def setUp(self):
        enable_billing()
        self.student = self.make_user('CRD-USE-1')
        self.api = APIClient()
        self.api.force_authenticate(self.student)
        self.groq = None

    def tearDown(self):
        patch.stopall()

    def ask(self, message='What is photosynthesis?', *, headers=None, **usage):
        _, self.create = groq_returning(completion(**usage))
        return self.api.post(CHAT_URL, {'message': message}, format='json', **(headers or {}))

    def test_a_simple_question_uses_a_few_credits(self):
        response = self.ask(input_tokens=2200, output_tokens=300)

        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(3 <= response.data['credits_used'] <= 5, response.data['credits_used'])
        self.assertEqual(response.data['credits']['daily_free_remaining'], 100 - response.data['credits_used'])
        self.assert_books_balance(self.student)

    def test_heavier_work_costs_more_than_lighter_work(self):
        light = self.ask(input_tokens=2200, output_tokens=300).data['credits_used']
        heavy = self.ask('Solve x^2 - 5x + 6 = 0 step by step', input_tokens=2600, output_tokens=2300).data['credits_used']

        self.assertGreater(heavy, light * 2)

    def test_the_charge_follows_the_tokens_reported_not_the_estimate(self):
        response = self.ask(input_tokens=1000, output_tokens=1000)  # 1 + 5 = 6 credits

        self.assertEqual(response.data['credits_used'], 6)
        usage = AIUsageRecord.objects.get(user=self.student)
        self.assertEqual((usage.input_tokens, usage.output_tokens, usage.actual_credits), (1000, 1000, 6))
        self.assertEqual(usage.model, MODEL)
        self.assertGreater(usage.estimated_credits, 0)
        self.assertGreater(usage.provider_cost, Decimal('0'))

    def test_free_credits_are_spent_before_purchased_ones(self):
        self.set_balance(self.student, free=4, purchased=100)

        response = self.ask(input_tokens=1000, output_tokens=1000)  # 6 credits

        self.assertEqual(response.data['credits']['daily_free_remaining'], 0)
        self.assertEqual(response.data['credits']['purchased_balance'], 98)
        line = AICreditTransaction.objects.get(user=self.student, kind=AICreditTransaction.AI_USAGE)
        self.assertEqual((line.free_delta, line.purchased_delta, line.amount), (-4, -2, -6))
        self.assert_books_balance(self.student)

    def test_an_unaffordable_request_is_refused_before_the_model_is_called(self):
        self.set_balance(self.student, free=1, purchased=0)

        response = self.ask()

        self.assertEqual(response.status_code, 402)
        self.assertEqual(response.data['code'], 'ai_credits_insufficient')
        self.assertEqual(response.data['available'], 1)
        self.assertGreater(response.data['required'], 1)
        self.create.assert_not_called()
        self.assertFalse(AIRequest.objects.filter(user=self.student).exists())
        self.assertEqual(self.account(self.student).daily_free_remaining, 1)

    def test_a_heavy_request_asks_first_when_the_app_can_ask(self):
        self.configure(confirm_above_credits=3)

        refused = self.ask(headers={'HTTP_X_AI_CREDITS_CLIENT': '1'})
        self.assertEqual(refused.status_code, 409)
        self.assertEqual(refused.data['code'], 'ai_credits_confirmation_required')
        self.assertIn('credits', refused.data['estimate'])
        self.create.assert_not_called()

        confirmed = self.ask(headers={'HTTP_X_AI_CREDITS_CLIENT': '1', 'HTTP_X_AI_CREDITS_CONFIRM': '1'})
        self.assertEqual(confirmed.status_code, 200)

    def test_an_older_app_that_cannot_ask_is_never_asked(self):
        self.configure(confirm_above_credits=3)
        self.assertEqual(self.ask().status_code, 200)

    def test_executives_are_not_charged_but_their_usage_is_recorded(self):
        ceo = self.make_user('CRD-CEO-1', role='CEO')
        self.api.force_authenticate(ceo)

        response = self.ask(input_tokens=1000, output_tokens=1000)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['credits_used'], 0)
        self.assertTrue(response.data['credits']['unlimited'])
        usage = AIUsageRecord.objects.get(user=ceo)
        self.assertEqual((usage.status, usage.actual_credits, usage.charged_credits), (AIUsageRecord.EXEMPT, 6, 0))

    def test_older_apps_still_read_an_allowance(self):
        response = self.api.get(QUOTA_URL)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['limit'], 100)
        self.assertEqual(response.data['remaining'], 100)
        self.assertFalse(response.data['exhausted'])


class PricingTests(CreditTestMixin, TestCase):
    def setUp(self):
        self.config = AICreditConfig()

    def test_simple_questions_are_estimated_below_complex_ones(self):
        simple = pricing.estimate(self.config, 'chat', system_prompt_tokens=2000, question='What is photosynthesis?')
        normal = pricing.estimate(self.config, 'chat', system_prompt_tokens=2000,
                                  question='Explain photosynthesis with examples and an analogy.')
        hard = pricing.estimate(self.config, 'chat', system_prompt_tokens=2000,
                                question='Solve 3x^2 + 2x - 5 = 0 and show that both roots satisfy it.')

        self.assertEqual(simple.complexity, 'simple')
        self.assertEqual(normal.complexity, 'detailed')
        self.assertEqual(hard.complexity, 'complex')
        self.assertLess(simple.credits, normal.credits)
        self.assertLess(normal.credits, hard.credits)

    def test_feature_and_model_multipliers_change_the_price(self):
        usage = pricing.Usage(input_tokens=2000, output_tokens=2000, model=MODEL)
        base = pricing.credits_for_usage(self.config, 'chat', usage)
        heavier_feature = pricing.credits_for_usage(self.config, 'course_generation', usage)
        smaller_model = pricing.credits_for_usage(
            self.config, 'chat', pricing.Usage(input_tokens=2000, output_tokens=2000, model='openai/gpt-oss-20b'),
        )

        self.assertEqual(base, 12)
        self.assertEqual(heavier_feature, 30)
        self.assertEqual(smaller_model, 6)

    def test_documents_add_to_the_cost(self):
        usage = pricing.Usage(input_tokens=2000, output_tokens=2000, model=MODEL, documents=3)
        self.assertEqual(pricing.credits_for_usage(self.config, 'chat', usage), 12 + 6)

    def test_cached_input_is_cheaper_and_a_cached_answer_cheaper_still(self):
        fresh = pricing.credits_for_usage(self.config, 'chat', pricing.Usage(input_tokens=8000, output_tokens=200))
        cached = pricing.credits_for_usage(
            self.config, 'chat', pricing.Usage(input_tokens=8000, output_tokens=200, cached_tokens=8000),
        )
        served = pricing.credits_for_usage(self.config, 'chat', pricing.Usage(cached_response=True))

        self.assertLess(cached, fresh)
        self.assertEqual(served, self.config.cached_response_credits)

    def test_nothing_answered_costs_less_than_the_minimum(self):
        self.assertEqual(pricing.credits_for_usage(self.config, 'chat', pricing.Usage(input_tokens=10, output_tokens=5)), 3)

    def test_the_price_is_calculated_from_the_configured_rate(self):
        self.config.billing_enabled = True
        self.config.price_per_credit = Decimal('2.5')
        self.assertEqual(pricing.price_for_credits(self.config, 350), 875)
        self.config.price_per_credit = Decimal('0.333')
        self.assertEqual(pricing.price_for_credits(self.config, 100), 34)  # rounded up, never down

    def test_no_price_means_no_sales(self):
        with self.assertRaises(ValueError):
            pricing.price_for_credits(self.config, 100)


@override_settings(GROQ_API_KEY='test-key', GROQ_MODEL=MODEL)
class EstimateAndHistoryTests(CreditTestMixin, TestCase):
    def setUp(self):
        enable_billing()
        self.student = self.make_user('CRD-EST-1')
        self.api = APIClient()
        self.api.force_authenticate(self.student)

    def tearDown(self):
        patch.stopall()

    def test_the_estimate_says_what_it_costs_and_whether_it_is_affordable(self):
        response = self.api.post(ESTIMATE_URL, {'feature': 'chat', 'message': 'What is a noun?'}, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertGreater(response.data['estimate']['credits'], 0)
        self.assertTrue(response.data['can_afford'])
        self.assertEqual(response.data['balance']['total_available'], 100)

    def test_an_unknown_feature_is_refused(self):
        response = self.api.post(ESTIMATE_URL, {'feature': 'mining'}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_history_lists_every_movement_newest_first(self):
        groq_returning(completion(input_tokens=1000, output_tokens=1000))
        self.api.post(CHAT_URL, {'message': 'What is a verb?'}, format='json')
        credit_engine.grant(self.student, 500, AICreditTransaction.PURCHASE, reference_id='gw:TEST-1',
                            description='Bought 500 AI credits')

        rows = self.api.get(HISTORY_URL).data['results']

        self.assertEqual([row['kind'] for row in rows], ['PURCHASE', 'AI_USAGE', 'DAILY_FREE'])
        self.assertEqual(rows[0]['amount'], 500)
        self.assertEqual(rows[0]['balance_after'], 594)
        self.assertEqual(rows[1]['amount'], -6)
        self.assertEqual(rows[1]['feature_label'], 'AI Assistant')
        self.assertEqual(rows[2]['amount'], 100)

    def test_usage_is_summarised_by_feature(self):
        groq_returning(completion(input_tokens=1000, output_tokens=1000))
        self.api.post(CHAT_URL, {'message': 'What is a verb?'}, format='json')

        data = self.api.get(USAGE_URL).data

        self.assertEqual(data['total_credits'], 6)
        self.assertEqual(data['by_feature'][0]['feature'], 'chat')
        self.assertEqual(data['by_feature'][0]['share_percent'], 100.0)


@override_settings(GROQ_API_KEY='test-key', GROQ_MODEL=MODEL)
class ProviderFailureTests(CreditTestMixin, TestCase):
    def setUp(self):
        enable_billing()
        self.student = self.make_user('CRD-FAIL-1')
        self.api = APIClient()
        self.api.force_authenticate(self.student)

    def tearDown(self):
        patch.stopall()

    def test_a_provider_failure_costs_nothing(self):
        groq_returning(error=RuntimeError('provider down'))
        self.set_balance(self.student, free=30, purchased=10)

        response = self.api.post(CHAT_URL, {'message': 'What is a noun?'}, format='json')

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data['credits_used'], 0)
        account = self.account(self.student)
        self.assertEqual((account.daily_free_remaining, account.purchased_balance), (30, 10))
        hold = AICreditHold.objects.get(user=self.student)
        self.assertEqual(hold.status, AICreditHold.RELEASED)
        self.assertEqual(AIUsageRecord.objects.get(user=self.student).status, AIUsageRecord.FAILED)
        self.assertFalse(AICreditTransaction.objects.filter(kind=AICreditTransaction.AI_USAGE).exists())
        self.assert_books_balance(self.student)

    def test_an_error_while_metering_returns_the_hold(self):
        ai_request = AIRequest.objects.create(user=self.student, request_type='general', prompt='x', status='processing')
        hold = credit_engine.hold_credits(self.student, 'chat', 30, ai_request=ai_request)
        self.assertEqual(self.account(self.student).daily_free_remaining, 70)

        with self.assertRaises(ValueError):
            with credit_engine.metered(ai_request, hold=hold):
                raise ValueError('worker crashed')

        self.assertEqual(self.account(self.student).daily_free_remaining, 100)
        hold.refresh_from_db()
        self.assertEqual(hold.status, AICreditHold.RELEASED)

    def test_an_answer_that_was_cut_off_follows_the_policy(self):
        self.configure(partial_response_policy=AICreditConfig.PARTIAL_REFUND)
        groq_returning(completion(input_tokens=1000, output_tokens=2400, finish='length'))

        response = self.api.post(CHAT_URL, {'message': 'Explain the French revolution'}, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['credits_used'], 0)
        self.assertEqual(AIUsageRecord.objects.get(user=self.student).status, AIUsageRecord.PARTIAL)

    def test_half_charge_for_a_cut_off_answer(self):
        self.configure(partial_response_policy=AICreditConfig.PARTIAL_CHARGE_HALF)
        groq_returning(completion(input_tokens=1000, output_tokens=1000, finish='length'))

        response = self.api.post(CHAT_URL, {'message': 'Explain nouns'}, format='json')

        self.assertEqual(response.data['credits_used'], 3)  # half of 6

    def test_work_that_runs_over_its_hold_never_goes_below_zero(self):
        self.set_balance(self.student, free=10, purchased=0)
        ai_request = AIRequest.objects.create(user=self.student, request_type='general', prompt='x', status='processing')
        hold = credit_engine.hold_credits(self.student, 'chat', 8, ai_request=ai_request)

        charged, waived = credit_engine.settle_hold(hold, 25)

        self.assertEqual((charged, waived), (10, 15))
        self.assertEqual(self.account(self.student).daily_free_remaining, 0)
        self.assert_books_balance(self.student)

    def test_unused_hold_comes_back_on_settlement(self):
        ai_request = AIRequest.objects.create(user=self.student, request_type='general', prompt='x', status='processing')
        hold = credit_engine.hold_credits(self.student, 'chat', 30, ai_request=ai_request)

        credit_engine.settle_hold(hold, 12)

        self.assertEqual(self.account(self.student).daily_free_remaining, 88)
        self.assert_books_balance(self.student)

    def test_settling_twice_charges_once(self):
        ai_request = AIRequest.objects.create(user=self.student, request_type='general', prompt='x', status='processing')
        hold = credit_engine.hold_credits(self.student, 'chat', 30, ai_request=ai_request)

        credit_engine.settle_hold(hold, 12)
        credit_engine.settle_hold(hold, 12)
        credit_engine.release_hold(hold, 'late failure')

        self.assertEqual(self.account(self.student).daily_free_remaining, 88)

    def test_free_credits_held_yesterday_are_not_returned_today(self):
        self.set_balance(self.student, free=50, purchased=20)
        ai_request = AIRequest.objects.create(user=self.student, request_type='general', prompt='x', status='processing')
        hold = credit_engine.hold_credits(self.student, 'chat', 60, ai_request=ai_request)  # 50 free + 10 bought
        account = self.account(self.student)
        account.cycle_date = credit_today_minus(days=1)
        account.save()
        AICreditHold.objects.filter(pk=hold.pk).update(cycle_date=credit_today_minus(days=1))
        hold.refresh_from_db()

        credit_engine.release_hold(hold, 'provider failed')

        account = self.account(self.student)
        self.assertEqual(account.daily_free_remaining, 100)  # today's allowance, not 150
        self.assertEqual(account.purchased_balance, 20)  # bought credits always come back
        self.assert_books_balance(self.student)

    def test_holds_left_by_a_dead_worker_are_returned(self):
        hold = credit_engine.hold_credits(self.student, 'study_plan', 40)
        AICreditHold.objects.filter(pk=hold.pk).update(created_at=hold.created_at - timedelta(hours=2))

        self.assertEqual(credit_engine.release_stale_holds(), 1)
        self.assertEqual(self.account(self.student).daily_free_remaining, 100)


@override_settings(GROQ_API_KEY='test-key', GROQ_MODEL=MODEL, GROQ_FAST_MODEL=MODEL,
                   CELERY_TASK_ALWAYS_EAGER=True, AI_ALLOW_SYNC_FALLBACK=True)
class BackgroundFeatureTests(CreditTestMixin, TestCase):
    """The features that run as background jobs pay through the same engine."""

    def setUp(self):
        enable_billing()
        self.student = self.make_user('CRD-BG-1')

    def tearDown(self):
        patch.stopall()

    def _queued(self, request_type='study_plan'):
        estimate = credit_engine.estimate_request(pricing.feature_key(request_type), purpose=request_type,
                                                  input_text='Make a plan ' * 40, max_output_tokens=2048)
        ai_request = AIRequest.objects.create(user=self.student, request_type=request_type,
                                              prompt='Make a plan ' * 40, status='pending')
        credit_engine.hold_for_request(ai_request, estimate)
        return ai_request, estimate

    def test_a_finished_job_is_charged_what_it_used(self):
        from apps.ai_features.tasks import process_ai_request

        ai_request, estimate = self._queued()
        self.assertEqual(self.account(self.student).daily_free_remaining, 100 - estimate.credits)
        groq_returning(completion(input_tokens=1000, output_tokens=2000))  # (1 + 10) * 1.2 = 14

        process_ai_request(str(ai_request.id))

        self.assertEqual(self.account(self.student).daily_free_remaining, 86)
        line = AICreditTransaction.objects.get(user=self.student, kind=AICreditTransaction.AI_USAGE)
        self.assertEqual((line.amount, line.feature, line.description), (-14, 'study_plan', 'Study Plan'))
        self.assert_books_balance(self.student)

    def test_a_failed_job_costs_nothing(self):
        from apps.ai_features.tasks import process_ai_request

        ai_request, _ = self._queued()
        groq_returning(error=RuntimeError('timeout'))

        process_ai_request(str(ai_request.id))

        self.assertEqual(self.account(self.student).daily_free_remaining, 100)
        ai_request.refresh_from_db()
        self.assertEqual(ai_request.status, 'failed')

    def test_a_decorated_feature_service_is_metered(self):
        from apps.ai_features.roadmap_service import generate_academic_roadmap
        from apps.ai_features.models import AcademicRoadmap

        ai_request, _ = self._queued('academic_roadmap')
        roadmap = MagicMock(spec=AcademicRoadmap)
        roadmap.ai_request = ai_request
        roadmap.ai_request_id = ai_request.pk
        roadmap.student.user.get_full_name.return_value = 'Test Person'
        groq_returning(completion('{"term_plans": [{"term": 1}]}', input_tokens=1000, output_tokens=1000))

        with patch('apps.ai_features.roadmap_service.build_roadmap_prompt', return_value='plan please'):
            ok, error = generate_academic_roadmap(roadmap)

        self.assertTrue(ok, error)
        # (1 + 5) * 1.3 = 7.8 -> 8 credits
        self.assertEqual(self.account(self.student).daily_free_remaining, 92)


@override_settings(FAPSHI_API_USER='user', FAPSHI_API_KEY='key', FAPSHI_WEBHOOK_SECRET='whsec')
class PurchaseTests(CreditTestMixin, TestCase):
    def setUp(self):
        enable_billing()
        self.configure(price_per_credit=Decimal('2'), min_purchase_credits=100, max_purchase_credits=10000)
        self.student = self.make_user('CRD-BUY-1')
        self.api = APIClient()
        self.api.force_authenticate(self.student)

    def tearDown(self):
        patch.stopall()

    def start_purchase(self, credits=350, **extra):
        with patch('apps.fees.fapshi.direct_pay', return_value={'transId': 'FAP-123'}) as pay:
            response = self.api.post(PURCHASE_URL, {'credits': credits, 'phone': '670000000', **extra}, format='json')
        self.pay = pay
        return response

    def confirm(self, response, status_value='SUCCESSFUL', amount=None):
        txn_id = response.data['transaction_id']
        txn = GatewayTransaction.objects.get(transaction_id=txn_id)
        remote = {'status': status_value, 'amount': int(txn.amount) if amount is None else amount}
        with patch('apps.fees.fapshi.payment_status', return_value=remote):
            return self.api.get(f'{PURCHASE_URL}{txn_id}/')

    def test_the_price_is_decided_by_the_server(self):
        response = self.api.get(PRICING_URL, {'credits': 350})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['price'], 700)
        self.assertEqual(response.data['currency'], 'XAF')

    def test_any_amount_inside_the_limits_can_be_bought(self):
        for credits in (100, 350, 1234, 10000):
            self.assertEqual(self.api.get(PRICING_URL, {'credits': credits}).status_code, 200, credits)
        self.assertEqual(self.api.get(PRICING_URL, {'credits': 99}).status_code, 400)
        self.assertEqual(self.api.get(PRICING_URL, {'credits': 10001}).status_code, 400)

    def test_a_successful_payment_adds_the_credits(self):
        started = self.start_purchase(350, amount=1)  # a client-sent amount is ignored

        self.assertEqual(started.status_code, 201, started.data)
        self.assertEqual(self.pay.call_args.kwargs['amount'], 700)
        self.assertEqual(self.api.get(BALANCE_URL).data['purchased_balance'], 0)  # not before it is paid

        confirmed = self.confirm(started)

        self.assertEqual(confirmed.data['status'], 'SUCCESS')
        self.assertEqual(confirmed.data['balance']['purchased_balance'], 350)
        line = AICreditTransaction.objects.get(user=self.student, kind=AICreditTransaction.PURCHASE)
        self.assertEqual(line.amount, 350)
        self.assertEqual(line.reference_id, f"gw:{started.data['transaction_id']}")

    def test_a_failed_payment_adds_nothing(self):
        started = self.start_purchase(350)

        response = self.confirm(started, status_value='FAILED')

        self.assertEqual(response.data['status'], 'FAILED')
        self.assertEqual(response.data['balance']['purchased_balance'], 0)

    def test_a_short_payment_adds_nothing(self):
        started = self.start_purchase(350)

        response = self.confirm(started, amount=100)

        self.assertEqual(response.data['balance']['purchased_balance'], 0)

    def test_duplicate_callbacks_credit_once(self):
        from apps.fees.processing import apply_successful_transaction

        started = self.start_purchase(500)
        self.confirm(started)
        txn = GatewayTransaction.objects.get(transaction_id=started.data['transaction_id'])
        remote = {'status': 'SUCCESSFUL', 'amount': 1000, 'transId': 'FAP-123'}

        with patch('apps.fees.fapshi.payment_status', return_value=remote):
            for _ in range(2):
                self.client.post('/api/v1/fees/fapshi/webhook/', {'transId': 'FAP-123'},
                                 content_type='application/json', HTTP_X_WH_SECRET='whsec')
        apply_successful_transaction(txn)
        GatewayTransaction.objects.filter(pk=txn.pk).update(processed=False)
        apply_successful_transaction(txn)  # even with the flag lost, the ledger refuses

        self.assertEqual(self.account(self.student).purchased_balance, 500)
        self.assertEqual(AICreditTransaction.objects.filter(kind=AICreditTransaction.PURCHASE).count(), 1)

    def test_pressing_pay_twice_does_not_prompt_twice(self):
        first = self.start_purchase(350)
        second = self.start_purchase(350)

        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.data['transaction_id'], second.data['transaction_id'])
        self.pay.assert_not_called()  # the second press never reached Fapshi

    def test_purchases_stay_closed_until_a_price_is_set(self):
        self.configure(price_per_credit=None)

        response = self.start_purchase(350)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'ai_credits_purchases_closed')
        self.pay.assert_not_called()

    def test_credits_cannot_be_bought_through_the_generic_gateway(self):
        response = self.api.post('/api/v1/fees/fapshi/collect/',
                                 {'purpose': 'ai_credits', 'phone': '670000000', 'amount': 100}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_someone_else_cannot_read_my_purchase(self):
        started = self.start_purchase(350)
        other = self.make_user('CRD-BUY-2')
        self.api.force_authenticate(other)

        response = self.api.get(f"{PURCHASE_URL}{started.data['transaction_id']}/")

        self.assertEqual(response.status_code, 404)


class AdminTests(CreditTestMixin, TestCase):
    def setUp(self):
        enable_billing()
        self.ceo = self.make_user('CRD-ADM-1', role='CEO')
        self.coo = self.make_user('CRD-ADM-2', role='COO')
        self.student = self.make_user('CRD-ADM-3')
        self.api = APIClient()

    def test_students_cannot_see_or_change_pricing(self):
        self.api.force_authenticate(self.student)
        self.assertEqual(self.api.get('/api/v1/ai/credits/admin/config/').status_code, 403)
        self.assertEqual(self.api.get('/api/v1/ai/credits/admin/economics/').status_code, 403)
        self.assertEqual(self.api.post('/api/v1/ai/credits/admin/adjust/', {}).status_code, 403)

    def test_the_ceo_sets_the_price_and_rates(self):
        self.api.force_authenticate(self.ceo)

        response = self.api.patch('/api/v1/ai/credits/admin/config/', {
            'price_per_credit': '1.75',
            'daily_free_credits': 120,
            'feature_multipliers': {'chat': 1.1, 'course_generation': 3},
        }, format='json')

        self.assertEqual(response.status_code, 200, response.data)
        config = credit_engine.get_config()
        self.assertEqual(config.price_per_credit, Decimal('1.75'))
        self.assertEqual(config.daily_free_credits, 120)
        self.assertTrue(config.purchases_enabled)

    def test_other_executives_can_look_but_not_change_the_price(self):
        self.api.force_authenticate(self.coo)
        self.assertEqual(self.api.get('/api/v1/ai/credits/admin/config/').status_code, 200)
        self.assertEqual(self.api.patch('/api/v1/ai/credits/admin/config/', {'daily_free_credits': 5},
                                        format='json').status_code, 403)

    def test_bad_rates_are_refused(self):
        self.api.force_authenticate(self.ceo)
        response = self.api.patch('/api/v1/ai/credits/admin/config/',
                                  {'feature_multipliers': {'chat': -1}}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_an_adjustment_is_recorded_with_its_reason(self):
        self.api.force_authenticate(self.ceo)

        response = self.api.post('/api/v1/ai/credits/admin/adjust/', {
            'user': self.student.matricule, 'amount': 200, 'kind': 'BONUS', 'reason': 'Competition winner',
        }, format='json')

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['balance']['purchased_balance'], 200)
        line = AICreditTransaction.objects.get(user=self.student, kind=AICreditTransaction.BONUS)
        self.assertEqual((line.description, line.created_by), ('Competition winner', self.ceo))

    def test_the_economics_come_from_real_records(self):
        credit_engine.get_account(self.student)
        AIUsageRecord.objects.create(user=self.student, feature='chat', model=MODEL, input_tokens=2000,
                                     output_tokens=400, actual_credits=4, charged_credits=4,
                                     provider_cost=Decimal('0.3240'))
        AIUsageRecord.objects.create(user=self.student, feature='ai_exam_generation', model=MODEL,
                                     input_tokens=2000, output_tokens=4000, actual_credits=33,
                                     charged_credits=33, provider_cost=Decimal('1.6200'))
        self.api.force_authenticate(self.ceo)

        data = self.api.get('/api/v1/ai/credits/admin/economics/', {'days': 7}).data

        self.assertEqual(data['activity']['requests'], 2)
        self.assertEqual(data['activity']['active_users'], 1)
        self.assertEqual(data['credits']['free_issued'], 100)
        self.assertEqual(data['by_feature'][0]['feature'], 'ai_exam_generation')
        self.assertAlmostEqual(data['by_feature'][0]['share_percent'], 89.2, places=1)
        self.assertAlmostEqual(data['money']['provider_cost'], 1.94, places=2)
        self.assertGreater(data['pricing_insight']['provider_cost_per_credit'], 0)


class ConcurrencyTests(CreditTestMixin, TransactionTestCase):
    """Two requests at once must never spend the same credits twice."""

    def setUp(self):
        enable_billing()
        self.student = self.make_user('CRD-CON-1')
        credit_engine.get_account(self.student)

    def test_a_balance_that_changes_mid_request_is_retried_not_overspent(self):
        # Between reading the balance and writing it, another request spends
        # most of it. The write must notice and re-read, not overwrite.
        real_get = credit_engine.get_account
        calls = {'n': 0}

        def racing_get(user, config=None):
            account = real_get(user, config)
            calls['n'] += 1
            if calls['n'] == 1:
                AICreditAccount.objects.filter(pk=account.pk).update(daily_free_remaining=20)
            return account

        with patch.object(credit_engine, 'get_account', side_effect=racing_get):
            with self.assertRaises(credit_engine.InsufficientCredits):
                credit_engine.hold_credits(self.student, 'chat', 60)

        # The first write was refused because the row had changed; the retry
        # read the new balance of 20 and refused to hold 60 out of it.
        self.assertEqual(calls['n'], 2)
        self.assertFalse(AICreditHold.objects.filter(user=self.student).exists())
        self.assertGreaterEqual(self.account(self.student).daily_free_remaining, 0)

    def test_simultaneous_requests_cannot_overdraw(self):
        if connection.vendor == 'sqlite':
            self.skipTest('SQLite serialises writers; the retry logic is covered by the race test above.')
        results = []

        def spend():
            try:
                credit_engine.hold_credits(User.objects.get(pk=self.student.pk), 'chat', 30)
                results.append('held')
            except credit_engine.InsufficientCredits:
                results.append('refused')
            finally:
                connection.close()

        threads = [threading.Thread(target=spend) for _ in range(8)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

        self.assertEqual(results.count('held'), 3)  # 3 x 30 fits in 100; the rest refused
        self.assertEqual(self.account(self.student).daily_free_remaining, 10)

    def test_simultaneous_purchase_confirmations_credit_once(self):
        txn = GatewayTransaction.objects.create(
            provider='fapshi', purpose=GatewayTransaction.PURPOSE_AI_CREDITS, initiated_by=self.student,
            beneficiary=self.student, amount=Decimal('1000'), ai_credits=500, phone_number='670000000',
            transaction_id='EI-AIC-RACE', provider_transaction_id='FAP-RACE',
        )
        # Both confirmations arrive before either has marked the payment done.
        credit_engine.grant_purchase(txn)
        credit_engine.grant_purchase(txn)

        self.assertEqual(self.account(self.student).purchased_balance, 500)
        self.assertEqual(AICreditTransaction.objects.filter(kind=AICreditTransaction.PURCHASE).count(), 1)


def photo_data_url(color=(200, 30, 30), size=(64, 48)):
    """A real, tiny PNG, the way the apps send a photo of a question."""
    import base64
    import io

    from PIL import Image

    buffer = io.BytesIO()
    Image.new('RGB', size, color).save(buffer, format='PNG')
    return 'data:image/png;base64,' + base64.b64encode(buffer.getvalue()).decode('ascii')


@override_settings(GROQ_API_KEY='test-key', GROQ_MODEL=MODEL,
                   GROQ_VISION_MODEL='meta-llama/llama-4-scout-17b-16e-instruct', AI_CHAT_MAX_IMAGES=3,
                   AI_PAPER_MODE=False)
class ImageQuestionTests(CreditTestMixin, TestCase):
    """A question sent as a photo is read by the vision model and costs more."""

    def setUp(self):
        enable_billing()
        self.student = self.make_user('CRD-IMG-1')
        self.api = APIClient()
        self.api.force_authenticate(self.student)

    def tearDown(self):
        patch.stopall()

    def ask(self, payload, **usage):
        _, self.create = groq_returning(completion(**usage))
        return self.api.post(CHAT_URL, payload, format='json')

    def test_a_photo_goes_to_the_vision_model_with_the_question(self):
        response = self.ask({'message': 'Help with number 3', 'images': [photo_data_url()]},
                            input_tokens=3000, output_tokens=800)

        self.assertEqual(response.status_code, 200, response.data)
        sent = self.create.call_args.kwargs
        self.assertEqual(sent['model'], 'meta-llama/llama-4-scout-17b-16e-instruct')
        self.assertNotIn('extra_body', sent)  # reasoning effort is for gpt-oss only
        content = sent['messages'][1]['content']
        self.assertEqual(content[0]['type'], 'text')
        self.assertIn('Help with number 3', content[0]['text'])
        self.assertEqual(content[1]['type'], 'image_url')
        self.assertTrue(content[1]['image_url']['url'].startswith('data:image/png;base64,'))

    def test_a_photo_question_costs_more_than_the_same_words_typed(self):
        typed = self.ask({'message': 'Solve question 3'}, input_tokens=3000, output_tokens=800).data['credits_used']
        photo = self.ask({'message': 'Solve question 3', 'images': [photo_data_url()]},
                         input_tokens=3000, output_tokens=800).data['credits_used']

        # (3 + 4) x 1.5 + 5 per image = 16, against 7 for the typed question.
        self.assertEqual(typed, 7)
        self.assertEqual(photo, 16)
        usage = AIUsageRecord.objects.filter(user=self.student, feature='image_question').get()
        self.assertEqual(usage.images_count, 1)
        line = AICreditTransaction.objects.get(user=self.student, feature='image_question')
        self.assertEqual(line.description, 'Image Question')

    def test_a_photo_alone_is_enough(self):
        response = self.ask({'images': [photo_data_url()]})

        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn('read the question in the image', self.create.call_args.kwargs['messages'][1]['content'][0]['text'])

    def test_more_photos_cost_more(self):
        one = self.ask({'message': 'x', 'images': [photo_data_url()]}, input_tokens=3000, output_tokens=800).data
        three = self.ask({'message': 'x', 'images': [photo_data_url()] * 3}, input_tokens=3000, output_tokens=800).data

        self.assertEqual(three['credits_used'] - one['credits_used'], 10)

    def test_something_that_is_not_an_image_is_refused_and_costs_nothing(self):
        import base64

        fake = 'data:image/png;base64,' + base64.b64encode(b'not really a picture').decode()
        response = self.ask({'message': 'x', 'images': [fake]})

        self.assertEqual(response.status_code, 400)
        self.create.assert_not_called()
        self.assertEqual(credit_engine.get_account(self.student).daily_free_remaining, 100)

    def test_too_many_photos_are_refused(self):
        response = self.ask({'message': 'x', 'images': [photo_data_url()] * 4})

        self.assertEqual(response.status_code, 400)
        self.create.assert_not_called()

    def test_the_estimate_counts_the_photos(self):
        typed = self.api.post(ESTIMATE_URL, {'feature': 'chat', 'message': 'Solve question 3'}, format='json').data
        photos = self.api.post(ESTIMATE_URL, {'feature': 'chat', 'message': 'Solve question 3', 'images': 2},
                               format='json').data

        self.assertEqual(photos['estimate']['feature'], 'image_question')
        self.assertGreater(photos['estimate']['credits'], typed['estimate']['credits'] + 10)


@override_settings(GROQ_API_KEY='test-key', GROQ_MODEL=MODEL, FAPSHI_API_USER='user', FAPSHI_API_KEY='key')
class FreeModeTests(CreditTestMixin, TestCase):
    """While billing is off, AI is free for everyone, and still recorded."""

    def setUp(self):
        credit_engine.invalidate_config()  # the default: free
        self.student = self.make_user('CRD-FREE-1')
        self.api = APIClient()
        self.api.force_authenticate(self.student)

    def tearDown(self):
        patch.stopall()

    def test_ai_is_free_by_default_and_nothing_is_taken(self):
        groq_returning(completion(input_tokens=1000, output_tokens=1000))

        response = self.api.post(CHAT_URL, {'message': 'What is a noun?'}, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['credits_used'], 0)
        self.assertTrue(response.data['credits']['free_mode'])
        self.assertTrue(response.data['credits']['unlimited'])
        self.assertEqual(self.account(self.student).daily_free_remaining, 100)
        usage = AIUsageRecord.objects.get(user=self.student)
        # The real cost is still known, for when a price is chosen.
        self.assertEqual((usage.actual_credits, usage.charged_credits, usage.status), (6, 0, AIUsageRecord.EXEMPT))

    def test_an_empty_balance_does_not_stop_anyone(self):
        self.set_balance(self.student, free=0, purchased=0)
        groq_returning(completion())
        self.assertEqual(self.api.post(CHAT_URL, {'message': 'What is a noun?'}, format='json').status_code, 200)

    def test_nothing_can_be_bought_while_it_is_free(self):
        self.configure(price_per_credit=Decimal('2'))
        config = credit_engine.get_config()
        config.billing_enabled = False
        config.save()
        credit_engine.invalidate_config()

        with patch('apps.fees.fapshi.direct_pay') as pay:
            response = self.api.post(PURCHASE_URL, {'credits': 500, 'phone': '670000000'}, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'ai_credits_free_mode')
        pay.assert_not_called()
        self.assertTrue(self.api.get(PRICING_URL).data['free_mode'])

    def test_only_the_founders_switch_paying_mode_on(self):
        coo = self.make_user('CRD-FREE-COO', role='COO')
        ceo = self.make_user('CRD-FREE-CEO', role='CEO')

        self.api.force_authenticate(coo)
        self.assertEqual(self.api.patch('/api/v1/ai/credits/admin/config/', {'billing_enabled': True},
                                        format='json').status_code, 403)
        self.api.force_authenticate(self.student)
        self.assertEqual(self.api.patch('/api/v1/ai/credits/admin/config/', {'billing_enabled': True},
                                        format='json').status_code, 403)
        self.api.force_authenticate(ceo)
        self.assertEqual(self.api.patch('/api/v1/ai/credits/admin/config/', {'billing_enabled': True},
                                        format='json').status_code, 200)

        self.assertTrue(credit_engine.get_config().billing_enabled)
        self.api.force_authenticate(self.student)
        groq_returning(completion(input_tokens=1000, output_tokens=1000))
        self.assertEqual(self.api.post(CHAT_URL, {'message': 'What is a noun?'}, format='json').data['credits_used'], 6)
