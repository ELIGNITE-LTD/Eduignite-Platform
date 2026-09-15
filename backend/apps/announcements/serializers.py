from rest_framework import serializers

from . import audience
from .models import Announcement, AnnouncementAudienceGrant, AnnouncementRead


class AnnouncementListSerializer(serializers.ModelSerializer):
    sender_name = serializers.CharField(source='sender.get_full_name', read_only=True)
    sender_role = serializers.CharField(source='sender.role', read_only=True)
    sender_avatar = serializers.SerializerMethodField()
    is_read = serializers.SerializerMethodField()
    target_display = serializers.CharField(source='get_target_display', read_only=True)
    target_school_name = serializers.CharField(source='target_school.name', read_only=True, default=None)
    content = serializers.CharField(read_only=True)
    can_manage = serializers.SerializerMethodField()
    scope = serializers.SerializerMethodField()

    class Meta:
        model = Announcement
        fields = ['id', 'title', 'content', 'sender', 'sender_name', 'sender_role', 'sender_avatar',
                  'target', 'target_display', 'target_school', 'target_school_name', 'scope',
                  'is_pinned', 'created_at', 'is_read', 'view_count', 'can_manage']

    def get_sender_avatar(self, obj):
        return obj.sender.avatar or None

    def get_can_manage(self, obj):
        request = self.context.get('request')
        return audience.can_manage_announcement(getattr(request, 'user', None), obj)

    def get_scope(self, obj):
        return 'platform' if obj.school_id is None else 'school'

    def get_is_read(self, obj):
        request = self.context.get('request')
        if request and request.user:
            return AnnouncementRead.objects.filter(announcement=obj, user=request.user).exists()
        return False


class AnnouncementDetailSerializer(AnnouncementListSerializer):
    class Meta(AnnouncementListSerializer.Meta):
        fields = AnnouncementListSerializer.Meta.fields + ['target_user', 'expires_at', 'attachment']


class AnnouncementCreateSerializer(serializers.ModelSerializer):
    """Create and edit. Every audience rule is enforced here, not in the
    client: the target must be one ``audience.allowed_targets_for`` offers
    this sender, and school or recipient fields must match that target."""

    target = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = Announcement
        fields = ['title', 'content', 'target', 'target_user', 'target_school', 'is_pinned',
                  'expires_at', 'attachment']

    def validate(self, data):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            raise serializers.ValidationError('User is required.')

        allowed = audience.allowed_targets_for(user)
        if not allowed:
            raise serializers.ValidationError('Your role cannot publish announcements.')

        instance = self.instance
        target = (data.get('target') or '').strip().upper()
        if not target:
            if instance is not None:
                target = instance.target
            elif audience.is_platform_sender(user):
                # Executives who may only reach other executives never see an
                # audience picker; their announcements are executive-only.
                target = audience.EXECUTIVE
            else:
                raise serializers.ValidationError({'target': 'Choose who should receive this announcement.'})

        target_changed = instance is None or target != instance.target
        if target_changed and target not in allowed:
            raise serializers.ValidationError({
                'target': 'You are not allowed to send announcements to this audience.',
            })
        data['target'] = target

        target_school = data.get('target_school', getattr(instance, 'target_school', None))
        if target_school is not None:
            if target != audience.PARENT or not audience.can_choose_target_school(user):
                raise serializers.ValidationError({
                    'target_school': 'A school can only be chosen for a platform parent announcement.',
                })

        target_user = data.get('target_user', getattr(instance, 'target_user', None))
        if target == 'PERSONAL':
            if target_user is None:
                raise serializers.ValidationError({'target_user': 'Choose the person to message.'})
            if target_user.school_id != user.school_id:
                raise serializers.ValidationError({'target_user': 'You can only message people in your own school.'})
        elif target_user is not None:
            data['target_user'] = None

        return data

    def create(self, validated_data):
        user = self.context['request'].user
        validated_data['sender'] = user
        # Platform announcements never belong to a school, even if an
        # executive's account happens to carry one.
        validated_data['school'] = None if audience.is_platform_sender(user) else user.school
        return super().create(validated_data)


class AnnouncementReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = AnnouncementRead
        fields = ['id', 'announcement', 'user', 'read_at']


class AnnouncementAudienceGrantSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.name', read_only=True)
    user_role = serializers.CharField(source='user.role', read_only=True)
    granted_by_name = serializers.CharField(source='granted_by.name', read_only=True, default=None)

    class Meta:
        model = AnnouncementAudienceGrant
        fields = ['id', 'user', 'user_name', 'user_role', 'audience', 'granted_by', 'granted_by_name', 'created_at']
        read_only_fields = ['id', 'granted_by', 'created_at']

    def validate_user(self, value):
        role = (value.role or '').upper()
        if role == 'CEO':
            raise serializers.ValidationError('The CEO already has every audience.')
        if role not in audience.EXECUTIVE_ROLES:
            raise serializers.ValidationError('Audience grants are only for EduIgnite executives.')
        return value
