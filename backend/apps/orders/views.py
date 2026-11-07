import base64
from io import BytesIO

import qrcode
from django.conf import settings
from django.utils import timezone
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Count
from .models import Order
from .serializers import (
    OrderListSerializer, OrderDetailSerializer,
    OrderCreateSerializer, OrderProcessSerializer
)
from apps.registry.permissions import RequiresApp
from apps.users.executive_access import user_has_any_module, user_has_module

ORDER_MODULES = ('support', 'schools')

# What one referred school is worth to whoever introduced it, in XAF.
# Paid once that school is set up, after the end of the year.
REFERRAL_REWARD_XAF = 20000


def _can_manage_orders(user):
    """School-account requests are worked from the Support and Schools modules."""
    return user_has_any_module(user, ORDER_MODULES)


class IsExecutiveOrReadOnly(permissions.BasePermission):
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return request.user and request.user.is_authenticated
        return request.user and request.user.is_authenticated and request.user.is_platform_executive


class OrderViewSet(viewsets.ModelViewSet):
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status']
    search_fields = ['full_name', 'school_name', 'email']
    ordering_fields = ['created_at', 'processed_at']
    ordering = ['-created_at']

    def get_serializer_class(self):
        if self.action == 'create':
            return OrderCreateSerializer
        elif self.action == 'retrieve':
            return OrderDetailSerializer
        elif self.action == 'process':
            return OrderProcessSerializer
        return OrderListSerializer

    def get_queryset(self):
        user = self.request.user
        if _can_manage_orders(user):
            return Order.objects.all()
        return Order.objects.none()

    def get_permissions(self):
        if self.action == 'create':
            self.permission_classes = [permissions.AllowAny]
        elif self.action == 'my_referral':
            # Anyone with an account can invite a school. This is not an
            # executive tool and must not sit behind the orders licence,
            # which most schools do not hold.
            self.permission_classes = [permissions.IsAuthenticated]
        elif self.action in ['list', 'retrieve']:
            self.permission_classes = [permissions.IsAuthenticated, RequiresApp('orders')]
        else:
            self.permission_classes = [permissions.IsAuthenticated, RequiresApp('orders')]
        return super().get_permissions()

    def check_permissions(self, request):
        if self.action in ['list', 'retrieve']:
            if not _can_manage_orders(request.user):
                self.permission_denied(request)
        elif self.action in ['update', 'partial_update', 'destroy', 'process']:
            if not _can_manage_orders(request.user):
                self.permission_denied(request)
        return super().check_permissions(request)

    @action(detail=True, methods=['post'])
    def process(self, request, pk=None):
        """Process an order (executive only)"""
        if not _can_manage_orders(request.user):
            return Response({'detail': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)

        order = self.get_object()
        serializer = OrderProcessSerializer(order, data=request.data, partial=True, context={'request': request})
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'], url_path='my-referral')
    def my_referral(self, request):
        """This person's own invitation link, and how it has done.

        Anyone can invite a school: a teacher who moves, a parent with a
        child at another school, a bursar who knows the bursar next door.
        The counts are of schools that arrived through this link, so the
        person can see their introductions actually landing rather than
        sharing into silence.
        """
        from apps.users.referrals import get_or_create_referral_code

        # Students do not take part. They are the people a school exists to
        # teach, and paying them to bring schools in is not a position to put
        # a child in.
        if getattr(request.user, 'role', None) == 'STUDENT':
            return Response(
                {'detail': 'The referral programme is not open to student accounts.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        code = get_or_create_referral_code(request.user)
        base = getattr(settings, 'FRONTEND_URL', 'https://eduignite.online').rstrip('/')

        referred = Order.objects.filter(referred_by=request.user)
        set_up = referred.filter(status='processed')

        # A referral is earned when the school is actually set up, not when
        # the form is submitted. Paying on submission would mean anyone could
        # type a school name into a public form and be owed money for it.
        qualifying = set_up.count()
        year = timezone.now().year

        return Response({
            'code': code,
            'link': f'{base}/school-account-request?ref={code}',
            'total': referred.count(),
            'pending': referred.filter(status='pending').count(),
            'contacted': referred.filter(status='contacted').count(),
            'processed': qualifying,

            # What it is worth.
            'reward_per_school': REFERRAL_REWARD_XAF,
            'currency': 'XAF',
            'qualifying': qualifying,
            'earned': qualifying * REFERRAL_REWARD_XAF,
            # Introductions still working their way through, and what they
            # would be worth if every one of them is set up.
            'in_progress': referred.exclude(status__in=['processed', 'rejected']).count(),
            'in_progress_value': (
                referred.exclude(status__in=['processed', 'rejected']).count() * REFERRAL_REWARD_XAF
            ),
            'year': year,
            'paid_after': f'{year}-12-31',
        })

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Get order statistics (executive only)"""
        if not _can_manage_orders(request.user):
            return Response({'detail': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)

        orders = Order.objects.all()
        stats = {
            'total': orders.count(),
            'by_status': dict(orders.values('status').annotate(count=Count('id')).values_list('status', 'count')),
            'pending': orders.filter(status='pending').count(),
            'contacted': orders.filter(status='contacted').count(),
            'processed': orders.filter(status='processed').count(),
            'rejected': orders.filter(status='rejected').count(),
        }
        return Response(stats)

    @action(detail=False, methods=['get'], url_path='flyer-qr')
    def flyer_qr(self, request):
        """Generate a scannable flyer QR code for the public school account request page."""
        if not user_has_module(request.user, 'flyer_qr'):
            return Response({'detail': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)

        default_url = f"{getattr(settings, 'FRONTEND_URL', 'https://eduignite.online').rstrip('/')}/school-account-request?source=flyer"
        target_url = (request.query_params.get('url') or default_url).strip()
        if not target_url.startswith(('https://', 'http://')):
            return Response({'detail': 'QR target must be a full http(s) URL.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(target_url) > 500:
            return Response({'detail': 'QR target URL is too long.'}, status=status.HTTP_400_BAD_REQUEST)

        qr = qrcode.QRCode(
            version=None,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=12,
            border=3,
        )
        qr.add_data(target_url)
        qr.make(fit=True)
        image = qr.make_image(fill_color='#264D73', back_color='white').convert('RGB')
        buffer = BytesIO()
        image.save(buffer, format='PNG')
        encoded = base64.b64encode(buffer.getvalue()).decode('utf-8')

        return Response({
            'url': target_url,
            'qr_data_url': f'data:image/png;base64,{encoded}',
            'format': 'png',
        })
