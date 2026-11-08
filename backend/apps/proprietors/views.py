"""HTTP layer for proprietor accounts. Rules live in ``services``; stats in ``stats``."""

import logging

from django.contrib.auth import get_user_model
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.schools.filters import apply_school_filters
from apps.schools.models import School

from . import services, stats
from .models import ProprietorActionLog, ProprietorSchoolLink
from .permissions import IsFounderForProprietors, IsProprietor

User = get_user_model()
logger = logging.getLogger(__name__)

PHONE_REGEX = r'^\+?1?\d{9,15}$'


def fail(message, code, http_status, errors=None):
    """Same envelope as core.exceptions.custom_exception_handler, plus ``detail``."""
    return Response(
        {'status': False, 'message': message, 'detail': message, 'code': code, 'errors': errors or {}},
        status=http_status,
    )


def not_found():
    return fail('Not found.', 'not_found', status.HTTP_404_NOT_FOUND)


def _clean_phone(value):
    import re

    return re.sub(r'[\s().-]+', '', (value or '').strip())


# -- serializers -----------------------------------------------------------


class ProprietorCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    email = serializers.EmailField(max_length=254)
    phone = serializers.RegexField(PHONE_REGEX, required=False, allow_blank=True, allow_null=True)

    def validate_name(self, value):
        value = ' '.join(value.split())
        if not value:
            raise serializers.ValidationError('This field may not be blank.')
        return value

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError('This email is already in the system.')
        return value.strip()

    def validate_phone(self, value):
        return _clean_phone(value)


class ProprietorUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255, required=False)
    email = serializers.EmailField(max_length=254, required=False)
    phone = serializers.RegexField(PHONE_REGEX, required=False, allow_blank=True, allow_null=True)
    is_active = serializers.BooleanField(required=False)

    def validate_phone(self, value):
        return _clean_phone(value)


class SchoolIdsSerializer(serializers.Serializer):
    school_ids = serializers.ListField(
        child=serializers.CharField(max_length=50), allow_empty=True, max_length=services.MAX_LINKED_SCHOOLS,
    )


class CredentialResetSerializer(serializers.Serializer):
    # The proprietor's OWN identity, re-checked on every call.
    matricule = serializers.CharField(max_length=50, trim_whitespace=True)
    password = serializers.CharField(max_length=256, trim_whitespace=False, write_only=True)
    # The change. The target's matricule/role/school are deliberately not fields.
    new_password = serializers.CharField(max_length=256, trim_whitespace=False, write_only=True)
    email = serializers.EmailField(max_length=254, required=False)
    phone = serializers.RegexField(PHONE_REGEX, required=False, allow_blank=True)
    is_active = serializers.BooleanField(required=False)
    require_password_change = serializers.BooleanField(required=False, default=True)

    def validate_phone(self, value):
        return _clean_phone(value)


# -- output ----------------------------------------------------------------


def _school_row(school):
    return {
        'id': school.id, 'name': school.name, 'short_name': school.short_name, 'location': school.location,
        'education_category': school.education_category, 'school_type': school.school_type,
        'subsystem': school.subsystem, 'status': school.status,
    }


def _proprietor_payload(user, schools):
    return {
        'id': str(user.id), 'matricule': user.matricule, 'name': user.name, 'email': user.email,
        'phone': user.phone or '', 'is_active': user.is_active,
        'must_change_password': user.must_change_password,
        'last_login': user.last_login.isoformat() if user.last_login else None,
        'date_joined': user.date_joined.isoformat() if user.date_joined else None,
        'school_count': len(schools),
        'schools': [_school_row(s) for s in schools],
    }


def _schools_by_proprietor(proprietor_ids):
    """``{proprietor_id: [School, ...]}`` for live schools, in ONE query."""
    grouped = {pid: [] for pid in proprietor_ids}
    links = (
        ProprietorSchoolLink.objects.filter(proprietor_id__in=proprietor_ids, school__is_drafted=False)
        .select_related('school').order_by('school__name')
    )
    for link in links:
        grouped[link.proprietor_id].append(link.school)
    return grouped


def _proprietor_or_none(pk):
    return User.objects.filter(pk=pk, role='PROPRIETOR', is_drafted=False).first()


def _serialize_one(user):
    return _proprietor_payload(user, _schools_by_proprietor([user.pk])[user.pk])


# -- A. founder endpoints -----------------------------------------------------


