from rest_framework import viewsets, status, serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db.models import Count, Q, Sum
from django.conf import settings as django_settings
from drf_spectacular.utils import extend_schema
import logging
import os
import uuid
import base64

from core.upload_validation import image_to_data_url, validate_image_upload
from .models import PlatformBillingChange, PlatformSettings, PlatformFees, PublicEvent, PublicEventComment, PublicEventLike, TutorialLink
from .serializers import (
    PlatformSettingsSerializer,
    PlatformFeesSerializer,
    PublicEventSerializer,
    PublicEventCommentSerializer,
    TutorialLinkSerializer,
)
from .permissions import IsExecutive
from apps.users.executive_access import executive_module_required, user_has_module

# Branding, fees, portfolio events, tutorials and platform policy belong to the
# Portfolio & Policy module.
PortfolioPolicyModule = executive_module_required('portfolio_policy')
FOUNDER_ONLY_SETTINGS = ('maintenance_mode', 'maintenance_scope')

User = get_user_model()
logger = logging.getLogger(__name__)

BILLING_FIELDS = (
    'per_student_fee', 'per_student_fee_by_category', 'payment_deadline',
    'payment_deadline_by_category', 'billing_cycle',
)


def _billing_snapshot(settings) -> dict:
    snapshot = {}
    for field in BILLING_FIELDS:
        value = getattr(settings, field)
        snapshot[field] = value if isinstance(value, (dict, str)) or value is None else str(value)
    return snapshot


class PlatformSettingsView(APIView):
    """
    GET /platform/settings/
    PATCH /platform/settings/
    Manage global platform settings.
    """

    CACHE_KEY = 'platform:settings'
    CACHE_SECONDS = 300

    def get_permissions(self):
        """Allow GET for all, PATCH for executives only."""
        if self.request.method == 'GET':
            return [AllowAny()]
        return [PortfolioPolicyModule()]

    @extend_schema(
        responses={200: PlatformSettingsSerializer},
        tags=['Platform'],
        description='Get platform settings',
    )
    def get(self, request):
        """Get platform settings."""
        # AllowAny, no auth -- called on every page load by every client.
        # This is a singleton row edited only by an occasional CEO/CTO PATCH,
        # so cache it and invalidate on that write below rather than relying
        # on TTL alone.
        data = cache.get(self.CACHE_KEY)
        if data is None:
            settings = PlatformSettings.load()
            data = PlatformSettingsSerializer(settings).data
            cache.set(self.CACHE_KEY, data, self.CACHE_SECONDS)
        return Response(data)

    @extend_schema(
        request=PlatformSettingsSerializer,
        responses={200: PlatformSettingsSerializer},
        tags=['Platform'],
        description='Update platform settings (Executive only)',
    )
    def patch(self, request):
        """Update platform settings (executives only)."""
        settings = PlatformSettings.load()
        serializer = PlatformSettingsSerializer(settings, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        # Switching the platform into or out of maintenance affects every school,
        # so only the founders may change it. A save that merely re-sends the
        # current value (the settings page posts the whole form) is fine.
        if getattr(request.user, 'role', None) not in ('CEO', 'CTO'):
            for field in FOUNDER_ONLY_SETTINGS:
                if field in serializer.validated_data and serializer.validated_data[field] != getattr(settings, field):
                    return Response(
                        {'detail': 'Only the CEO or CTO can change the maintenance mode.'},
                        status=403,
                    )
        before = _billing_snapshot(settings)
        serializer.save()
        after = _billing_snapshot(settings)
        changes = {k: {'old': before[k], 'new': after[k]} for k in after if before[k] != after[k]}
        if changes:
            PlatformBillingChange.objects.create(changed_by=request.user, changes=changes)
            logger.info('Platform billing config changed by %s: %s', request.user.pk, changes)
        cache.delete(self.CACHE_KEY)
        return Response(serializer.data)


class PlatformLogoUploadView(APIView):
    """
    POST /platform/upload-logo/
    Upload a logo image file and store as the platform logo.
    """
    permission_classes = [PortfolioPolicyModule]

    def post(self, request):
        file = request.FILES.get('logo')
        error = validate_image_upload(file, field_label='platform logo', allow_svg=True)
        if error:
            return Response({'detail': error}, status=400)

        try:
            logo_data_url = image_to_data_url(file)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=400)
        settings = PlatformSettings.load()
        settings.logo = logo_data_url
        settings.save(update_fields=['logo'])

        return Response({'logo_url': logo_data_url}, status=200)


