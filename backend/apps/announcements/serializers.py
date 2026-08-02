from rest_framework import serializers
from .models import Announcement, AnnouncementRead


class AnnouncementListSerializer(serializers.ModelSerializer):
    sender_name = serializers.CharField(source='sender.get_full_name', read_only=True)
    sender_role = serializers.CharField(source='sender.role', read_only=True)
    sender_avatar = serializers.SerializerMethodField()
    is_read = serializers.SerializerMethodField()
    target_display = serializers.CharField(source='get_target_display', read_only=True)
    content = serializers.CharField(read_only=True)
    can_manage = serializers.SerializerMethodField()

    class Meta:
        model = Announcement
        fields = ['id', 'title', 'content', 'sender', 'sender_name', 'sender_role', 'sender_avatar',
                  'target', 'target_display', 'is_pinned', 'created_at', 'is_read', 'view_count',
                  'can_manage']

    def get_sender_avatar(self, obj):
        return obj.sender.avatar or None

    def get_can_manage(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if not user or not getattr(user, 'is_authenticated', False):
            return False
        role = (getattr(user, 'role', '') or '').upper()
        return obj.sender_id == user.id or role in ['SCHOOL_ADMIN', 'CEO', 'CTO']

    def get_is_read(self, obj):
        request = self.context.get('request')
        if request and request.user:
            return AnnouncementRead.objects.filter(announcement=obj, user=request.user).exists()
        return False


class AnnouncementDetailSerializer(serializers.ModelSerializer):
    sender_name = serializers.CharField(source='sender.get_full_name', read_only=True)
    sender_role = serializers.CharField(source='sender.role', read_only=True)
    sender_avatar = serializers.SerializerMethodField()
    is_read = serializers.SerializerMethodField()
    target_display = serializers.CharField(source='get_target_display', read_only=True)

    class Meta:
        model = Announcement
        fields = ['id', 'title', 'content', 'sender', 'sender_name', 'sender_role', 'sender_avatar',
                  'target', 'target_display', 'target_user', 'is_pinned', 'created_at', 'expires_at',
                  'attachment', 'view_count', 'is_read']

    def get_sender_avatar(self, obj):
        return obj.sender.avatar or None

    def get_is_read(self, obj):
        request = self.context.get('request')
        if request and request.user:
            return AnnouncementRead.objects.filter(announcement=obj, user=request.user).exists()
        return False


class AnnouncementCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Announcement
        fields = ['title', 'content', 'target', 'target_user', 'is_pinned', 'expires_at', 'attachment']

    def validate(self, data):
        request = self.context.get('request')
        if not request or not request.user:
            raise serializers.ValidationError("User is required")

        target = data.get('target')
        if target == 'PERSONAL' and not data.get('target_user'):
            raise serializers.ValidationError("target_user is required for personal announcements")

        return data

    def create(self, validated_data):
        validated_data['sender'] = self.context['request'].user
        if self.context['request'].user.school:
            validated_data['school'] = self.context['request'].user.school
        return super().create(validated_data)


class AnnouncementReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = AnnouncementRead
        fields = ['id', 'announcement', 'user', 'read_at']
