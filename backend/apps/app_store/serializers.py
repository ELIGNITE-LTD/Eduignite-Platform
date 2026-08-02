from rest_framework import serializers

from .models import AppStoreItem


class AppStoreItemSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.name', read_only=True)
    name = serializers.CharField(source='title', required=False)
    description = serializers.CharField(source='short_description', required=False)
    download_url = serializers.URLField(source='download_link', required=False, allow_blank=True)
    is_published = serializers.BooleanField(source='active', required=False)
    uploaded_by = serializers.UUIDField(source='created_by_id', read_only=True)
    icon_url = serializers.SerializerMethodField()
    thumbnail_url = serializers.SerializerMethodField()
    apk_file_url = serializers.SerializerMethodField()
    created_at = serializers.DateTimeField(source='created', read_only=True)
    updated_at = serializers.DateTimeField(source='modified', read_only=True)

    class Meta:
        model = AppStoreItem
        fields = [
            'id', 'title', 'name', 'category', 'short_description', 'description', 'full_description',
            'icon', 'icon_url', 'thumbnail', 'thumbnail_url', 'screenshots',
            'download_link', 'download_url', 'apk_file', 'apk_file_url', 'youtube_video_link',
            'version', 'rating', 'featured', 'active', 'is_published', 'archived',
            'created_by', 'uploaded_by', 'created_by_name', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'created_by', 'uploaded_by', 'created_at', 'updated_at',
            'icon_url', 'thumbnail_url', 'apk_file_url',
        ]

    def validate(self, attrs):
        download_link = attrs.get('download_link') or getattr(self.instance, 'download_link', '')
        apk_file = attrs.get('apk_file') or getattr(self.instance, 'apk_file', None)
        if not download_link and not apk_file:
            raise serializers.ValidationError({'download_url': 'Provide a download URL or upload an APK/package file.'})
        return attrs

    def validate_screenshots(self, value):
        if value in [None, '']:
            return []
        if isinstance(value, str):
            # A single base64 data URL contains commas, so only treat commas as a
            # separator for plain comma-separated URL lists.
            if value.strip().lower().startswith('data:'):
                return [value.strip()]
            return [item.strip() for item in value.split(',') if item.strip()]
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
        raise serializers.ValidationError('Screenshots must be a list of URLs or uploaded image references.')

    def get_icon_url(self, obj):
        return self._absolute_file_url(obj.icon)

    def get_thumbnail_url(self, obj):
        return self._absolute_file_url(obj.thumbnail)

    def get_apk_file_url(self, obj):
        return self._absolute_file_url(obj.apk_file)

    def _absolute_file_url(self, field_file):
        if not field_file:
            return ''
        url = field_file.url
        request = self.context.get('request')
        return request.build_absolute_uri(url) if request else url


class AppStoreItemPublicSerializer(AppStoreItemSerializer):
    class Meta(AppStoreItemSerializer.Meta):
        fields = [
            'id', 'title', 'name', 'category', 'short_description', 'description', 'full_description',
            'icon_url', 'thumbnail_url', 'screenshots', 'download_link',
            'download_url', 'apk_file_url', 'youtube_video_link', 'version', 'rating',
            'featured', 'active', 'is_published', 'created_at', 'updated_at',
        ]
