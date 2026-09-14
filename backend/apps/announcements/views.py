from django.db.models import Exists, OuterRef, Q
from django.utils import timezone
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.response import Response

from apps.registry.permissions import RequiresApp

from . import audience
from .models import Announcement, AnnouncementAudienceGrant, AnnouncementRead
from .serializers import (
    AnnouncementAudienceGrantSerializer,
    AnnouncementCreateSerializer,
    AnnouncementDetailSerializer,
    AnnouncementListSerializer,
)


class AnnouncementViewSet(viewsets.ModelViewSet):
    """Announcements feed and authoring.

    The queryset is the recipient filter: a person only ever receives the
    announcements ``audience.visible_announcements_q`` allows for their role
    and school, whatever endpoint they read them through.
    """

    permission_classes = [permissions.IsAuthenticated, RequiresApp('announcements')]
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ['title', 'content']
    ordering_fields = ['created_at', 'view_count']
    ordering = ['-is_pinned', '-created_at']

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return AnnouncementCreateSerializer
        if self.action == 'retrieve':
            return AnnouncementDetailSerializer
        return AnnouncementListSerializer

    def get_queryset(self):
        user = self.request.user
        # get_is_read() in the serializers prefers this annotation and falls
        # back to its own query per row when it is missing, which is one
        # query per announcement on every page. Exists() answers all of them
        # in the same statement.
        read_subquery = AnnouncementRead.objects.filter(announcement=OuterRef('pk'), user=user)
        return (
            Announcement.objects.filter(Q(expires_at__isnull=True) | Q(expires_at__gte=timezone.now()))
            .filter(audience.visible_announcements_q(user))
            .select_related('sender', 'target_school')
            .annotate(is_read_annotated=Exists(read_subquery))
            .distinct()
        )

    def check_permissions(self, request):
        # IsAuthenticated must run before anything reads request.user.role;
        # an anonymous request otherwise crashed with a 500 instead of a 401.
        super().check_permissions(request)
        if self.action == 'create' and not audience.can_write_announcements(request.user):
            self.permission_denied(request, message='Your role cannot publish announcements.')

    def perform_update(self, serializer):
        if not audience.can_manage_announcement(self.request.user, serializer.instance):
            self.permission_denied(self.request, message='You can only edit announcements you manage.')
        serializer.save()

    def perform_destroy(self, instance):
        if not audience.can_manage_announcement(self.request.user, instance):
            self.permission_denied(self.request, message='You can only delete announcements you manage.')
        instance.delete()

    @action(detail=False, methods=['get'])
    def audiences(self, request):
        """The audiences this person may choose when writing an announcement."""
        allowed = audience.allowed_targets_for(request.user)
        labels = dict(Announcement.TARGET_CHOICES)
        labels.update(audience.PLATFORM_AUDIENCE_LABELS)
        is_platform = audience.is_platform_sender(request.user)
        return Response({
            'can_publish': bool(allowed),
            'scope': 'platform' if is_platform else 'school',
            'targets': [{'value': value, 'label': labels.get(value, value)} for value in allowed],
            'default_target': allowed[0] if allowed else None,
            # A single choice needs no picker: the client applies it silently.
            'show_audience_picker': len(allowed) > 1,
            'can_choose_target_school': audience.can_choose_target_school(request.user),
        })

    @action(detail=True, methods=['post'])
    def mark_read(self, request, pk=None):
        announcement = self.get_object()
        AnnouncementRead.objects.get_or_create(announcement=announcement, user=request.user)
        Announcement.objects.filter(pk=announcement.pk).update(view_count=announcement.view_count + 1)
        return Response({'status': 'announcement marked as read'})

    def _paginated_response(self, request, queryset):
        page = self.paginate_queryset(queryset)
        serializer = AnnouncementListSerializer(page if page is not None else queryset, many=True, context={'request': request})
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def pinned(self, request):
        announcements = self.get_queryset().filter(is_pinned=True)
        return self._paginated_response(request, announcements)

    @action(detail=False, methods=['get'])
    def my_announcements(self, request):
        announcements = self.get_queryset()
        return self._paginated_response(request, announcements)

    @action(detail=False, methods=['get'])
    def platform_wide(self, request):
        """Platform announcements this executive may see."""
        if not audience.is_platform_sender(request.user):
            return Response({'detail': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)
        # This grows forever (every platform-wide announcement ever written)
        # and was returned in full, unpaginated, on every call. Routing it
        # through get_queryset() bounds it by pagination and gives it the
        # same select_related and is_read annotation as every other feed.
        announcements = self.get_queryset().filter(school__isnull=True)
        return self._paginated_response(request, announcements)

class IsCEO(permissions.BasePermission):
    message = 'Only the CEO can grant announcement audiences.'

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and (request.user.role or '').upper() == 'CEO'
        )


class AnnouncementAudienceGrantViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """CEO-only: extend another executive's announcement audiences."""

    serializer_class = AnnouncementAudienceGrantSerializer
    permission_classes = [permissions.IsAuthenticated, IsCEO]
    queryset = AnnouncementAudienceGrant.objects.select_related('user', 'granted_by')

    def perform_create(self, serializer):
        serializer.save(granted_by=self.request.user)
