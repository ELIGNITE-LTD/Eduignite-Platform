from rest_framework import serializers
from rest_framework.exceptions import ValidationError

from apps.schools import public_site_services as site_svc
from apps.schools.models import SchoolEvent

from . import services
from .models import AlbumCategory, EventCategory, PublicAlbum, PublicEvent, PublicMedia


def file_url(f):
    return f.url if f else None


class _Strict(serializers.ModelSerializer):
    """Reject fields that are not editable here instead of silently ignoring them."""

    def to_internal_value(self, data):
        unknown = set(data) - set(self.fields) - {'school'}
        if unknown:
            raise ValidationError({k: 'This field cannot be edited here.' for k in sorted(unknown)})
        return super().to_internal_value(data)


class EventSerializer(_Strict):
    cover_url = serializers.SerializerMethodField()
    bucket = serializers.SerializerMethodField()
    linked_event = serializers.PrimaryKeyRelatedField(
        queryset=SchoolEvent.objects.all(), required=False, allow_null=True)

    class Meta:
        model = PublicEvent
        fields = [
            'id', 'slug', 'title_en', 'title_fr', 'description_en', 'description_fr', 'start_at', 'end_at',
            'location', 'category', 'cover_url', 'status', 'published_at', 'bucket', 'linked_event',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'slug', 'status', 'published_at', 'created_at', 'updated_at']

    def get_cover_url(self, obj):
        return file_url(obj.cover_image)

    def get_bucket(self, obj):
        return services.event_bucket(obj)

    def validate_linked_event(self, value):
        school = self.context['school']
        if value is not None and value.school_id != school.id:
            raise ValidationError('That event belongs to another school.')
        return value

    def validate(self, attrs):
        for name in ('title_en', 'title_fr', 'location'):
            if name in attrs:
                attrs[name] = site_svc.clean_text(attrs[name])
        for name in ('description_en', 'description_fr'):
            if name in attrs:
                attrs[name] = site_svc.clean_text(attrs[name])
                if len(attrs[name]) > 5000:
                    raise ValidationError({name: 'Maximum 5000 characters.'})
        inst = self.instance
        start = attrs.get('start_at', inst.start_at if inst else None)
        end = attrs.get('end_at', inst.end_at if inst else None)
        if start is None:
            raise ValidationError({'start_at': 'The start date is required.'})
        if end is not None and end < start:
            raise ValidationError({'end_at': 'The end must not be before the start.'})
        title_en = attrs.get('title_en', inst.title_en if inst else '')
        title_fr = attrs.get('title_fr', inst.title_fr if inst else '')
        if not (title_en or title_fr):
            raise ValidationError({'title_en': 'Enter a title in English or French.'})
        return attrs


class AlbumSerializer(_Strict):
    cover_url = serializers.SerializerMethodField()
    cover_thumb_url = serializers.SerializerMethodField()
    media_count = serializers.SerializerMethodField()

    class Meta:
        model = PublicAlbum
        fields = [
            'id', 'title_en', 'title_fr', 'category', 'order', 'status', 'published_at', 'cover_url',
            'cover_thumb_url', 'media_count', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'order', 'status', 'published_at', 'created_at', 'updated_at']

    def get_cover_url(self, obj):
        return file_url(obj.cover.image) if obj.cover_id else None

    def get_cover_thumb_url(self, obj):
        return file_url(obj.cover.thumbnail) if obj.cover_id else None

    def get_media_count(self, obj):
        annotated = getattr(obj, 'n', None)
        return annotated if annotated is not None else obj.media.count()

    def validate(self, attrs):
        for name in ('title_en', 'title_fr'):
            if name in attrs:
                attrs[name] = site_svc.clean_text(attrs[name])
        inst = self.instance
        if not (attrs.get('title_en', inst.title_en if inst else '') or attrs.get('title_fr', inst.title_fr if inst else '')):
            raise ValidationError({'title_en': 'Enter a title in English or French.'})
        return attrs


class MediaSerializer(_Strict):
    url = serializers.SerializerMethodField()
    thumb_url = serializers.SerializerMethodField()

    class Meta:
        model = PublicMedia
        fields = [
            'id', 'album', 'url', 'thumb_url', 'width', 'height', 'caption_en', 'caption_fr', 'alt_en',
            'alt_fr', 'order', 'created_at',
        ]
        read_only_fields = ['id', 'album', 'width', 'height', 'order', 'created_at']

    def get_url(self, obj):
        return file_url(obj.image)

    def get_thumb_url(self, obj):
        return file_url(obj.thumbnail) or file_url(obj.image)

    def validate(self, attrs):
        limits = {'caption_en': 300, 'caption_fr': 300, 'alt_en': 200, 'alt_fr': 200}
        for name, cap in limits.items():
            if name in attrs:
                attrs[name] = site_svc.clean_text(attrs[name])[:cap]
        return attrs


# The choices are re-exported for the UI.
CHOICES = {
    'event_categories': [c for c, _ in EventCategory.choices],
    'album_categories': [c for c, _ in AlbumCategory.choices],
}