class FounderBase(APIView):
    permission_classes = [IsFounderForProprietors]


class ProprietorListCreateView(FounderBase):
    def get(self, request):
        qs = User.objects.filter(role='PROPRIETOR', is_drafted=False)
        query = (request.query_params.get('q') or '').strip()
        if query:
            qs = qs.filter(Q(name__icontains=query) | Q(email__icontains=query) | Q(matricule__icontains=query))
        active = (request.query_params.get('is_active') or '').lower()
        if active in ('true', '1'):
            qs = qs.filter(is_active=True)
        elif active in ('false', '0'):
            qs = qs.filter(is_active=False)
        users = list(qs.order_by('name')[:500])
        grouped = _schools_by_proprietor([u.pk for u in users])
        return Response({'count': len(users), 'results': [_proprietor_payload(u, grouped[u.pk]) for u in users]})

    def post(self, request):
        serializer = ProprietorCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            user, password = services.create_proprietor(
                actor=request.user, name=data['name'], email=data['email'], phone=data.get('phone'),
                ip=services.client_ip(request),
            )
        except services.ServiceError as exc:
            return fail(exc.message, exc.code, status.HTTP_400_BAD_REQUEST, exc.errors)
        from apps.orders import api as orders_api

        orders_api.notify_proprietor_account_created(user.pk)
        return Response({
            'proprietor': _serialize_one(user),
            'credentials': {
                'matricule': user.matricule, 'temporary_password': password, 'must_change_password': True,
            },
            'email_sent': bool(user.email and not user.email.endswith(('.eduignite.local', '@example.com'))),
        }, status=status.HTTP_201_CREATED)


class ProprietorDetailView(FounderBase):
    def get(self, request, pk):
        user = _proprietor_or_none(pk)
        return Response(_serialize_one(user)) if user else not_found()

    def patch(self, request, pk):
        user = _proprietor_or_none(pk)
        if not user:
            return not_found()
        serializer = ProprietorUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            user, _changed = services.update_proprietor(
                actor=request.user, proprietor=user, data=serializer.validated_data,
                ip=services.client_ip(request),
            )
        except services.ServiceError as exc:
            return fail(exc.message, exc.code, status.HTTP_400_BAD_REQUEST, exc.errors)
        return Response(_serialize_one(user))


class ProprietorActiveView(FounderBase):
    """POST /{id}/deactivate/ and /{id}/activate/."""

    make_active = False

    def post(self, request, pk):
        user = _proprietor_or_none(pk)
        if not user:
            return not_found()
        user, _ = services.update_proprietor(
            actor=request.user, proprietor=user, data={'is_active': self.make_active},
            ip=services.client_ip(request),
        )
        return Response(_serialize_one(user))


class ProprietorResetPasswordView(FounderBase):
    def post(self, request, pk):
        user = _proprietor_or_none(pk)
        if not user:
            return not_found()
        password = services.reissue_password(actor=request.user, proprietor=user, ip=services.client_ip(request))
        user.refresh_from_db()
        return Response({
            'proprietor': _serialize_one(user),
            'credentials': {'matricule': user.matricule, 'temporary_password': password, 'must_change_password': True},
        })


class ProprietorSchoolsView(FounderBase):
    def get(self, request, pk):
        user = _proprietor_or_none(pk)
        if not user:
            return not_found()
        return Response({'schools': [_school_row(s) for s in _schools_by_proprietor([user.pk])[user.pk]]})

    def put(self, request, pk):
        user = _proprietor_or_none(pk)
        if not user:
            return not_found()
        serializer = SchoolIdsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            added, removed = services.set_linked_schools(
                actor=request.user, proprietor=user, school_ids=serializer.validated_data['school_ids'],
                ip=services.client_ip(request),
            )
        except services.ServiceError as exc:
            return fail(exc.message, exc.code, status.HTTP_400_BAD_REQUEST, exc.errors)
        schools = _schools_by_proprietor([user.pk])[user.pk]
        return Response({'schools': [_school_row(s) for s in schools], 'added': added, 'removed': removed})


