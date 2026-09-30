"""The AI credit API: balance, estimates, history, buying, and the admin side.

Every figure that matters - a balance, a price, a cost - is worked out here
on the server. The apps display what they are given and never compute a
price or confirm a payment themselves.
"""

import logging
import uuid
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework import generics, serializers, status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.platform.permissions import IsCEOOrCTO, IsExecutive

from . import credit_engine
from . import credit_pricing as pricing
from .credit_models import AICreditConfig, AICreditTransaction
from .credit_reports import economics
from .throttles import AIRateThrottle

logger = logging.getLogger(__name__)
User = get_user_model()

#: How long a second press of "Pay" is answered with the first payment
#: instead of prompting the phone again.
DUPLICATE_PURCHASE_WINDOW = timedelta(minutes=3)


# ---------------------------------------------------------------------------
# Serializers
# ---------------------------------------------------------------------------

class CreditTransactionSerializer(serializers.ModelSerializer):
    kind_label = serializers.CharField(source='get_kind_display', read_only=True)
    feature_label = serializers.SerializerMethodField()

    class Meta:
        model = AICreditTransaction
        fields = [
            'id', 'kind', 'kind_label', 'amount', 'free_delta', 'purchased_delta',
            'balance_after', 'free_balance_after', 'purchased_balance_after',
            'feature', 'feature_label', 'description', 'reference_id', 'created_at',
        ]

    def get_feature_label(self, obj):
        if not obj.feature:
            return ''
        return credit_engine.FEATURE_LABELS.get(obj.feature, obj.feature.replace('_', ' ').title())


def _validate_number_map(value, name, *, nested=False):
    if not isinstance(value, dict):
        raise serializers.ValidationError(f'{name} must be an object.')
    for key, item in value.items():
        entries = item.items() if nested and isinstance(item, dict) else [(key, item)]
        if nested and not isinstance(item, dict):
            raise serializers.ValidationError(f'{name}.{key} must be an object.')
        for sub_key, number in entries:
            try:
                if float(number) < 0:
                    raise ValueError
            except (TypeError, ValueError):
                raise serializers.ValidationError(f'{name}.{key}: {sub_key} must be a number of zero or more.')
    return value


class CreditConfigSerializer(serializers.ModelSerializer):
    purchases_enabled = serializers.BooleanField(read_only=True)
    updated_by_name = serializers.SerializerMethodField()

    class Meta:
        model = AICreditConfig
        exclude = ['id', 'updated_by']
        read_only_fields = ['updated_at']

    def get_updated_by_name(self, obj):
        return obj.updated_by.get_full_name() if obj.updated_by_id else ''

    def validate_feature_multipliers(self, value):
        return _validate_number_map(value, 'feature_multipliers')

    def validate_model_multipliers(self, value):
        return _validate_number_map(value, 'model_multipliers')

    def validate_feature_estimates(self, value):
        return _validate_number_map(value, 'feature_estimates', nested=True)

    def validate_provider_costs(self, value):
        return _validate_number_map(value, 'provider_costs', nested=True)

    def validate(self, attrs):
        low = attrs.get('min_purchase_credits', getattr(self.instance, 'min_purchase_credits', 1))
        high = attrs.get('max_purchase_credits', getattr(self.instance, 'max_purchase_credits', 1))
        if low < 1:
            raise serializers.ValidationError({'min_purchase_credits': 'The smallest purchase must be at least 1 credit.'})
        if high < low:
            raise serializers.ValidationError({'max_purchase_credits': 'The largest purchase cannot be below the smallest.'})
        return attrs


# ---------------------------------------------------------------------------
# What a person sees
# ---------------------------------------------------------------------------

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def credit_balance(request):
    """Daily free, purchased, and the total that can be spent now."""
    return Response(credit_engine.balance(request.user))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def credit_estimate(request):
    """Roughly what a request will cost, and whether it can be afforded."""
    feature = str(request.data.get('feature') or pricing.CHAT_FEATURE).strip()
    config = credit_engine.get_config()
    known = set(credit_engine.FEATURE_LABELS) | set((config.feature_multipliers or {}).keys())
    if feature not in known:
        return Response({'message': 'Unknown AI feature.'}, status=status.HTTP_400_BAD_REQUEST)

    message = str(request.data.get('message') or '')
    history = request.data.get('history') or []
    history_text = ''
    if isinstance(history, list):
        history_text = '\n'.join(str(entry.get('content', '')) for entry in history[-10:] if isinstance(entry, dict))
    try:
        documents = max(int(request.data.get('documents') or 0), 0)
        images = max(int(request.data.get('images') or 0), 0)
    except (TypeError, ValueError):
        documents = images = 0

    if feature in (pricing.CHAT_FEATURE, pricing.IMAGE_FEATURE):
        # A question sent with photos is priced as an image question.
        feature = pricing.IMAGE_FEATURE if images else pricing.CHAT_FEATURE
        estimate = credit_engine.estimate_request(
            feature, purpose='', input_text=f'{history_text}\n{message}', question=message,
            documents=documents, images=images, config=config,
        )
    else:
        estimate = credit_engine.estimate_request(feature, documents=documents, config=config)

    current = credit_engine.balance(request.user, config)
    unlimited = current['unlimited']
    return Response({
        'estimate': estimate.as_dict(),
        'balance': current,
        'can_afford': unlimited or current['total_available'] >= estimate.credits,
        'needs_confirmation': (not unlimited) and estimate.credits > int(config.confirm_above_credits),
    })


