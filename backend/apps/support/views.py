from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Sum
from .models import SupportContribution
from .serializers import (
    SupportContributionSerializer, SupportContributionCreateSerializer,
    SupportVerifySerializer
)
from apps.registry.permissions import RequiresApp


def is_platform_executive(user):
    return bool(getattr(user, 'is_authenticated', False) and getattr(user, 'is_platform_executive', False))


class SupportContributionViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, RequiresApp('support')]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'payment_method']
    search_fields = ['user__first_name', 'user__last_name', 'transaction_reference']
    ordering_fields = ['created_at', 'amount']
    ordering = ['-created_at']

    def get_serializer_class(self):
        if self.action == 'create':
            return SupportContributionCreateSerializer
        elif self.action == 'verify' or self.action == 'reject':
            return SupportVerifySerializer
        return SupportContributionSerializer

    def get_queryset(self):
        user = self.request.user
        if is_platform_executive(user):
            return SupportContribution.objects.all()
        else:
            return SupportContribution.objects.filter(user=user)

    def check_permissions(self, request):
        if self.action in ['verify', 'reject']:
            if not is_platform_executive(request.user):
                self.permission_denied(request)
        return super().check_permissions(request)

    @action(detail=True, methods=['post'])
    def verify(self, request, pk=None):
        """Verify a contribution (executive only)"""
        if not is_platform_executive(request.user):
            return Response({'detail': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)

        contribution = self.get_object()
        serializer = SupportVerifySerializer(contribution, data=request.data, partial=True, context={'request': request})
        if serializer.is_valid():
            serializer.validated_data['status'] = 'Verified'
            serializer.save()

            try:
                from apps.notifications.models import Notification
                Notification.objects.create(
                    user=contribution.user,
                    title='Support Contribution Verified',
                    message=f"Your contribution of {contribution.amount} {contribution.currency} has been verified",
                    notification_type='success'
                )
            except Exception:
                pass

            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Reject a contribution (executive only)"""
        if not is_platform_executive(request.user):
            return Response({'detail': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)

        contribution = self.get_object()
        contribution.status = 'Rejected'
        contribution.verified_by = request.user
        from django.utils import timezone
        contribution.verified_at = timezone.now()
        contribution.save()

        try:
            from apps.notifications.models import Notification
            Notification.objects.create(
                user=contribution.user,
                title='Support Contribution Rejected',
                message=f"Your contribution of {contribution.amount} {contribution.currency} was rejected",
                notification_type='warning'
            )
        except Exception:
            pass

        return Response({'status': 'contribution rejected'})

    @action(detail=False, methods=['post'], url_path='collect')
    def collect(self, request):
        """Charge the user's MTN / Orange mobile-money line via Fapshi for a
        support contribution. Creates the contribution (status 'New'), triggers
        the operator payment prompt, and returns the transaction_id the client
        polls with `payment-status`. Credentials never leave the server."""
        from apps.fees import fapshi

        if not fapshi.is_configured():
            return Response(
                {'detail': 'Mobile money is not configured on the server.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        amount = request.data.get('amount')
        phone = request.data.get('phone')
        message = request.data.get('message', '')
        operator = request.data.get('operator') or request.data.get('gateway')
        if not amount or not phone:
            return Response(
                {'detail': 'amount and phone are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            amount_value = int(float(amount))
            if amount_value <= 0:
                raise ValueError
        except (TypeError, ValueError):
            return Response(
                {'detail': 'amount must be a positive number.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if amount_value < fapshi.MINIMUM_AMOUNT:
            return Response(
                {'detail': f'Mobile money payments start at {fapshi.MINIMUM_AMOUNT} XAF.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        contribution = SupportContribution.objects.create(
            user=request.user,
            school=getattr(request.user, 'school', None),
            amount=amount_value,
            currency='XAF',
            payment_method='Mobile Money',
            phone=str(phone),
            message=message,
            status='New',
        )
        try:
            result = fapshi.direct_pay(
                amount=amount_value,
                phone=str(phone),
                external_id=f'SUP{contribution.id}',
                medium=fapshi.resolve_medium(operator),
                name=request.user.get_full_name(),
                email=request.user.email or '',
                user_id=str(request.user.id),
                message='EduIgnite developer support',
            )
        except fapshi.FapshiError as exc:
            contribution.delete()
            return Response({'detail': str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        # Fapshi's transId is the only handle that confirms this payment; the
        # client polls `payment-status` with it. The prompt is still pending at
        # this point (the payer approves on their phone), so nothing is marked
        # Verified until a status re-query confirms it.
        trans_id = str(result.get('transId') or '')
        if not trans_id:
            contribution.delete()
            return Response(
                {'detail': 'The payment could not be started. Please try again.'},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        contribution.transaction_reference = trans_id
        contribution.save(update_fields=['transaction_reference'])
        return Response(
            {
                'contribution_id': contribution.id,
                'transaction_id': trans_id,
                'provider_transaction_id': trans_id,
                'status': 'PENDING',
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=['get'], url_path='payment-status/(?P<transaction_id>[^/.]+)')
    def payment_status(self, request, transaction_id=None):
        """Poll Fapshi for the authoritative status of a support payment and
        mark the matching contribution Verified once it succeeds. The paid
        amount is checked against what was pledged, so a short payment never
        verifies a contribution."""
        from apps.fees import fapshi

        try:
            data = fapshi.payment_status(transaction_id)
        except fapshi.FapshiError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        state = fapshi.normalize_status(data)
        contribution = SupportContribution.objects.filter(
            user=request.user, transaction_reference=transaction_id
        ).first()
        if contribution and state == 'SUCCESS' and contribution.status != 'Verified':
            paid = fapshi.amount_of(data)
            if paid is not None and paid >= int(contribution.amount):
                from django.utils import timezone
                contribution.status = 'Verified'
                contribution.verified_at = timezone.now()
                contribution.save(update_fields=['status', 'verified_at'])

        return Response({
            'status': state,
            'contribution_status': contribution.status if contribution else None,
        })

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Get support contribution statistics (executive only)"""
        if not is_platform_executive(request.user):
            return Response({'detail': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)

        all_contributions = SupportContribution.objects.all()
        verified = all_contributions.filter(status='Verified')

        stats = {
            'total_contributions': all_contributions.count(),
            'verified_contributions': verified.count(),
            'new_contributions': all_contributions.filter(status='New').count(),
            'rejected_contributions': all_contributions.filter(status='Rejected').count(),
            'total_verified_amount': verified.aggregate(Sum('amount'))['amount__sum'] or 0,
            'by_currency': dict(verified.values('currency').annotate(total=Sum('amount')).values_list('currency', 'total')),
        }
        return Response(stats)
