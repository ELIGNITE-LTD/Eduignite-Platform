from django.contrib import admin

from .models import PublicAlbum, PublicEvent, PublicMedia


@admin.register(PublicEvent)
class PublicEventAdmin(admin.ModelAdmin):
    list_display = ('title_en', 'title_fr', 'school', 'start_at', 'status')
    list_filter = ('status', 'category')
    raw_id_fields = ('school', 'linked_event', 'created_by')


@admin.register(PublicAlbum)
class PublicAlbumAdmin(admin.ModelAdmin):
    list_display = ('title_en', 'title_fr', 'school', 'category', 'status', 'order')
    list_filter = ('status', 'category')
    raw_id_fields = ('school', 'cover', 'created_by')


@admin.register(PublicMedia)
class PublicMediaAdmin(admin.ModelAdmin):
    list_display = ('id', 'school', 'album', 'size_bytes', 'created_at')
    raw_id_fields = ('school', 'album', 'uploaded_by')