class SchoolChoicesView(FounderBase):
    """The multi-select list: every live school, with the executive filters."""

    def get(self, request):
        proprietor = None
        raw = request.query_params.get('proprietor')
        if raw:
            proprietor = _proprietor_or_none(raw) if _is_uuid(raw) else None
        qs = School.objects.filter(is_drafted=False).annotate(
            proprietor_count=Count('proprietor_links', distinct=True),
        )
        qs = apply_school_filters(qs, request.query_params).distinct().order_by('name')
        schools = list(qs[:1000])
        linked = set()
        if proprietor:
            linked = set(
                ProprietorSchoolLink.objects.filter(proprietor=proprietor).values_list('school_id', flat=True)
            )
        results = [{**_school_row(s), 'proprietor_count': s.proprietor_count, 'linked': s.id in linked}
                   for s in schools]
        return Response({'count': len(results), 'results': results})


def _is_uuid(value):
    import uuid

    try:
        uuid.UUID(str(value))
        return True
    except ValueError:
        return False


# -- B. proprietor endpoints ---------------------------------------------------


class ProprietorBase(APIView):
    permission_classes = [IsProprietor]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'proprietor_read'

    def linked_school_or_none(self, school_id):
        return services.get_linked_school(self.request.user, school_id)


class OverviewView(ProprietorBase):
    def get(self, request):
        schools = list(services.linked_schools(request.user).order_by('name'))
        data = stats.overview(schools)
        return Response({
            'proprietor': {'id': str(request.user.id), 'name': request.user.name, 'matricule': request.user.matricule},
            'generated_at': timezone.now().isoformat(),
            **data,
        })


class SchoolDetailView(ProprietorBase):
    def get(self, request, school_id):
        school = self.linked_school_or_none(school_id)
        if not school:
            return not_found()
        return Response(stats.school_detail(school))


class SchoolAdminsView(ProprietorBase):
    def get(self, request, school_id):
        school = self.linked_school_or_none(school_id)
        if not school:
            return not_found()
        return Response({
            'school': {'id': school.id, 'name': school.name},
            'admins': [stats.admin_row(a) for a in services.eligible_admins(school)],
        })


class AdminCredentialsView(ProprietorBase):
    """Reset a school administrator's login details (proprietor re-authenticates)."""

    throttle_scope = 'proprietor_credentials'

    def post(self, request, school_id, user_id):
        proprietor = request.user
        ip = services.client_ip(request)

        serializer = CredentialResetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # 1. Lockout, before any password is checked.
        if services.reauth_locked(proprietor, ip):
            services.audit(ProprietorActionLog.ACTION_LOCKED_OUT, actor=proprietor, proprietor=proprietor,
                           ip=ip, detail='attempt while locked')
            return fail('Too many failed attempts. Try again in 15 minutes.', 'reauth_locked',
                        status.HTTP_429_TOO_MANY_REQUESTS)

        # 2. The proprietor proves who he is. One generic answer, no hint which part failed,
        #    and nothing yet said about the school or the target.
        if not services.verify_own_credentials(proprietor, data['matricule'], data['password']):
            services.audit(ProprietorActionLog.ACTION_REAUTH_FAILED, actor=proprietor, proprietor=proprietor,
                           ip=ip, detail='identity check failed')
            return fail(services.GENERIC_REAUTH_MESSAGE, 'reauth_failed', status.HTTP_403_FORBIDDEN)

        # 3. Scope: linked school, then an admin of exactly that school.
        school = self.linked_school_or_none(school_id)
        if not school or not _is_uuid(user_id):
            return not_found()
        target = services.eligible_admins(school).filter(pk=user_id).first()
        if not target:
            return not_found()

        # 4. Semantic validation (platform password validators, unique email).
        errors = services.validate_new_credentials(
            target, new_password=data['new_password'], email=data.get('email'), phone=data.get('phone'),
        )
        if errors:
            return fail('Invalid input.', 'validation_error', status.HTTP_400_BAD_REQUEST, errors)

        # 5. Apply, audit, and queue the informational email.
        try:
            log, changed, addresses, target = services.reset_admin_credentials(
                proprietor=proprietor, school=school, target=target, new_password=data['new_password'],
                email=data.get('email'), phone=data.get('phone'), is_active=data.get('is_active'),
                require_password_change=data.get('require_password_change', True), ip=ip,
            )
        except services.ServiceError:
            return not_found()
        from apps.orders import api as orders_api

        orders_api.notify_admin_credentials_changed(log.pk, addresses)
        return Response({
            'detail': 'Login details updated.',
            'admin': stats.admin_row(target),
            'changed': changed,
            'sessions_revoked': True,
            'notification_queued': True,
        })
