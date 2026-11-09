from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.filters import OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend
from django.http import HttpResponse
from .models import StaffRemark
from .serializers import StaffRemarkSerializer, StaffRemarkCreateSerializer
from apps.registry.permissions import RequiresApp


def is_platform_executive(user):
    # Executives see every school's remarks only with the Schools module.
    from apps.users.executive_access import user_has_module

    return user_has_module(user, 'schools')


def is_school_admin(user):
    return bool(getattr(user, 'is_authenticated', False) and getattr(user, 'is_school_admin', False))


class StaffRemarkViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, RequiresApp('staff_remarks')]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['remark_type', 'staff']
    ordering_fields = ['created_at']
    ordering = ['-created_at']

    def get_serializer_class(self):
        if self.action == 'create':
            return StaffRemarkCreateSerializer
        return StaffRemarkSerializer

    def get_queryset(self):
        user = self.request.user
        if is_platform_executive(user):
            return StaffRemark.objects.all()
        elif is_school_admin(user):
            return StaffRemark.objects.filter(school=user.school)
        else:
            return StaffRemark.objects.filter(staff=user, is_confidential=False)

    def check_permissions(self, request):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            if not (is_school_admin(request.user) or is_platform_executive(request.user)):
                self.permission_denied(request)
        return super().check_permissions(request)

    def perform_create(self, serializer):
        serializer.save(admin=self.request.user, school=self.request.user.school)

    @action(detail=False, methods=['get'])
    def my_remarks(self, request):
        """Get current user's remarks"""
        remarks = StaffRemark.objects.filter(staff=request.user, is_confidential=False)
        serializer = StaffRemarkSerializer(remarks, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def acknowledge(self, request, pk=None):
        """Staff member acknowledges a remark"""
        remark = self.get_object()

        if request.user != remark.staff:
            return Response({'detail': 'You can only acknowledge your own remarks'},
                          status=status.HTTP_403_FORBIDDEN)

        remark.acknowledged = True
        from django.utils import timezone
        remark.acknowledged_at = timezone.now()
        remark.save()

        return Response({'status': 'remark acknowledged'})

    @action(detail=False, methods=['get'])
    def download_report(self, request):
        """Download remark history for a staff member (school_admin only)"""
        if not (is_school_admin(request.user) or is_platform_executive(request.user)):
            return Response({'detail': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)

        from apps.users.models import User
        staff_pk = request.query_params.get('staff')
        if not staff_pk:
            return Response({'detail': 'staff query parameter is required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            staff = User.objects.get(pk=staff_pk, school=request.user.school)
        except User.DoesNotExist:
            return Response({'detail': 'Staff member not found'}, status=status.HTTP_404_NOT_FOUND)

        remarks = StaffRemark.objects.filter(staff=staff, school=request.user.school)

        import csv
        from io import StringIO

        output = StringIO()
        writer = csv.writer(output)
        writer.writerow(['Date', 'Type', 'Remark', 'Given By', 'Acknowledged', 'Acknowledged Date'])

        for remark in remarks:
            writer.writerow([
                remark.created_at.date(),
                remark.get_remark_type_display(),
                remark.text,
                remark.admin.get_full_name(),
                'Yes' if remark.acknowledged else 'No',
                remark.acknowledged_at.date() if remark.acknowledged_at else '',
            ])

        response = HttpResponse(output.getvalue(), content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="remarks_{staff.id}.csv"'
        return response