class CreditHistoryView(generics.ListAPIView):
    """Every credit movement on this account, newest first."""

    serializer_class = CreditTransactionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = AICreditTransaction.objects.filter(user=self.request.user)
        kind = (self.request.query_params.get('kind') or '').strip().upper()
        if kind:
            queryset = queryset.filter(kind__in=[value for value in kind.split(',') if value])
        return queryset.order_by('-created_at')


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def credit_usage(request):
    """Where this person's credits went, by feature and by day."""
    try:
        days = max(1, min(int(request.query_params.get('days') or 30), 366))
    except ValueError:
        days = 30
    since = timezone.now() - timedelta(days=days)
    tz = credit_engine.credit_timezone()
    usage = AICreditTransaction.objects.filter(
        user=request.user, kind=AICreditTransaction.AI_USAGE, created_at__gte=since,
    )
    total = -int(usage.aggregate(total=Sum('amount'))['total'] or 0)
    by_feature = []
    for row in usage.values('feature').annotate(credits=Sum('amount'), requests=Count('id')).order_by('credits'):
        credits = -int(row['credits'] or 0)
        by_feature.append({
            'feature': row['feature'],
            'label': credit_engine.FEATURE_LABELS.get(row['feature'], row['feature'].replace('_', ' ').title()),
            'credits': credits,
            'requests': row['requests'],
            'share_percent': round(credits * 100 / total, 1) if total else 0,
        })
    daily = [
        {'date': row['day'].isoformat(), 'credits': -int(row['credits'] or 0), 'requests': row['requests']}
        for row in usage.annotate(day=TruncDate('created_at', tzinfo=tz))
        .values('day').annotate(credits=Sum('amount'), requests=Count('id')).order_by('day')
    ]
    return Response({
        'window_days': days,
        'total_credits': total,
        'requests': sum(item['requests'] for item in by_feature),
        'by_feature': by_feature,
        'daily': daily,
        'balance': credit_engine.balance(request.user),
    })


# ---------------------------------------------------------------------------
# Buying credits
# ---------------------------------------------------------------------------

def _parse_credits(raw, config):
    """A whole number of credits inside the configured limits, or an error."""
    try:
        credits = int(str(raw).replace(',', '').strip())
    except (TypeError, ValueError):
        return None, 'Enter how many credits you want.'
    if credits < int(config.min_purchase_credits):
        return None, f'The smallest purchase is {config.min_purchase_credits:,} credits.'
    if credits > int(config.max_purchase_credits):
        return None, f'The largest purchase is {config.max_purchase_credits:,} credits.'
    return credits, None


def _quote(config, credits):
    from apps.fees import fapshi

    price = pricing.price_for_credits(config, credits)
    return {
        'credits': credits,
        'price': price,
        'currency': config.currency,
        'price_per_credit': float(config.price_per_credit),
        'minimum_payment': fapshi.MINIMUM_AMOUNT,
        'payable': price >= fapshi.MINIMUM_AMOUNT,
    }


PURCHASES_CLOSED = 'Buying AI credits is not open yet. Your free daily credits still refresh every day.'


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def credit_pricing(request):
    """The price of a chosen number of credits, decided here."""
    config = credit_engine.get_config()
    base = {
        'purchases_enabled': config.purchases_enabled,
        'currency': config.currency,
        'min_purchase_credits': int(config.min_purchase_credits),
        'max_purchase_credits': int(config.max_purchase_credits),
    }
    if not config.purchases_enabled:
        return Response({**base, 'message': PURCHASES_CLOSED})
    raw = request.query_params.get('credits')
    if raw in (None, ''):
        return Response({**base, 'price_per_credit': float(config.price_per_credit)})
    credits, error = _parse_credits(raw, config)
    if error:
        return Response({**base, 'message': error}, status=status.HTTP_400_BAD_REQUEST)
    return Response({**base, **_quote(config, credits)})


