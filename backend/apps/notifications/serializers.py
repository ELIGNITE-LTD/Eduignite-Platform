from django.utils import timezone
from rest_framework import serializers

from .models import Notification, NotificationDevice


class NotificationSerializer(serializers.ModelSerializer):
    sender_name = serializers.CharField(source='sender.name', read_only=True)
    recipient_name = serializers.CharField(source='recipient.name', read_only=True)
    created_at = serializers.DateTimeField(source='created', read_only=True)
    updated_at = serializers.DateTimeField(source='modified', read_only=True)

    class Meta:
        model = Notification
        fields = [
            'id', 'recipient', 'recipient_name', 'sender', 'sender_name', 'title', 'message',
            'notification_type', 'priority', 'icon', 'url', 'is_read', 'created_at', 'updated_at',
        ]
        read_only_fields = ['recipient', 'sender', 'created_at', 'updated_at']


class NotificationCreateSerializer(serializers.ModelSerializer):
    recipient_ids = serializers.ListField(
        child=serializers.UUIDField(),
        write_only=True,
        required=False,
        allow_empty=False,
    )
    role_targets = serializers.ListField(
        child=serializers.CharField(),
        write_only=True,
        required=False,
        allow_empty=True,
    )

    class Meta:
        model = Notification
        fields = [
            'recipient_ids', 'role_targets', 'title', 'message', 'notification_type',
            'priority', 'icon', 'url',
        ]


class NotificationDeviceSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationDevice
        fields = ['id', 'platform', 'token', 'browser_name', 'active', 'last_seen_at']
        read_only_fields = ['id', 'active', 'last_seen_at']

    def create(self, validated_data):
        request = self.context['request']
        obj, _ = NotificationDevice.objects.update_or_create(
            token=validated_data['token'],
            defaults={
                'user': request.user,
                'platform': validated_data.get('platform', NotificationDevice.Platform.WEB),
                'browser_name': validated_data.get('browser_name', ''),
                'active': True,
                'last_seen_at': timezone.now(),
            },
        )
        return obj
