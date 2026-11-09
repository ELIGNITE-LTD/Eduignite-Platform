"""Management API for a school's public events and gallery.

Always scoped to one school on the server (see permissions.target_school); an
object from another school answers 404 so its existence is not revealed.
"""

from django.db import transaction
from django.db.models import Count
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import status as http
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.schools import public_site_services as site_svc

from . import services
from .models import PublicAlbum, PublicEvent, PublicMedia
from .permissions import IsPublicSiteManager, target_school
from .serializers import AlbumSerializer, EventSerializer, MediaSerializer

TAG = ['Public site']


def _audit(school, request, action, **fields):
    site_svc.write_audit(school, request, action, {k: {'before': '', 'after': str(v)[:120]} for k, v in fields.items()})


def _upload_error(exc):
    return Response({'detail': str(exc), 'errors': {'image': str(exc)}}, status=http.HTTP_400_BAD_REQUEST)


class _Base(APIView):
    permission_classes = [IsPublicSiteManager]
    parser_classes = [JSONParser, MultiPartParser, FormParser]


# ---- events -----------------------------------------------------------------

class EventListCreateView(_Base):
    @extend_schema(tags=TAG, description="The school's public events (drafts included).")
    def get(self, request):
        school = target_school(request)
        qs = PublicEvent.objects.filter(school=school)
        wanted = request.query_params.get('status')
        if wanted in ('draft', 'published'):
            qs = qs.filter(status=wanted)
        return Response({
            'results': EventSerializer(qs, many=True, context={'school': school}).data,
            'quota': {'used': services.image_count(school), 'limit': services.IMAGE_QUOTA_PER_SCHOOL},
        })

    @extend_schema(tags=TAG, description='Create a draft public event.')
    def post(self, request):
        school = target_school(request)
        body = {k: v for k, v in request.data.items() if k != 'school'}
        serializer = EventSerializer(data=body, context={'school': school})
        serializer.is_valid(raise_exception=True)
        title = serializer.validated_data.get('title_en') or serializer.validated_data.get('title_fr')
        event = serializer.save(
            school=school, slug=services.unique_event_slug(school, title),
            created_by=request.user if request.user.is_authenticated else None)
        _audit(school, request, 'event_created', event=event)
        return Response(EventSerializer(event, context={'school': school}).data, status=http.HTTP_201_CREATED)


class _EventObject(_Base):
    def event(self, request, pk):
        school = target_school(request)
        return school, get_object_or_404(PublicEvent, pk=pk, school=school)


class EventDetailView(_EventObject):
    @extend_schema(tags=TAG)
    def get(self, request, pk):
        school, event = self.event(request, pk)
        return Response(EventSerializer(event, context={'school': school}).data)

    @extend_schema(tags=TAG)
    def patch(self, request, pk):
        school, event = self.event(request, pk)
        body = {k: v for k, v in request.data.items() if k != 'school'}
        serializer = EventSerializer(event, data=body, partial=True, context={'school': school})
        serializer.is_valid(raise_exception=True)
        event = serializer.save()
        _audit(school, request, 'event_updated', event=event)
        return Response(EventSerializer(event, context={'school': school}).data)

    @extend_schema(tags=TAG)
    def delete(self, request, pk):
        school, event = self.event(request, pk)
        _audit(school, request, 'event_deleted', event=event)
        event.delete()
        return Response(status=http.HTTP_204_NO_CONTENT)


class EventPublishView(_EventObject):
    unpublish = False

    @extend_schema(tags=TAG)
    def post(self, request, pk):
        school, event = self.event(request, pk)
        if self.unpublish:
            services.unpublish(event, request, 'event')
        else:
            errors = services.publish(event, request, 'event')
            if errors:
                return Response({'detail': 'This event cannot be published yet.', 'errors': errors},
                                status=http.HTTP_400_BAD_REQUEST)
        return Response(EventSerializer(event, context={'school': school}).data)


class EventCoverView(_EventObject):
    @extend_schema(tags=TAG, description='Upload (multipart field "image") or replace the event cover.')
    def post(self, request, pk):
        school, event = self.event(request, pk)
        try:
            services.set_event_cover(event, request.FILES.get('image'))
        except (services.ImageRejected, services.QuotaExceeded) as exc:
            return _upload_error(exc)
        _audit(school, request, 'event_cover_changed', event=event)
        return Response(EventSerializer(event, context={'school': school}).data)

    @extend_schema(tags=TAG)
    def delete(self, request, pk):
        school, event = self.event(request, pk)
        services.clear_event_cover(event)
        return Response(EventSerializer(event, context={'school': school}).data)


# ---- albums -----------------------------------------------------------------

class AlbumListCreateView(_Base):
    @extend_schema(tags=TAG, description="The school's gallery albums (drafts included).")
    def get(self, request):
        school = target_school(request)
        qs = PublicAlbum.objects.filter(school=school).select_related('cover').annotate(n=Count('media'))
        return Response({
            'results': AlbumSerializer(qs, many=True).data,
            'quota': {'used': services.image_count(school), 'limit': services.IMAGE_QUOTA_PER_SCHOOL},
        })

    @extend_schema(tags=TAG)
    def post(self, request):
        school = target_school(request)
        body = {k: v for k, v in request.data.items() if k != 'school'}
        serializer = AlbumSerializer(data=body)
        serializer.is_valid(raise_exception=True)
        last = PublicAlbum.objects.filter(school=school).order_by('-order').values_list('order', flat=True).first()
        album = serializer.save(
            school=school, order=(last + 1) if last is not None else 0,
            created_by=request.user if request.user.is_authenticated else None)
        _audit(school, request, 'album_created', album=album)
        return Response(AlbumSerializer(album).data, status=http.HTTP_201_CREATED)


