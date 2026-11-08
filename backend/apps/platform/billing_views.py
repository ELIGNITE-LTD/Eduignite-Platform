"""Endpoints for the per-student platform bill. Rules live in ``billing.py``."""

from drf_spectacular.utils import extend_schema
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.executive_access import executive_module_required

from . import billing
from .models import PlatformBillingChange

# Same module as the rest of the founders' platform settings (CEO/CTO rules).
PortfolioPolicyModule = executive_module_required('portfolio_policy')


class IsSchoolAdminOrSubAdmin(IsAuthenticated):
    """School-level billing reader: the school's own administrators only."""

    def has_permission(self, request, view):
        return bool(
            super().has_permission(request, view)
            and str(getattr(request.user, 'role', '') or '').upper() in ('SCHOOL_ADMIN', 'SUB_ADMIN')
            and getattr(request.user, 'school_id', None)
        )


def _own_school(request):
    from apps.schools.models import School

    return School.objects.filter(id=request.user.school_id).first()


class MyPlatformBillView(APIView):
    """GET /platform/billing/my-bill/ - the signed-in school's own platform bill.

    Scoped to ``request.user.school`` on the server. School admin and sub-admin
    can read it; only the school admin can pay (``can_pay``).
    """

    permission_classes = [IsSchoolAdminOrSubAdmin]

    @extend_schema(tags=['Platform'], description="The school's per-student platform bill")
    def get(self, request):
        school = _own_school(request)
        if school is None:
            return Response({'detail': 'School not found.'}, status=404)
        data = billing.public_bill(school, create=True)
        data['can_pay'] = str(request.user.role).upper() == 'SCHOOL_ADMIN'
        data['school_state'] = school.subscription_status
        return Response(data)


class MyPlatformBillHistoryView(APIView):
    """GET /platform/billing/history/ - bills per cycle with their receipts."""

    permission_classes = [IsSchoolAdminOrSubAdmin]

    @extend_schema(tags=['Platform'], description="The school's platform bill history")
    def get(self, request):
        school = _own_school(request)
        if school is None:
            return Response({'detail': 'School not found.'}, status=404)
        return Response({'results': billing.history(school)})


class SchoolsBillingOverviewView(APIView):
    """GET /platform/billing/schools/?status=overdue - founders' per-school status."""

    permission_classes = [PortfolioPolicyModule]

    @extend_schema(tags=['Platform'], description='Per-school platform billing status (executives)')
    def get(self, request):
        rows = billing.schools_overview(request.query_params.get('status') or None)
        summary = {}
        for row in rows:
            summary[row['status']] = summary.get(row['status'], 0) + 1
        return Response({'summary': summary, 'results': rows})


class PlatformBillingChangesView(APIView):
    """GET /platform/billing/changes/ - audit trail of rate/deadline edits."""

    permission_classes = [PortfolioPolicyModule]

    @extend_schema(tags=['Platform'], description='Who changed the platform billing configuration')
    def get(self, request):
        rows = PlatformBillingChange.objects.select_related('changed_by')[:100]
        return Response({'results': [
            {
                'changed_at': row.changed_at.isoformat(),
                'changed_by': getattr(row.changed_by, 'name', None) or getattr(row.changed_by, 'email', None),
                'changes': row.changes,
            }
            for row in rows
        ]})
