from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.filters import SearchFilter, OrderingFilter
from rest_framework.pagination import PageNumberPagination
from django.db.models import Count, Q
from django.utils import timezone
from .models import Testimony, CommunityBlog, BlogComment, BlogLike
from .permissions import IsPostOwnerOrFounder
from .serializers import (
    TestimonySerializer, TestimonyCreateSerializer,
    CommunityBlogListSerializer, CommunityBlogDetailSerializer,
    CommunityBlogCreateSerializer, BlogCommentSerializer
)
from apps.registry.permissions import RequiresApp
from apps.users.executive_access import executive_module_required, user_has_any_module


# Testimony moderation belongs to the Testimonials module; the Community Portal
# page also moderates them. Blog / log-post management belongs to the Log posts
# module, and the Community Portal page manages blogs too.
TESTIMONY_MODULES = ('testimonials', 'community')
BLOG_MODULES = ('log_post', 'community')


def can_moderate_testimonies(user):
    return user_has_any_module(user, TESTIMONY_MODULES)


def can_manage_blogs(user):
    return user_has_any_module(user, BLOG_MODULES)


class TestimonyPagination(PageNumberPagination):
    page_size = 12
    page_size_query_param = 'page_size'
    max_page_size = 48


class TestimonyViewSet(viewsets.ModelViewSet):
    pagination_class = TestimonyPagination
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ['school_name', 'message']
    ordering_fields = ['created_at']
    ordering = ['-created_at']

    def get_serializer_class(self):
        if self.action == 'create':
            return TestimonyCreateSerializer
        return TestimonySerializer

    def get_permissions(self):
        if self.action == 'list':
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated(), RequiresApp('community')()]

    def get_queryset(self):
        user = self.request.user
        status_param = self.request.query_params.get('status')
        queryset = Testimony.objects.select_related('user', 'approved_by')
        if can_moderate_testimonies(user):
            if status_param:
                queryset = queryset.filter(status=status_param)
            return queryset
        if status_param and status_param != 'approved':
            return queryset.none()
        return queryset.filter(status='approved')

    def check_permissions(self, request):
        if self.action in ['update', 'partial_update', 'destroy']:
            if not can_moderate_testimonies(request.user):
                self.permission_denied(request)
        return super().check_permissions(request)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve a testimony (executive only)"""
        if not can_moderate_testimonies(request.user):
            return Response({'detail': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)

        testimony = self.get_object()
        testimony.status = 'approved'
        testimony.approved_by = request.user
        testimony.approved_at = timezone.now()
        testimony.save()

        return Response({'status': 'testimony approved'})

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Reject a testimony (executive only)"""
        if not can_moderate_testimonies(request.user):
            return Response({'detail': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)

        testimony = self.get_object()
        testimony.status = 'rejected'
        testimony.approved_by = request.user
        testimony.approved_at = timezone.now()
        testimony.save()

        return Response({'status': 'testimony rejected'})

    @action(detail=False, methods=['get'])
    def pending(self, request):
        """Get pending testimonies (executive only)"""
        if not can_moderate_testimonies(request.user):
            return Response({'detail': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)

        testimonies = Testimony.objects.filter(status='pending')
        serializer = TestimonySerializer(testimonies, many=True)
        return Response(serializer.data)


class CommunityBlogViewSet(viewsets.ModelViewSet):
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ['title', 'paragraphs']
    ordering_fields = ['created_at', 'view_count', 'published_at']
    ordering = ['-published_at', '-created_at']

    def get_permissions(self):
        if self.action in ['list', 'retrieve', 'view']:
            return [permissions.AllowAny()]
        guard = RequiresApp('community')()
        # An executive needs the Log posts / Community Portal module to write;
        # school-level users are judged by the same rules as before.
        module_gate = executive_module_required('log_post', also=('community',), allow_non_executives=True)()
        if self.action in ['update', 'partial_update', 'destroy']:
            return [permissions.IsAuthenticated(), module_gate, IsPostOwnerOrFounder(), guard]
        if self.action in ['create', 'publish']:
            return [permissions.IsAuthenticated(), module_gate, guard]
        return [permissions.IsAuthenticated(), guard]

    def get_serializer_class(self):
        if self.action == 'create':
            return CommunityBlogCreateSerializer
        elif self.action == 'retrieve' or self.action == 'view':
            return CommunityBlogDetailSerializer
        return CommunityBlogListSerializer

    def get_queryset(self):
        user = self.request.user
        queryset = CommunityBlog.objects.select_related('author').prefetch_related('comments__author').annotate(
            like_count=Count('likes', distinct=True),
            comment_count=Count('comments', filter=Q(comments__is_approved=True), distinct=True),
        )
        if can_manage_blogs(user):
            return queryset
        elif getattr(user, 'is_authenticated', False):
            # Use Q objects — queryset union (|) breaks get_object() filtering
            return queryset.filter(
                Q(is_published=True) | Q(author=user)
            )
        else:
            return queryset.filter(is_published=True)

    def perform_create(self, serializer):
        publish_kwargs = {}
        if can_manage_blogs(self.request.user):
            publish_kwargs = {
                'is_published': True,
                'published_at': timezone.now(),
            }
        serializer.save(author=self.request.user, **publish_kwargs)

    def create(self, request, *args, **kwargs):
        """Create a strategic log and return the full saved record."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        detail_serializer = CommunityBlogDetailSerializer(serializer.instance, context={'request': request})
        return Response(detail_serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def publish(self, request, pk=None):
        """Publish a blog (executive only)"""
        if not can_manage_blogs(request.user):
            return Response({'detail': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)

        blog = self.get_object()
        blog.is_published = True
        blog.published_at = timezone.now()
        blog.save()

        serializer = CommunityBlogDetailSerializer(blog, context={'request': request})
        return Response(serializer.data)

    @action(detail=True, methods=['get', 'post'])
    def view(self, request, pk=None):
        """View a blog and increment view count"""
        blog = self.get_object()
        blog.view_count += 1
        blog.save(update_fields=['view_count'])

        serializer = CommunityBlogDetailSerializer(blog, context={'request': request})
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def like(self, request, pk=None):
        blog = self.get_object()
        BlogLike.objects.get_or_create(blog=blog, user=request.user)
        serializer = CommunityBlogDetailSerializer(blog, context={'request': request})
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def unlike(self, request, pk=None):
        blog = self.get_object()
        BlogLike.objects.filter(blog=blog, user=request.user).delete()
        serializer = CommunityBlogDetailSerializer(blog, context={'request': request})
        return Response(serializer.data)


class BlogCommentViewSet(viewsets.ModelViewSet):
    serializer_class = BlogCommentSerializer
    filter_backends = [OrderingFilter]
    ordering_fields = ['created_at']
    ordering = ['created_at']

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated(), RequiresApp('community')()]

    def get_queryset(self):
        queryset = BlogComment.objects.select_related('blog', 'author').filter(is_approved=True)
        blog_id = self.request.query_params.get('blog')
        if blog_id:
            queryset = queryset.filter(blog_id=blog_id)
        return queryset

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)

    def check_permissions(self, request):
        if self.action in ['update', 'partial_update', 'destroy']:
            if not can_manage_blogs(request.user):
                self.permission_denied(request)
        return super().check_permissions(request)
