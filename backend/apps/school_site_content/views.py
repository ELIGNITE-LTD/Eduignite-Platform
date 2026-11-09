"""Management API (school administrators; executives with the school_websites module).

Everything is scoped to ONE school resolved by the shared public-site manager
view (``target_school``): a school admin only reaches their own school, an
executive must name the school. Objects are always looked up inside that school,
so another school's id is a 404, never a leak.
"""

from django.core.exceptions import ObjectDoesNotExist, ValidationError as DjangoValidationError
from django.http import Http404
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.schools.public_site_views import _ManagerView

from . import services as svc
from .models import SchoolPostCategory


def _body(request):
    data = request.data
    return {k: v for k, v in data.items() if k != 'school'} if hasattr(data, 'items') else {}


def post_payload(post, with_body=True):
    data = {
        'id': str(post.pk), 'slug': post.slug, 'status': post.status,
        'title_en': post.title_en, 'title_fr': post.title_fr,
        'excerpt_en': post.excerpt_en, 'excerpt_fr': post.excerpt_fr,
        'category': str(post.category_id) if post.category_id else None,
        'cover_image': str(post.cover_image_id) if post.cover_image_id else None,
        'cover_url': svc.image_url(post.cover_image),
        'published_at': post.published_at, 'author_name': post.author_name,
        'seo_title_en': post.seo_title_en, 'seo_title_fr': post.seo_title_fr,
        'seo_description_en': post.seo_description_en, 'seo_description_fr': post.seo_description_fr,
        'preview_token': post.preview_token,
        'created_at': post.created_at, 'updated_at': post.updated_at,
        'publish_blockers': svc.publish_errors(post) if post.status != 'published' else {},
    }
    if with_body:
        data.update({'body_en': post.body_en, 'body_fr': post.body_fr})
    return data


def category_payload(category):
    return {'id': str(category.pk), 'slug': category.slug, 'name_en': category.name_en,
            'name_fr': category.name_fr, 'order': category.order, 'post_count': category.posts.count()}


def leader_payload(leader):
    user = leader.user
    return {
        'id': str(leader.pk), 'user': str(user.pk), 'name': user.name, 'role': user.role,
        'role_label': user.display_role, 'has_photo': bool(user.avatar),
        'public_title_en': leader.public_title_en, 'public_title_fr': leader.public_title_fr,
        'role_category': leader.role_category, 'order': leader.order, 'show_photo': leader.show_photo,
        'bio_en': leader.bio_en, 'bio_fr': leader.bio_fr, 'is_visible': leader.is_visible,
        # What the website would show for the photo, honouring both switches.
        'photo': (user.avatar or None) if leader.show_photo else None,
    }


class PostListView(_ManagerView):
    """GET (list) / POST (create draft): /schools/public-site/blog/posts/"""

    @extend_schema(tags=['Public site blog'], description="List the school's articles (all statuses).")
    def get(self, request):
        school = self.target_school(request)
        queryset = svc.school_posts(school)
        wanted = request.query_params.get('status')
        if wanted:
            queryset = queryset.filter(status=wanted)
        return Response({'results': [post_payload(p, with_body=False) for p in queryset.order_by('-updated_at')]})

    @extend_schema(tags=['Public site blog'], description='Create a draft article.')
    def post(self, request):
        school = self.target_school(request)
        post = svc.create_post(school, request.user, _body(request), request)
        return Response(post_payload(post), status=status.HTTP_201_CREATED)


def _find(queryset, pk):
    """The object inside this school's queryset, or 404 (also for a malformed id)."""
    try:
        return queryset.get(pk=pk)
    except (ObjectDoesNotExist, DjangoValidationError, ValueError):
        raise Http404


class _PostView(_ManagerView):
    def get_post(self, request, pk):
        return _find(svc.school_posts(self.target_school(request)), pk)