def _serialize_purchase(txn, user):
    return {
        'transaction_id': txn.transaction_id,
        'status': txn.status,
        'processed': txn.processed,
        'credits': txn.ai_credits,
        'amount': float(txn.amount),
        'currency': txn.currency,
        'reason': txn.status_reason,
        'created_at': txn.created.isoformat() if txn.created else None,
        'balance': credit_engine.balance(user),
    }


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([AIRateThrottle])
def credit_purchase(request):
    """Start paying for credits by mobile money.

    The credits are added only once Fapshi itself confirms the payment -
    through the status check, the webhook or the reconciler, whichever sees it
    first - and never twice.
    """
    from apps.fees import fapshi
    from apps.fees.models import GatewayTransaction

    config = credit_engine.get_config()
    if not config.purchases_enabled:
        return Response({'message': PURCHASES_CLOSED, 'code': 'ai_credits_purchases_closed'},
                        status=status.HTTP_400_BAD_REQUEST)
    credits, error = _parse_credits(request.data.get('credits'), config)
    if error:
        return Response({'message': error}, status=status.HTTP_400_BAD_REQUEST)
    phone = str(request.data.get('phone') or '').strip()
    if not phone:
        return Response({'message': 'A mobile money number is required.'}, status=status.HTTP_400_BAD_REQUEST)
    if not fapshi.is_configured():
        return Response({'message': 'Mobile money is not configured on the server.'},
                        status=status.HTTP_503_SERVICE_UNAVAILABLE)

    quote = _quote(config, credits)
    if not quote['payable']:
        return Response(
            {'message': f'Mobile money payments start at {fapshi.MINIMUM_AMOUNT} {config.currency}. Choose more credits.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # A second press of Pay, a refresh, a resubmitted form: answered with the
    # payment already started, not a second prompt on the phone.
    recent = GatewayTransaction.objects.filter(
        purpose=GatewayTransaction.PURPOSE_AI_CREDITS,
        initiated_by=request.user,
        status=GatewayTransaction.STATUS_PENDING,
        ai_credits=credits,
        phone_number=phone,
        created__gte=timezone.now() - DUPLICATE_PURCHASE_WINDOW,
    ).exclude(provider_transaction_id='').order_by('-created').first()
    if recent:
        return Response(_serialize_purchase(recent, request.user), status=status.HTTP_200_OK)

    # Two presses landing at the same instant: only one gets through.
    lock_key = f'ai-credits:purchase-lock:{request.user.pk}'
    if not cache.add(lock_key, 1, 20):
        return Response({'message': 'A payment is already being started. Check your phone.'},
                        status=status.HTTP_409_CONFLICT)
    try:
        txn = GatewayTransaction.objects.create(
            provider=GatewayTransaction.PROVIDER_FAPSHI,
            purpose=GatewayTransaction.PURPOSE_AI_CREDITS,
            school=getattr(request.user, 'school', None) if getattr(request.user, 'school_id', None) else None,
            initiated_by=request.user,
            beneficiary=request.user,
            amount=quote['price'],
            currency='XAF',
            ai_credits=credits,
            phone_number=phone,
            gateway=fapshi.resolve_medium(request.data.get('operator')) or '',
            transaction_id=f'EI-AIC-{uuid.uuid4().hex[:14].upper()}',
            status=GatewayTransaction.STATUS_PENDING,
        )
        try:
            result = fapshi.direct_pay(
                amount=quote['price'],
                phone=phone,
                external_id=txn.transaction_id,
                medium=fapshi.resolve_medium(request.data.get('operator')),
                name=request.user.get_full_name(),
                email=request.user.email or '',
                user_id=str(request.user.pk),
                message=f'EduIgnite AI credits x{credits}',
            )
        except fapshi.FapshiError as exc:
            # Kept pending, never deleted: the prompt may still have gone out,
            # and the reconciler can still find a payment the payer approves.
            txn.status_reason = str(exc)[:255]
            txn.save(update_fields=['status_reason', 'modified'])
            logger.warning('Fapshi direct-pay failed for AI credits %s: %s', txn.transaction_id, exc)
            return Response({'message': str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        txn.provider_transaction_id = str(result.get('transId') or '')
        txn.raw_response = result
        txn.save(update_fields=['provider_transaction_id', 'raw_response', 'modified'])
        if not txn.provider_transaction_id:
            logger.error('Fapshi returned no transId for AI credits %s: %s', txn.transaction_id, result)
            return Response({'message': 'The payment could not be started. Please try again.'},
                            status=status.HTTP_502_BAD_GATEWAY)
        return Response(_serialize_purchase(txn, request.user), status=status.HTTP_201_CREATED)
    finally:
        cache.delete(lock_key)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def credit_purchase_status(request, transaction_id):
    """Where a credit purchase has got to, re-read from Fapshi while pending."""
    from apps.fees import fapshi
    from apps.fees.fapshi_views import sync_transaction
    from apps.fees.models import GatewayTransaction

    txn = GatewayTransaction.objects.filter(
        transaction_id=transaction_id,
        purpose=GatewayTransaction.PURPOSE_AI_CREDITS,
        initiated_by=request.user,
    ).first()
    if txn is None:
        return Response({'message': 'No such purchase.'}, status=status.HTTP_404_NOT_FOUND)
    if txn.status == GatewayTransaction.STATUS_PENDING and not txn.processed:
        try:
            txn = sync_transaction(txn)
        except fapshi.FapshiError as exc:
            logger.info('Fapshi status check failed for %s: %s', txn.transaction_id, exc)
    return Response(_serialize_purchase(txn, request.user))


# ---------------------------------------------------------------------------
# For the people who run EduIgnite
# ---------------------------------------------------------------------------

@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated, IsExecutive])
def admin_credit_config(request):
    """Read the pricing rules; CEO, CTO and Super Admin may change them."""
    config = credit_engine.get_config()
    config = AICreditConfig.objects.get(pk=config.pk)
    if request.method == 'GET':
        return Response(CreditConfigSerializer(config).data)
    if not IsCEOOrCTO().has_permission(request, None):
        return Response({'message': 'Only the CEO, CTO or Super Admin can change AI credit pricing.'},
                        status=status.HTTP_403_FORBIDDEN)
    serializer = CreditConfigSerializer(config, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save(updated_by=request.user)
    credit_engine.invalidate_config()
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsExecutive])
def admin_credit_economics(request):
    try:
        days = int(request.query_params.get('days') or 30)
    except ValueError:
        days = 30
    return Response(economics(days))


def _find_user(identifier):
    identifier = str(identifier or '').strip()
    if not identifier:
        return None
    query = Q(matricule__iexact=identifier) | Q(email__iexact=identifier)
    try:
        query |= Q(pk=uuid.UUID(identifier))
    except ValueError:
        pass
    return User.objects.filter(query).first()


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsExecutive])
def admin_credit_account(request):
    """One person's credits and recent history, found by matricule or email."""
    user = _find_user(request.query_params.get('user'))
    if user is None:
        return Response({'message': 'No user with that matricule, email or id.'}, status=status.HTTP_404_NOT_FOUND)
    history = AICreditTransaction.objects.filter(user=user).order_by('-created_at')[:30]
    return Response({
        'user': {'id': str(user.pk), 'name': user.get_full_name(), 'matricule': user.matricule,
                 'email': user.email, 'role': user.role},
        'balance': credit_engine.balance(user),
        'history': CreditTransactionSerializer(history, many=True).data,
    })


