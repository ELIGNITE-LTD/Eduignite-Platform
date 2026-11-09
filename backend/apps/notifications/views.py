from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.contrib.auth import get_user_model
from django.db.models import Q
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from .models import Notification, NotificationDevice, NotificationPriority, NotificationType
from .permissions import CanManagePlatformNotifications
from .serializers import NotificationCreateSerializer, NotificationDeviceSerializer, NotificationSerializer
from .services import create_notifications, notification_group_name

User = get_user_model()


class NotificationViewSet(viewsets.ModelViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated, CanManagePlatformNotifications]

    def get_queryset(self):
        user = self.request.user
        queryset = Notification.objects.select_related('recipient', 'sender').filter(recipient=user)
        notification_type = self.request.query_params.get('notification_type')
        priority = self.request.query_params.get('priority')
        is_read = self.request.query_params.get('is_read')
        search = self.request.query_params.get('search')
        if notification_type:
            queryset = queryset.filter(notification_type=notification_type)
        if priority:
            queryset = queryset.filter(priority=priority)
        if is_read in ['true', 'false']:
            queryset = queryset.filter(is_read=is_read == 'true')
        if search:
            queryset = queryset.filter(Q(title__icontains=search) | Q(message__icontains=search))
        return queryset

    def get_serializer_class(self):
        if self.action == 'create':
            return NotificationCreateSerializer
        return NotificationSerializer

    def perform_create(self, serializer):
        user = self.request.user
        from apps.users.executive_access import user_has_module

        if user.role not in ['SCHOOL_ADMIN', 'SUB_ADMIN'] and not user_has_module(user, 'announcements'):
            raise PermissionDenied('You cannot create managed notifications.')
        data = serializer.validated_data
        recipients = User.objects.filter(is_active=True)
        recipient_ids = data.get('recipient_ids')
        role_targets = data.get('role_targets')
        if recipient_ids:
            recipients = recipients.filter(id__in=recipient_ids)
        elif role_targets:
            recipients = recipients.filter(role__in=role_targets)
            if user.role in ['SCHOOL_ADMIN', 'SUB_ADMIN']:
                recipients = recipients.filter(school=user.school)
        else:
            raise ValidationError('Provide recipient_ids or role_targets.')
        create_notifications(
            recipients=recipients,
            sender=user,
            title=data['title'],
            message=data['message'],
            notification_type=data.get('notification_type') or NotificationType.PLATFORM,
            priority=data.get('priority') or NotificationPriority.NORMAL,
            icon=data.get('icon') or 'bell',
            url=data.get('url') or '',
        )

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return Response({'detail': 'Notifications queued for delivery.'}, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def mark_read(self, request, pk=None):
        notification = self.get_object()
        notification.is_read = True
        notification.save(update_fields=['is_read', 'modified'])
        unread_count = Notification.objects.filter(recipient=request.user, is_read=False).count()
        channel_layer = get_channel_layer()
        if channel_layer:
            async_to_sync(channel_layer.group_send)(
                notification_group_name(request.user.id),
                {'type': 'notification.read', 'notification_id': str(notification.id), 'unread_count': unread_count},
            )
        return Response({'unread_count': unread_count})

    @action(detail=False, methods=['post'])
    def mark_all_read(self, request):
        self.get_queryset().filter(is_read=False).update(is_read=True)
        return Response({'unread_count': 0})

    def list(self, request, *args, **kwargs):
        try:
            from apps.chat.presence import touch_presence
            touch_presence(str(request.user.id))
        except Exception:  # noqa: BLE001
            pass
        return super().list(request, *args, **kwargs)

    @action(detail=False, methods=['get'])
    def unread_count(self, request):
        return Response({'unread_count': self.get_queryset().filter(is_read=False).count()})


class NotificationDeviceViewSet(viewsets.ModelViewSet):
    serializer_class = NotificationDeviceSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return NotificationDevice.objects.filter(user=self.request.user)

    def perform_destroy(self, instance):
        instance.active = False
        instance.save(update_fields=['active', 'modified'])