class PlatformEventMediaUploadView(APIView):
    """
    POST /platform/upload-event-media/
    Upload an image or video file and return a data URL for portfolio use.
    """
    permission_classes = [PortfolioPolicyModule]

    def post(self, request):
        file = request.FILES.get('media')
        if not file:
            return Response({'detail': 'No file provided'}, status=400)

        allowed_types = [
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp',
            'image/svg+xml',
            'video/mp4',
            'video/webm',
            'video/ogg',
            'video/quicktime',
        ]
        if file.content_type not in allowed_types:
            return Response(
                {'detail': 'Invalid file type. Use JPEG, PNG, GIF, WebP, SVG, MP4, WebM, OGG, or MOV.'},
                status=400,
            )

        max_size = 5 * 1024 * 1024 if file.content_type.startswith('image/') else 12 * 1024 * 1024
        if file.size > max_size:
            limit_label = '5MB' if file.content_type.startswith('image/') else '12MB'
            return Response({'detail': f'File too large. Maximum size is {limit_label}.'}, status=400)

        encoded = base64.b64encode(file.read()).decode('utf-8')
        media_data_url = f'data:{file.content_type};base64,{encoded}'
        media_type = 'image' if file.content_type.startswith('image/') else 'video'

        return Response({'media_url': media_data_url, 'media_type': media_type}, status=200)


class PlatformFeesViewSet(viewsets.ModelViewSet):
    """
    CRUD endpoints for platform fees.
    """

    queryset = PlatformFees.objects.all()
    serializer_class = PlatformFeesSerializer
    lookup_field = 'id'

    def get_permissions(self):
        """Allow read for all, write for executives only."""
        if self.action in ['list', 'retrieve']:
            permission_classes = [AllowAny]
        else:
            permission_classes = [PortfolioPolicyModule]
        return [permission() for permission in permission_classes]

    @extend_schema(
        description='List all platform fees',
        tags=['Platform'],
    )
    def list(self, request, *args, **kwargs):
        """List all platform fees."""
        return super().list(request, *args, **kwargs)

    @extend_schema(
        description='Retrieve a specific fee',
        tags=['Platform'],
    )
    def retrieve(self, request, *args, **kwargs):
        """Retrieve specific fee."""
        return super().retrieve(request, *args, **kwargs)

    @extend_schema(
        request=PlatformFeesSerializer,
        description='Create a new fee (Executive only)',
        tags=['Platform'],
    )
    def create(self, request, *args, **kwargs):
        """Create new fee (executives only)."""
        return super().create(request, *args, **kwargs)

    @extend_schema(
        request=PlatformFeesSerializer,
        description='Update fee (Executive only)',
        tags=['Platform'],
    )
    def update(self, request, *args, **kwargs):
        """Update fee (executives only)."""
        return super().update(request, *args, **kwargs)

    @extend_schema(
        description='Partially update fee (Executive only)',
        tags=['Platform'],
    )
    def partial_update(self, request, *args, **kwargs):
        """Partially update fee (executives only)."""
        return super().partial_update(request, *args, **kwargs)

    @extend_schema(
        description='Delete fee (Executive only)',
        tags=['Platform'],
    )
    def destroy(self, request, *args, **kwargs):
        """Delete fee (executives only)."""
        return super().destroy(request, *args, **kwargs)


