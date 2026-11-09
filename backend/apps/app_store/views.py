from django.db.models import Q
from rest_framework import permissions, viewsets, status
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from .models import AppStoreItem
from apps.users.executive_access import user_has_module

from .permissions import IsAppStoreManagerOrReadOnly
from .serializers import AppStoreItemPublicSerializer, AppStoreItemSerializer
from apps.registry.permissions import RequiresApp


class AppStoreItemViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAppStoreManagerOrReadOnly, RequiresApp('app_store')]
    serializer_class = AppStoreItemSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    queryset = AppStoreItem.objects.select_related('created_by')

    def get_queryset(self):
        user = self.request.user
        queryset = AppStoreItem.objects.select_related('created_by')
        if not (user_has_module(user, 'app_registry')):
            queryset = queryset.filter(active=True, archived=False)
        category = self.request.query_params.get('category')
        featured = self.request.query_params.get('featured')
        active = self.request.query_params.get('active')
        published = self.request.query_params.get('published')
        search = self.request.query_params.get('search')
        if published in ['true', 'false']:
            queryset = queryset.filter(active=published == 'true', archived=False)
        if category:
            queryset = queryset.filter(category=category)
        if featured in ['true', 'false']:
            queryset = queryset.filter(featured=featured == 'true')
        if active in ['true', 'false'] and user_has_module(user, 'app_registry'):
            queryset = queryset.filter(active=active == 'true')
        if search:
            queryset = queryset.filter(
                Q(title__icontains=search)
                | Q(short_description__icontains=search)
                | Q(full_description__icontains=search)
            )
        return queryset

    def get_serializer_class(self):
        user = self.request.user
        if self.action in ['list', 'retrieve'] and not (user_has_module(user, 'app_registry')):
            return AppStoreItemPublicSerializer
        return AppStoreItemSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def _payload_with_upload_lists(self, request):
        # Build a plain dict so list-valued fields (screenshots) survive intact.
        # Using request.data.copy() returned a QueryDict, where `.get('screenshots')`
        # only yields the last value and base64 data URLs (which contain commas) were
        # later split apart and corrupted. A plain dict keeps the full list.
        payload = {key: request.data.get(key) for key in request.data.keys()}
        for key in request.FILES.keys():
            payload[key] = request.FILES.get(key)

        screenshot_files = request.FILES.getlist('screenshots')
        if screenshot_files:
            import base64

            encoded_urls = []
            for file in screenshot_files:
                encoded = base64.b64encode(file.read()).decode('utf-8')
                encoded_urls.append(f'data:{file.content_type};base64,{encoded}')
            payload['screenshots'] = encoded_urls
        elif hasattr(request.data, 'getlist'):
            screenshot_values = request.data.getlist('screenshots')
            if len(screenshot_values) > 1:
                payload['screenshots'] = screenshot_values

        if payload.get('download_url') and not payload.get('download_link'):
            payload['download_link'] = payload.get('download_url')
        if 'is_published' in payload and 'active' not in payload:
            payload['active'] = payload.get('is_published')
        if 'name' in payload and 'title' not in payload:
            payload['title'] = payload.get('name')
        if 'description' in payload and 'short_description' not in payload:
            payload['short_description'] = payload.get('description')
        return payload

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=self._payload_with_upload_lists(request))
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=self._payload_with_upload_lists(request), partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def archive(self, request, pk=None):
        app = self.get_object()
        app.archived = True
        app.active = False
        app.save(update_fields=['archived', 'active', 'modified'])
        return Response(self.get_serializer(app).data)

    @action(detail=True, methods=['patch'])
    def publish(self, request, pk=None):
        app = self.get_object()
        desired = request.data.get('is_published', request.data.get('published'))
        if desired is None:
            app.active = not app.active
        else:
            app.active = str(desired).lower() in {'true', '1', 'yes', 'on'}
        if app.active:
            app.archived = False
        app.save(update_fields=['active', 'archived', 'modified'])
        return Response(self.get_serializer(app).data)

    @action(detail=True, methods=['post'])
    def feature(self, request, pk=None):
        app = self.get_object()
        app.featured = True
        app.save(update_fields=['featured', 'modified'])
        return Response(self.get_serializer(app).data)

    @action(detail=True, methods=['post'])
    def unfeature(self, request, pk=None):
        app = self.get_object()
        app.featured = False
        app.save(update_fields=['featured', 'modified'])
        return Response(self.get_serializer(app).data)

    @action(detail=False, methods=['get'], permission_classes=[permissions.AllowAny])
    def featured(self, request):
        queryset = self.filter_queryset(self.get_queryset().filter(featured=True, active=True, archived=False))
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = AppStoreItemPublicSerializer(page, many=True, context={'request': request})
            return self.get_paginated_response(serializer.data)
        serializer = AppStoreItemPublicSerializer(queryset, many=True, context={'request': request})
        return Response(serializer.data)