ADJUSTMENT_KINDS = {
    AICreditTransaction.BONUS,
    AICreditTransaction.REFUND,
    AICreditTransaction.ADMIN_ADJUSTMENT,
}


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsCEOOrCTO])
def admin_credit_adjust(request):
    """Add or remove credits by hand, always with a reason on the ledger."""
    user = _find_user(request.data.get('user'))
    if user is None:
        return Response({'message': 'No user with that matricule, email or id.'}, status=status.HTTP_404_NOT_FOUND)
    try:
        amount = int(request.data.get('amount'))
    except (TypeError, ValueError):
        return Response({'message': 'Enter a whole number of credits.'}, status=status.HTTP_400_BAD_REQUEST)
    if amount == 0:
        return Response({'message': 'Enter a number of credits other than zero.'}, status=status.HTTP_400_BAD_REQUEST)
    reason = str(request.data.get('reason') or '').strip()
    if not reason:
        return Response({'message': 'Say why, so the ledger explains itself.'}, status=status.HTTP_400_BAD_REQUEST)
    kind = str(request.data.get('kind') or AICreditTransaction.ADMIN_ADJUSTMENT).upper()
    if kind not in ADJUSTMENT_KINDS:
        return Response({'message': 'Unknown adjustment type.'}, status=status.HTTP_400_BAD_REQUEST)

    if amount > 0:
        line, _ = credit_engine.grant(user, amount, kind, description=reason[:255], created_by=request.user)
    else:
        line = credit_engine.deduct(user, -amount, description=reason[:255], created_by=request.user)
    return Response({
        'transaction': CreditTransactionSerializer(line).data,
        'balance': credit_engine.balance(user),
    }, status=status.HTTP_201_CREATED)
