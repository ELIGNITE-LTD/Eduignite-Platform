"""The AI credit API: balance, estimates, history, buying, and the admin side.

Every figure that matters - a balance, a price, a cost - is worked out here
on the server. The apps display what they are given and never compute a
price or confirm a payment themselves.
"""

import logging
import uuid
from datetime import timedelta

from django.contrib.auth import get_user_model
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

from .credit_purchases import (  # noqa: E402
    AI_IS_FREE,
    PURCHASES_CLOSED,
    PurchaseError,
    parse_credits as _parse_credits,
    quote as _quote,
    refresh_purchase,
    start_purchase,
)


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
    if not config.billing_enabled:
        return Response({**base, 'free_mode': True, 'message': AI_IS_FREE})
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
    try:
        txn, is_new = start_purchase(
            request.user, request.data.get('credits'), request.data.get('phone'),
            operator=request.data.get('operator'),
        )
    except PurchaseError as error:
        body = {'message': error.message}
        if error.code:
            body['code'] = error.code
        return Response(body, status=error.http_status)
    return Response(
        _serialize_purchase(txn, request.user),
        status=status.HTTP_201_CREATED if is_new else status.HTTP_200_OK,
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def credit_purchase_status(request, transaction_id):
    """Where a credit purchase has got to, re-read from Fapshi while pending."""
    from apps.fees.models import GatewayTransaction

    txn = GatewayTransaction.objects.filter(
        transaction_id=transaction_id,
        purpose=GatewayTransaction.PURPOSE_AI_CREDITS,
        initiated_by=request.user,
    ).first()
    if txn is None:
        return Response({'message': 'No such purchase.'}, status=status.HTTP_404_NOT_FOUND)
    return Response(_serialize_purchase(refresh_purchase(txn), request.user))


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