class _AlbumObject(_Base):
    def album(self, request, pk):
        school = target_school(request)
        return school, get_object_or_404(PublicAlbum.objects.select_related('cover'), pk=pk, school=school)


class AlbumDetailView(_AlbumObject):
    @extend_schema(tags=TAG)
    def get(self, request, pk):
        school, album = self.album(request, pk)
        return Response(AlbumSerializer(album).data)

    @extend_schema(tags=TAG)
    def patch(self, request, pk):
        school, album = self.album(request, pk)
        body = {k: v for k, v in request.data.items() if k != 'school'}
        serializer = AlbumSerializer(album, data=body, partial=True)
        serializer.is_valid(raise_exception=True)
        album = serializer.save()
        _audit(school, request, 'album_updated', album=album)
        return Response(AlbumSerializer(album).data)

    @extend_schema(tags=TAG)
    def delete(self, request, pk):
        school, album = self.album(request, pk)
        _audit(school, request, 'album_deleted', album=album)
        with transaction.atomic():
            for media in list(album.media.all()):
                media.delete()  # row delete also removes the files
            album.delete()
        return Response(status=http.HTTP_204_NO_CONTENT)


class AlbumPublishView(_AlbumObject):
    unpublish = False

    @extend_schema(tags=TAG)
    def post(self, request, pk):
        school, album = self.album(request, pk)
        if self.unpublish:
            services.unpublish(album, request, 'album')
        else:
            errors = services.publish(album, request, 'album')
            if errors:
                return Response({'detail': 'This album cannot be published yet.', 'errors': errors},
                                status=http.HTTP_400_BAD_REQUEST)
        return Response(AlbumSerializer(album).data)


class AlbumReorderView(_Base):
    @extend_schema(tags=TAG, description='Body {"ids": [album ids in the new order]} (all albums of the school).')
    def post(self, request):
        school = target_school(request)
        ids = request.data.get('ids')
        if not isinstance(ids, list) or not services.reorder_albums(school, ids):
            return Response({'detail': 'Provide every album id exactly once.'}, status=http.HTTP_400_BAD_REQUEST)
        return Response({'ok': True})


class AlbumCoverView(_AlbumObject):
    @extend_schema(tags=TAG, description='Body {"media_id": ...}: pick the album cover.')
    def post(self, request, pk):
        school, album = self.album(request, pk)
        if not services.set_album_cover(album, request.data.get('media_id')):
            return Response({'detail': 'That image is not in this album.'}, status=http.HTTP_400_BAD_REQUEST)
        album.refresh_from_db()
        return Response(AlbumSerializer(album).data)


# ---- media ------------------------------------------------------------------

class MediaListCreateView(_AlbumObject):
    @extend_schema(tags=TAG)
    def get(self, request, pk):
        school, album = self.album(request, pk)
        return Response({'results': MediaSerializer(album.media.all(), many=True).data})

    @extend_schema(tags=TAG, description='Upload one image (multipart field "image") with optional captions.')
    def post(self, request, pk):
        school, album = self.album(request, pk)
        data = request.data
        try:
            media = services.add_media(
                album, request.FILES.get('image'), request.user,
                caption_en=data.get('caption_en', ''), caption_fr=data.get('caption_fr', ''),
                alt_en=data.get('alt_en', ''), alt_fr=data.get('alt_fr', ''))
        except (services.ImageRejected, services.QuotaExceeded) as exc:
            return _upload_error(exc)
        _audit(school, request, 'media_uploaded', album=album)
        return Response(MediaSerializer(media).data, status=http.HTTP_201_CREATED)


class MediaReorderView(_AlbumObject):
    @extend_schema(tags=TAG, description='Body {"ids": [media ids in the new order]} (all images of the album).')
    def post(self, request, pk):
        school, album = self.album(request, pk)
        ids = request.data.get('ids')
        if not isinstance(ids, list) or not services.reorder_media(album, ids):
            return Response({'detail': 'Provide every image id exactly once.'}, status=http.HTTP_400_BAD_REQUEST)
        return Response({'ok': True})


class MediaDetailView(_Base):
    def media(self, request, pk):
        school = target_school(request)
        return school, get_object_or_404(PublicMedia.objects.select_related('album'), pk=pk, school=school)

    @extend_schema(tags=TAG)
    def patch(self, request, pk):
        school, media = self.media(request, pk)
        body = {k: v for k, v in request.data.items() if k != 'school'}
        serializer = MediaSerializer(media, data=body, partial=True)
        serializer.is_valid(raise_exception=True)
        media = serializer.save()
        return Response(MediaSerializer(media).data)

    @extend_schema(tags=TAG)
    def delete(self, request, pk):
        school, media = self.media(request, pk)
        album = media.album
        _audit(school, request, 'media_deleted', album=album)
        media.delete()
        album.refresh_from_db()
        if album.cover_id is None:  # SET_NULL cleared the cover: fall back to the first image
            first = album.media.first()
            if first:
                album.cover = first
                album.save(update_fields=['cover', 'updated_at'])
        return Response(status=http.HTTP_204_NO_CONTENT)
