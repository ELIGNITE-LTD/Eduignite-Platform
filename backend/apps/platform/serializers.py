from rest_framework import serializers
from drf_spectacular.utils import extend_schema_serializer, OpenApiExample
from .models import PlatformSettings, PlatformFees, PublicEvent, PublicEventComment, TutorialLink


def normalize_tutorial_links(value):
    """Normalize legacy or platform-specific tutorial links to the shared {web, mobile} shape."""
    if not isinstance(value, dict):
        return {}

    normalized = {}
    for role, entry in value.items():
        role_key = str(role).strip()
        if not role_key:
            continue

        if isinstance(entry, str):
            link = entry.strip()
            normalized[role_key] = {
                'web': link,
                'mobile': link,
            }
            continue

        if not isinstance(entry, dict):
            normalized[role_key] = {'web': '', 'mobile': ''}
            continue

        fallback = str(entry.get('url') or '').strip()
        web = str(entry.get('web') or fallback or '').strip()
        mobile = str(entry.get('mobile') or fallback or '').strip()

        normalized[role_key] = {
            'web': web,
            'mobile': mobile,
        }

    return normalized


@extend_schema_serializer(
    examples=[
        OpenApiExample(
            'Platform Settings',
            value={
                'name': 'EduIgnite',
                'logo': 'https://example.com/logo.png',
                'payment_deadline': '2025-12-31',
                'honour_roll_threshold': '12.00',
                'maintenance_mode': False,
                'contact_email': 'eduignitecmr@gmail.com',
                'contact_phone': '+237670123456',
                'fees': {
                    'STUDENT': 5000,
                    'TEACHER': 10000,
                },
                'tutorial_links': {
                    'STUDENT': {
                        'web': 'https://tutorials.eduignite.com/web/student',
                        'mobile': 'https://tutorials.eduignite.com/mobile/student',
                    },
                    'TEACHER': {
                        'web': 'https://tutorials.eduignite.com/web/teacher',
                        'mobile': 'https://tutorials.eduignite.com/mobile/teacher',
                    },
                },
            },
        ),
    ]
)
class PlatformSettingsSerializer(serializers.ModelSerializer):
    """Serializer for platform settings."""

    tutorial_links = serializers.JSONField(required=False)

    def to_internal_value(self, data):
        if hasattr(data, 'copy'):
            mutable_data = data.copy()
        else:
            mutable_data = dict(data)

        if 'tutorialLinks' in mutable_data:
            if 'tutorial_links' not in mutable_data:
                mutable_data['tutorial_links'] = mutable_data.get('tutorialLinks')
            mutable_data.pop('tutorialLinks', None)

        return super().to_internal_value(mutable_data)

    def validate_tutorial_links(self, value):
        return normalize_tutorial_links(value)

    def to_representation(self, instance):
        representation = super().to_representation(instance)
        representation['tutorial_links'] = normalize_tutorial_links(
            representation.get('tutorial_links')
        )
        return representation

    class Meta:
        model = PlatformSettings
        fields = [
            'name',
            'logo',
            'payment_deadline',
            'honour_roll_threshold',
            'fees',
            'tutorial_links',
            'maintenance_mode',
            'contact_email',
            'contact_phone',
        ]


@extend_schema_serializer(
    examples=[
        OpenApiExample(
            'Platform Fee',
            value={
                'id': 1,
                'role': 'STUDENT',
                'amount': '5000.00',
                'currency': 'XAF',
            },
        ),
    ]
)
class PlatformFeesSerializer(serializers.ModelSerializer):
    """Serializer for platform fees."""

    role_display = serializers.CharField(source='get_role_display', read_only=True)

    class Meta:
        model = PlatformFees
        fields = [
            'id',
            'role',
            'role_display',
            'amount',
            'currency',
        ]


@extend_schema_serializer(
    examples=[
        OpenApiExample(
            'Public Event',
            value={
                'id': 1,
                'type': 'video',
                'title': 'Back to School 2024',
                'description': 'Our new school year campaign',
                'url': 'https://youtube.com/watch?v=example',
                'is_active': True,
                'order': 1,
                'created_at': '2024-01-15T10:30:00Z',
            },
        ),
    ]
)
class PublicEventCommentSerializer(serializers.ModelSerializer):
    author = serializers.SerializerMethodField()

    class Meta:
        model = PublicEventComment
        fields = ['id', 'author', 'content', 'is_approved', 'created_at']
        read_only_fields = ['id', 'author', 'is_approved', 'created_at']

    def get_author(self, obj):
        return {
            'id': str(obj.author_id),
            'name': obj.author.get_full_name() or obj.author.email,
            'avatar': obj.author.avatar,
            'role': obj.author.role,
        }


class PublicEventSerializer(serializers.ModelSerializer):
    """Serializer for public events."""

    type_display = serializers.CharField(source='get_type_display', read_only=True)
    url = serializers.CharField()
    like_count = serializers.SerializerMethodField()
    comment_count = serializers.SerializerMethodField()
    liked_by_me = serializers.SerializerMethodField()
    comments = serializers.SerializerMethodField()

    class Meta:
        model = PublicEvent
        fields = [
            'id',
            'type',
            'type_display',
            'title',
            'description',
            'url',
            'is_active',
            'order',
            'created_at',
            'updated_at',
            'like_count',
            'comment_count',
            'liked_by_me',
            'comments',
        ]

    def get_like_count(self, obj):
        return obj.likes.count()

    def get_comment_count(self, obj):
        return obj.comments.filter(is_approved=True).count()

    def get_liked_by_me(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return False
        return obj.likes.filter(user=request.user).exists()

    def get_comments(self, obj):
        return PublicEventCommentSerializer(obj.comments.filter(is_approved=True).select_related('author')[:20], many=True).data

    def validate_url(self, value):
        value = (value or '').strip()
        if not value:
            raise serializers.ValidationError('Media URL is required.')
        if value.startswith('http://') or value.startswith('https://'):
            return value
        if value.startswith('data:image/') or value.startswith('data:video/'):
            return value
        raise serializers.ValidationError('Use an HTTPS media URL or upload a valid image/video file.')

    def validate(self, attrs):
        media_type = attrs.get('type') or getattr(self.instance, 'type', None)
        url = attrs.get('url') or getattr(self.instance, 'url', '')
        if media_type == 'image' and str(url).startswith('data:video/'):
            raise serializers.ValidationError({'url': 'Uploaded media does not match the selected image type.'})
        if media_type == 'video' and str(url).startswith('data:image/'):
            raise serializers.ValidationError({'url': 'Uploaded media does not match the selected video type.'})
        return attrs


@extend_schema_serializer(
    examples=[
        OpenApiExample(
            'Tutorial Link',
            value={
                'id': 1,
                'role': 'STUDENT',
                'url': 'https://tutorials.eduignite.com/student/getting-started',
                'title': 'Getting Started as a Student',
            },
        ),
    ]
)
class TutorialLinkSerializer(serializers.ModelSerializer):
    """Serializer for tutorial links."""

    class Meta:
        model = TutorialLink
        fields = [
            'id',
            'role',
            'url',
            'title',
        ]