class PostDetailView(_PostView):
    """GET / PATCH / DELETE: /schools/public-site/blog/posts/<id>/"""

    def get(self, request, pk):
        return Response(post_payload(self.get_post(request, pk)))

    def patch(self, request, pk):
        post = svc.update_post(self.get_post(request, pk), _body(request), request)
        return Response(post_payload(post))

    def delete(self, request, pk):
        svc.delete_post(self.get_post(request, pk), request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class PostPublishView(_PostView):
    """POST /schools/public-site/blog/posts/<id>/publish/"""

    def post(self, request, pk):
        return Response(post_payload(svc.publish_post(self.get_post(request, pk), request)))


class PostUnpublishView(_PostView):
    """POST /schools/public-site/blog/posts/<id>/unpublish/"""

    def post(self, request, pk):
        return Response(post_payload(svc.unpublish_post(self.get_post(request, pk), request)))


class PostPreviewRotateView(_PostView):
    """POST /schools/public-site/blog/posts/<id>/preview-token/rotate/"""

    def post(self, request, pk):
        return Response(post_payload(svc.rotate_post_preview_token(self.get_post(request, pk), request)))


class ImageUploadView(_ManagerView):
    """POST multipart ``file``: /schools/public-site/blog/images/"""

    parser_classes = [MultiPartParser, FormParser]

    @extend_schema(tags=['Public site blog'], description="Upload an image for the school's articles.")
    def post(self, request):
        school = self.target_school(request)
        record = svc.upload_image(school, request.user, request.FILES.get('file'))
        return Response({'id': str(record.pk), 'url': svc.image_url(record)}, status=status.HTTP_201_CREATED)


class CategoryListView(_ManagerView):
    """GET / POST: /schools/public-site/blog/categories/"""

    parser_classes = [JSONParser]

    def get(self, request):
        school = self.target_school(request)
        return Response({'results': [category_payload(c) for c in SchoolPostCategory.objects.filter(school=school)]})

    def post(self, request):
        school = self.target_school(request)
        return Response(category_payload(svc.save_category(school, _body(request))), status=status.HTTP_201_CREATED)


class CategoryDetailView(_ManagerView):
    """PATCH / DELETE: /schools/public-site/blog/categories/<id>/"""

    def _get(self, request, pk):
        return _find(SchoolPostCategory.objects.filter(school=self.target_school(request)), pk)

    def patch(self, request, pk):
        category = self._get(request, pk)
        return Response(category_payload(svc.save_category(category.school, _body(request), category)))

    def delete(self, request, pk):
        self._get(request, pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ------------------------------------------------------------------ leadership

class LeaderCandidatesView(_ManagerView):
    """GET /schools/public-site/leadership/candidates/ : the school's own staff only."""

    @extend_schema(tags=['Public site leadership'], description="The school's staff who can be added as leaders.")
    def get(self, request):
        school = self.target_school(request)
        return Response({'results': svc.candidate_rows(school)})


class LeaderListView(_ManagerView):
    """GET / POST: /schools/public-site/leadership/"""

    @extend_schema(tags=['Public site leadership'], description='The public leadership list (all, including hidden).')
    def get(self, request):
        school = self.target_school(request)
        return Response({'results': [leader_payload(l) for l in svc.school_leaders(school)]})

    @extend_schema(tags=['Public site leadership'], description='Add a staff member to the leadership list.')
    def post(self, request):
        school = self.target_school(request)
        return Response(leader_payload(svc.add_leader(school, _body(request), request)),
                        status=status.HTTP_201_CREATED)


class LeaderDetailView(_ManagerView):
    """PATCH / DELETE: /schools/public-site/leadership/<id>/"""

    def _get(self, request, pk):
        return _find(svc.school_leaders(self.target_school(request)), pk)

    def patch(self, request, pk):
        return Response(leader_payload(svc.update_leader(self._get(request, pk), _body(request), request)))

    def delete(self, request, pk):
        svc.remove_leader(self._get(request, pk), request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class LeaderReorderView(_ManagerView):
    """POST {ids: [...]}: /schools/public-site/leadership/reorder/"""

    def post(self, request):
        school = self.target_school(request)
        leaders = svc.reorder_leaders(school, request.data.get('ids') if hasattr(request.data, 'get') else None,
                                      request)
        return Response({'results': [leader_payload(l) for l in leaders]})
