import logging
from django.utils import timezone
from rest_framework.response import Response
from rest_framework import status

logger = logging.getLogger(__name__)


class SchoolFilterMixin:
    """
    Automatically filter queryset by user's school.
    Useful for multi-school deployments where users should only see their school's data.
    """

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user

        if not user or not user.is_authenticated:
            return queryset.none()

        if hasattr(user, 'school_id') and user.school_id:
            queryset = queryset.filter(school_id=user.school_id)
        elif hasattr(user, 'school'):
            queryset = queryset.filter(school=user.school)

        return queryset


class AuditLogMixin:
    """
    Automatically log create, update, and delete operations.
    Requires an AuditLog model in the same app.
    """

    def perform_create(self, serializer):
        instance = serializer.save()
        self._log_action('CREATE', instance)
        return instance

    def perform_update(self, serializer):
        instance = serializer.save()
        self._log_action('UPDATE', instance)
        return instance

    def perform_destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self._log_action('DELETE', instance)
        super().perform_destroy(request, *args, **kwargs)

    def _log_action(self, action, instance):
        """
        Log an action to the audit log.
        """
        try:
            from apps.core.models import AuditLog

            AuditLog.objects.create(
                user=self.request.user,
                action=action,
                model_name=instance.__class__.__name__,
                object_id=instance.id,
                object_repr=str(instance)[:200],
                timestamp=timezone.now(),
            )
        except Exception as e:
            logger.warning(f"Failed to create audit log: {str(e)}")


class PlatformExecutiveOrReadOnlyMixin:
    """
    Allow platform executives to modify objects, others can only read.
    """

    def check_permissions(self, request):
        super().check_permissions(request)

        if request.method in ['GET', 'HEAD', 'OPTIONS']:
            return

        user = request.user

        if not user or not user.is_authenticated:
            from rest_framework.exceptions import NotAuthenticated

            raise NotAuthenticated()

        allowed_roles = [
            'SUPER_ADMIN',
            'CEO',
            'CTO',
            'COO',
            'INV',
            'DESIGNER',
        ]

        if user.role not in allowed_roles:
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied(detail='Only platform executives can perform this action.')


class SchoolAdminOrReadOnlyMixin:
    """
    Allow school admins to modify objects in their school, others can only read.
    """

    def check_object_permissions(self, request, obj):
        super().check_object_permissions(request, obj)

        if request.method in ['GET', 'HEAD', 'OPTIONS']:
            return

        user = request.user

        if not user or not user.is_authenticated:
            from rest_framework.exceptions import NotAuthenticated

            raise NotAuthenticated()

        if user.role in ['SCHOOL_ADMIN', 'SUB_ADMIN']:
            if not hasattr(obj, 'school_id'):
                from rest_framework.exceptions import PermissionDenied

                raise PermissionDenied(detail='Object does not belong to a school.')

            if obj.school_id != user.school_id:
                from rest_framework.exceptions import PermissionDenied

                raise PermissionDenied(detail='You can only modify objects in your school.')

            return

        from rest_framework.exceptions import PermissionDenied

        raise PermissionDenied(detail='Only school admins can perform this action.')


class TimestampFilterMixin:
    """
    Add filtering by created_at and updated_at timestamps.
    """

    def get_queryset(self):
        queryset = super().get_queryset()
        request = self.request

        created_after = request.query_params.get('created_after')
        created_before = request.query_params.get('created_before')
        updated_after = request.query_params.get('updated_after')
        updated_before = request.query_params.get('updated_before')

        if created_after:
            try:
                queryset = queryset.filter(created_at__gte=created_after)
            except Exception as e:
                logger.warning(f"Invalid created_after filter: {str(e)}")

        if created_before:
            try:
                queryset = queryset.filter(created_at__lte=created_before)
            except Exception as e:
                logger.warning(f"Invalid created_before filter: {str(e)}")

        if updated_after:
            try:
                queryset = queryset.filter(updated_at__gte=updated_after)
            except Exception as e:
                logger.warning(f"Invalid updated_after filter: {str(e)}")

        if updated_before:
            try:
                queryset = queryset.filter(updated_at__lte=updated_before)
            except Exception as e:
                logger.warning(f"Invalid updated_before filter: {str(e)}")

        return queryset


class BulkActionMixin:
    """
    Support bulk actions (create, update, delete) on ViewSet.
    """

    def get_serializer(self, *args, **kwargs):
        if isinstance(args[0], list):
            kwargs['many'] = True

        return super().get_serializer(*args, **kwargs)

    def create(self, request, *args, **kwargs):
        is_many = isinstance(request.data, list)

        if not is_many:
            return super().create(request, *args, **kwargs)

        serializer = self.get_serializer(data=request.data, many=True)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)

        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ValidateSchoolAccessMixin:
    """
    Validate that user has access to the school being accessed.
    """

    def get_object(self):
        obj = super().get_object()
        user = self.request.user

        if not user or not user.is_authenticated:
            from rest_framework.exceptions import NotAuthenticated

            raise NotAuthenticated()

        if not hasattr(obj, 'school_id'):
            return obj

        if user.role in ['SUPER_ADMIN', 'CEO', 'CTO', 'COO']:
            return obj

        if user.school_id != obj.school_id:
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied(detail='You do not have access to this resource.')

        return obj


class ProtectedActionMixin:
    """
    Prevent certain actions based on object state.
    """

    protected_actions = []

    def get_protected_status(self, obj):
        """
        Override this method to define what makes an object protected.
        Should return True if object is protected from modification.
        """
        return getattr(obj, 'is_protected', False)

    def perform_update(self, serializer):
        obj = self.get_object()

        if self.action in self.protected_actions and self.get_protected_status(obj):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied(detail='This object cannot be modified.')

        super().perform_update(serializer)

    def perform_destroy(self, request, *args, **kwargs):
        obj = self.get_object()

        if 'destroy' in self.protected_actions and self.get_protected_status(obj):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied(detail='This object cannot be deleted.')

        super().perform_destroy(request, *args, **kwargs)