class PublicEventViewSet(viewsets.ModelViewSet):
    """
    CRUD endpoints for public events.
    Allows public read, restricted write.
    """

    queryset = PublicEvent.objects.filter(is_active=True).order_by('order', '-created_at')
    serializer_class = PublicEventSerializer

    def get_permissions(self):
        """Allow read for all, write for executives only."""
        if self.action in ['list', 'retrieve']:
            permission_classes = [AllowAny]
        elif self.action in ['like', 'unlike', 'comments']:
            permission_classes = [IsAuthenticated]
        else:
            permission_classes = [PortfolioPolicyModule]
        return [permission() for permission in permission_classes]

    def get_queryset(self):
        """Return active events for list, all for admin."""
        if user_has_module(self.request.user, 'portfolio_policy'):
            queryset = PublicEvent.objects.all()
        else:
            queryset = PublicEvent.objects.filter(is_active=True)
        return queryset.annotate(
            like_count=Count('likes', distinct=True),
            comment_count=Count('comments', filter=Q(comments__is_approved=True), distinct=True),
        ).prefetch_related('comments__author').order_by('order', '-created_at')

    def _build_event_payload(self, request, partial=False):
        payload = request.data.copy()
        media = request.FILES.get('media')
        if not media:
            return payload

        allowed_types = [
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp',
            'image/svg+xml',
            'video/mp4',
            'video/webm',
            'video/ogg',
            'video/quicktime',
        ]
        if media.content_type not in allowed_types:
            raise serializers.ValidationError(
                {'media': 'Invalid file type. Use JPEG, PNG, GIF, WebP, SVG, MP4, WebM, OGG, or MOV.'}
            )

        max_size = 5 * 1024 * 1024 if media.content_type.startswith('image/') else 12 * 1024 * 1024
        if media.size > max_size:
            limit_label = '5MB' if media.content_type.startswith('image/') else '12MB'
            raise serializers.ValidationError({'media': f'File too large. Maximum size is {limit_label}.'})

        encoded = base64.b64encode(media.read()).decode('utf-8')
        payload['url'] = f'data:{media.content_type};base64,{encoded}'
        if not partial or 'type' not in payload:
            payload['type'] = 'image' if media.content_type.startswith('image/') else 'video'
        return payload

    @extend_schema(
        description='List public events',
        tags=['Platform'],
    )
    def list(self, request, *args, **kwargs):
        """List public events."""
        return super().list(request, *args, **kwargs)

    @extend_schema(
        description='Retrieve a specific event',
        tags=['Platform'],
    )
    def retrieve(self, request, *args, **kwargs):
        """Retrieve specific event."""
        return super().retrieve(request, *args, **kwargs)

    @extend_schema(
        request=PublicEventSerializer,
        description='Create a new event (Executive only)',
        tags=['Platform'],
    )
    def create(self, request, *args, **kwargs):
        """Create new event (executives only)."""
        payload = self._build_event_payload(request)
        serializer = self.get_serializer(data=payload)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    @extend_schema(
        request=PublicEventSerializer,
        description='Update event (Executive only)',
        tags=['Platform'],
    )
    def update(self, request, *args, **kwargs):
        """Update event (executives only)."""
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        payload = self._build_event_payload(request, partial=partial)
        serializer = self.get_serializer(instance, data=payload, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(serializer.data)

    @extend_schema(
        description='Partially update event (Executive only)',
        tags=['Platform'],
    )
    def partial_update(self, request, *args, **kwargs):
        """Partially update event (executives only)."""
        kwargs['partial'] = True
        return self.update(request, *args, **kwargs)

    @extend_schema(
        description='Delete event (Executive only)',
        tags=['Platform'],
    )
    def destroy(self, request, *args, **kwargs):
        """Delete event (executives only)."""
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    def like(self, request, pk=None):
        event = self.get_object()
        PublicEventLike.objects.get_or_create(event=event, user=request.user)
        serializer = self.get_serializer(event)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def unlike(self, request, pk=None):
        event = self.get_object()
        PublicEventLike.objects.filter(event=event, user=request.user).delete()
        serializer = self.get_serializer(event)
        return Response(serializer.data)

    @action(detail=True, methods=['get', 'post'])
    def comments(self, request, pk=None):
        event = self.get_object()
        if request.method == 'GET':
            comments = event.comments.filter(is_approved=True).select_related('author')
            serializer = PublicEventCommentSerializer(comments, many=True)
            return Response(serializer.data)
        serializer = PublicEventCommentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(event=event, author=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class TutorialLinkViewSet(viewsets.ModelViewSet):
    """
    CRUD endpoints for tutorial links.
    """

    queryset = TutorialLink.objects.all().order_by('role', 'title')
    serializer_class = TutorialLinkSerializer

    def get_permissions(self):
        """Allow read for all, write for executives only."""
        if self.action in ['list', 'retrieve']:
            permission_classes = [AllowAny]
        else:
            permission_classes = [PortfolioPolicyModule]
        return [permission() for permission in permission_classes]

    @extend_schema(
        description='List tutorial links',
        tags=['Platform'],
    )
    def list(self, request, *args, **kwargs):
        """List tutorial links."""
        return super().list(request, *args, **kwargs)

    @extend_schema(
        description='Retrieve a specific tutorial link',
        tags=['Platform'],
    )
    def retrieve(self, request, *args, **kwargs):
        """Retrieve specific tutorial link."""
        return super().retrieve(request, *args, **kwargs)

    @extend_schema(
        request=TutorialLinkSerializer,
        description='Create a new tutorial link (Executive only)',
        tags=['Platform'],
    )
    def create(self, request, *args, **kwargs):
        """Create new tutorial link (executives only)."""
        return super().create(request, *args, **kwargs)

    @extend_schema(
        request=TutorialLinkSerializer,
        description='Update tutorial link (Executive only)',
        tags=['Platform'],
    )
    def update(self, request, *args, **kwargs):
        """Update tutorial link (executives only)."""
        return super().update(request, *args, **kwargs)

    @extend_schema(
        description='Partially update tutorial link (Executive only)',
        tags=['Platform'],
    )
    def partial_update(self, request, *args, **kwargs):
        """Partially update tutorial link (executives only)."""
        return super().partial_update(request, *args, **kwargs)

    @extend_schema(
        description='Delete tutorial link (Executive only)',
        tags=['Platform'],
    )
    def destroy(self, request, *args, **kwargs):
        """Delete tutorial link (executives only)."""
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=['get'])
    @extend_schema(
        description='Get tutorial links by role',
        tags=['Platform'],
    )
    def by_role(self, request):
        """Get tutorial links for a specific role."""
        role = request.query_params.get('role')
        if not role:
            return Response(
                {'detail': 'role query parameter required'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        links = TutorialLink.objects.filter(role=role)
        serializer = TutorialLinkSerializer(links, many=True)
        return Response(serializer.data)


class PlatformStatsView(APIView):
    """
    GET /platform/stats/
    Aggregate statistics across the entire platform.
    """

    permission_classes = [IsExecutive]

    @extend_schema(
        responses={
            200: {
                'type': 'object',
                'properties': {
                    'total_schools': {'type': 'integer'},
                    'total_users': {'type': 'integer'},
                    'active_users': {'type': 'integer'},
                    'users_by_role': {'type': 'object'},
                    'total_students': {'type': 'integer'},
                    'total_teachers': {'type': 'integer'},
                    'total_parents': {'type': 'integer'},
                    'license_paid_count': {'type': 'integer'},
                    'license_unpaid_count': {'type': 'integer'},
                    'schools_by_status': {'type': 'object'},
                    'schools_by_region': {'type': 'object'},
                },
            },
        },
        tags=['Platform'],
        description='Get platform-wide statistics',
    )
    def get(self, request):
        """Get comprehensive platform statistics."""
        from apps.schools.models import School
        from apps.orders.models import Order
        from apps.fees.models import GatewayTransaction, Payment

        users_queryset = User.objects.all()
        schools_queryset = School.objects.all()
        payments_queryset = Payment.objects.filter(status='confirmed')
        # Platform net revenue is live money the platform actually collected:
        # confirmed payments that came through a LIVE gateway collection. This
        # excludes manually recorded (cash) entries and any sandbox test
        # payments, so founders see real live revenue only.
        live_revenue_queryset = payments_queryset.filter(
            gateway_transaction__environment=GatewayTransaction.ENV_LIVE,
        )
        orders_queryset = Order.objects.all()

        users_by_role_qs = users_queryset.values('role').annotate(count=Count('id')).order_by('role')
        users_by_role = {item['role']: item['count'] for item in users_by_role_qs}

        schools_by_status = (
            schools_queryset.values('status')
            .annotate(count=Count('id'))
        )

        schools_by_region = (
            schools_queryset.values('region')
            .annotate(count=Count('id'))
        )

        stats_data = {
            'total_schools': schools_queryset.count(),
            'active_schools': schools_queryset.filter(status='Active').count(),
            'total_users': users_queryset.count(),
            'active_users': users_queryset.filter(is_active=True).count(),
            'users_by_role': users_by_role,
            'total_students': users_queryset.filter(role='STUDENT').count(),
            'total_teachers': users_queryset.filter(role='TEACHER').count(),
            'total_parents': users_queryset.filter(role='PARENT').count(),
            'license_paid_count': users_queryset.filter(is_license_paid=True).count(),
            'license_unpaid_count': users_queryset.filter(is_license_paid=False).count(),
            'founder_count': users_queryset.filter(role__in=['CEO', 'CTO']).count(),
            'executive_count': users_queryset.filter(role__in=['SUPER_ADMIN', 'CEO', 'CTO', 'COO', 'INV', 'DESIGNER', 'SYSTEM_DEV']).count(),
            'new_orders': orders_queryset.filter(status='pending').count(),
            'total_orders': orders_queryset.count(),
            'total_revenue': str(live_revenue_queryset.aggregate(total=Sum('amount'))['total'] or 0),
            'schools_by_status': list(schools_by_status),
            'schools_by_region': list(schools_by_region),
            'total_student_enrollments': sum(s.student_count for s in schools_queryset),
            'total_teachers_employed': sum(s.teacher_count for s in schools_queryset),
        }

        return Response(stats_data)
