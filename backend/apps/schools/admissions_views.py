"""Admission applications: the public form API and the school's review API.

Public endpoints take no authentication and return no private data. Admin
endpoints are limited to SCHOOL_ADMIN / SUB_ADMIN of the school; the queryset is
filtered by ``request.user.school`` on the server, never only in the UI.
"""

import logging
import mimetypes

from django.core import signing
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Q
from django.http import FileResponse, Http404, StreamingHttpResponse
from django.utils import timezone
from django.utils.dateparse import parse_date
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, BasePermission
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from . import admissions_services as svc
from .admissions_models import (
    DOCUMENT_TYPES,
    FIELD_KEYS,
    AdmissionApplication,
    AdmissionSettings,
    ApplicationDocument,
    ApplicationStatus,
)
from .models import School, SchoolClass
from .public_profile import resolve_lang
from .public_site_services import clean_text
from .scoping import managed_sub_school_ids

logger = logging.getLogger(__name__)


# -- public -----------------------------------------------------------------


class PublicEnrollmentView(APIView):
    """GET config / POST submit at /api/v1/schools/public/<slug>/enrollment/ (no auth)."""

    permission_classes = [AllowAny]
    authentication_classes: list = []
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    throttle_classes = [ScopedRateThrottle]

    @property
    def throttle_scope(self):
        # POST has its own strict scope (5/hour per IP); reading the config is cheap.
        return 'enrollment' if self.request.method == 'POST' else 'public_site'

    def _school(self, slug):
        school = School.objects.filter(public_slug=slug).first()
        if school is None:
            raise Http404
        return school

    @staticmethod
    def _unavailable(state, adm):
        body = {'state': 'closed' if state in ('closed', 'not_yet_open') else 'unavailable'}
        if body['state'] == 'closed' and adm is not None:
            body.update({'reason': state, 'opens_on': adm.opens_on, 'closes_on': adm.closes_on})
        response = Response(body, status=status.HTTP_404_NOT_FOUND)
        response['Cache-Control'] = 'no-store'
        return response

    @extend_schema(tags=['Admissions'], description='Admission form configuration of a published school. No authentication.')
    def get(self, request, slug):
        school = self._school(slug)
        profile, adm, state = svc.public_context(school)
        if state != 'open':
            return self._unavailable(state, adm)
        response = Response(svc.public_config(school, profile, adm, resolve_lang(request)))
        response['Cache-Control'] = 'no-store'
        return response

    @extend_schema(tags=['Admissions'], description='Submit an admission application. Returns only a reference code.')
    def post(self, request, slug):
        school = self._school(slug)
        profile, adm, state = svc.public_context(school)
        if state != 'open':
            return self._unavailable(state, adm)

        raw = request.data
        if not hasattr(raw, 'keys'):
            raise ValidationError({'detail': 'invalid'})
        data = {}
        for key in raw.keys():
            value = raw.get(key)
            if isinstance(value, (list, dict)):
                raise ValidationError({key: 'invalid'})
            data[key] = value

        # Honeypot: real people never see this field. Pretend it worked, store nothing.
        if str(data.get('website') or '').strip():
            return Response({'reference': svc.new_reference(), 'status': 'received'},
                            status=status.HTTP_201_CREATED)
        data.pop('website', None)

        token_error = svc.check_form_token(data.get('form_token'), school)
        if token_error:
            return Response({'errors': {'form': token_error}}, status=status.HTTP_400_BAD_REQUEST)
        data.pop('form_token', None)

        files = request.FILES.getlist(svc.FILE_FIELD) if hasattr(request, 'FILES') else []
        extra_files = set(request.FILES.keys()) - {svc.FILE_FIELD} if hasattr(request, 'FILES') else set()
        if extra_files:
            return Response({'errors': {key: 'unknown_field' for key in sorted(extra_files)}},
                            status=status.HTTP_400_BAD_REQUEST)

        clean, errors = svc.validate_submission(school, adm, data)
        doc_errors, documents = svc.validate_documents(adm, files)
        errors.update(doc_errors)
        if errors:
            return Response({'errors': errors}, status=status.HTTP_400_BAD_REQUEST)
        try:
            application, created = svc.submit_application(school, adm, clean, documents, request)
        except svc.SubmissionError as exc:
            return Response({'errors': exc.errors}, status=exc.status_code)
        # Only the reference code goes back: never echo private data.
        return Response({'reference': application.reference, 'status': 'received'},
                        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


# -- admin ------------------------------------------------------------------


class IsAdmissionsManager(BasePermission):
    """SCHOOL_ADMIN or SUB_ADMIN of a school. Class teachers and everyone else: no."""

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.role in ('SCHOOL_ADMIN', 'SUB_ADMIN')
                    and user.school_id)


def scoped_applications(user):
    queryset = AdmissionApplication.objects.filter(school_id=user.school_id)
    ids = managed_sub_school_ids(user)
    if ids is not None:
        queryset = queryset.filter(class_applied__sub_school_id__in=ids)
    return queryset


def _actor_name(user):
    return (getattr(user, 'name', '') or str(user))[:200]


def settings_payload(school, adm):
    profile = getattr(school, 'public_profile', None)
    return {
        'opens_on': adm.opens_on, 'closes_on': adm.closes_on, 'intake_year': adm.intake_year,
        'classes_offered': [str(pk) for pk in adm.classes_offered.values_list('id', flat=True)],
        'field_config': svc.effective_field_config(adm),
        'allowed_document_types': adm.allowed_document_types, 'max_document_mb': adm.max_document_mb,
        'max_documents': adm.max_documents,
        'consent_text_en': adm.consent_text_en, 'consent_text_fr': adm.consent_text_fr,
        'notification_email': adm.notification_email,
        'auto_reply_en': adm.auto_reply_en, 'auto_reply_fr': adm.auto_reply_fr,
        'enrollment_enabled': bool(profile and profile.enrollment_enabled),
        'publication_status': profile.publication_status if profile else 'draft',
        'window_state': svc.window_state(adm),
        'available_classes': [svc.class_payload(c) | {'sub_school': str(c.sub_school_id or '')}
                              for c in SchoolClass.objects.filter(school=school).select_related('level').order_by('cycle', 'name')],
        'education_category': school.education_category,
        'slug': school.public_slug,
    }


class SettingsSerializer(serializers.Serializer):
    opens_on = serializers.DateField(required=False, allow_null=True)
    closes_on = serializers.DateField(required=False, allow_null=True)
    intake_year = serializers.RegexField(r'^(\d{4}|\d{4}-\d{4})$', required=False, allow_blank=True)
    classes_offered = serializers.ListField(child=serializers.UUIDField(), required=False, max_length=200)
    field_config = serializers.DictField(child=serializers.CharField(), required=False)
    allowed_document_types = serializers.ListField(child=serializers.CharField(), required=False, max_length=3)
    max_document_mb = serializers.IntegerField(required=False, min_value=1, max_value=10)
    max_documents = serializers.IntegerField(required=False, min_value=0, max_value=10)
    consent_text_en = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    consent_text_fr = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    notification_email = serializers.EmailField(required=False, allow_blank=True)
    auto_reply_en = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    auto_reply_fr = serializers.CharField(required=False, allow_blank=True, max_length=2000)

    def to_internal_value(self, data):
        unknown = set(data) - set(self.fields)
        if unknown:
            raise ValidationError({k: 'This field cannot be edited here.' for k in sorted(unknown)})
        return super().to_internal_value(data)

    def validate_field_config(self, value):
        for key, mode in value.items():
            if key not in FIELD_KEYS:
                raise ValidationError(f'Unknown field: {key}.')
            if mode not in ('required', 'optional', 'hidden'):
                raise ValidationError(f'{key}: use required, optional or hidden.')
        return value

    def validate_allowed_document_types(self, value):
        bad = [v for v in value if v not in DOCUMENT_TYPES]
        if bad:
            raise ValidationError(f'Allowed types: {", ".join(DOCUMENT_TYPES)}.')
        return sorted(set(value))

    def validate(self, attrs):
        for name in ('consent_text_en', 'consent_text_fr', 'auto_reply_en', 'auto_reply_fr'):
            if name in attrs:
                attrs[name] = clean_text(attrs[name])
        opens, closes = attrs.get('opens_on'), attrs.get('closes_on')
        if opens and closes and closes < opens:
            raise ValidationError({'closes_on': 'The closing date must be on or after the opening date.'})
        if 'field_config' in attrs:
            merged = {**svc.effective_field_config(self.context['adm']), **attrs['field_config']}
            if merged['guardian_phone'] == 'hidden' and merged['guardian_email'] == 'hidden':
                raise ValidationError({'field_config': 'Keep at least one guardian contact (phone or email).'})
            attrs['field_config'] = merged
        return attrs


class AdmissionSettingsView(APIView):
    """GET / PATCH /api/v1/schools/admissions/settings/"""

    permission_classes = [IsAdmissionsManager]

    @extend_schema(tags=['Admissions'], description="The school's admission settings.")
    def get(self, request):
        adm = svc.get_settings(request.user.school)
        return Response(settings_payload(request.user.school, adm))

    @extend_schema(tags=['Admissions'], description="Edit the school's admission settings.")
    @transaction.atomic
    def patch(self, request):
        school = request.user.school
        adm = svc.get_settings(school)
        serializer = SettingsSerializer(data=request.data, partial=True, context={'adm': adm})
        serializer.is_valid(raise_exception=True)
        values = dict(serializer.validated_data)
        class_ids = values.pop('classes_offered', None)
        if class_ids is not None:
            found = set(SchoolClass.objects.filter(school=school, id__in=class_ids).values_list('id', flat=True))
            if found != set(class_ids):
                raise ValidationError({'classes_offered': 'One or more classes do not belong to this school.'})
        for name, value in values.items():
            setattr(adm, name, value)
        adm.updated_by = request.user
        adm.save()
        if class_ids is not None:
            adm.classes_offered.set(class_ids)
        svc.write_audit(school, request.user, 'settings_updated',
                        detail={'fields': sorted(list(values) + (['classes_offered'] if class_ids is not None else []))})
        return Response(settings_payload(school, adm))


class ApplicationPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 100


def application_summary(a):
    return {
        'id': str(a.id), 'reference': a.reference, 'status': a.status,
        'student_full_name': a.student_full_name,
        'class_applied': str(a.class_applied_id) if a.class_applied_id else None,
        'class_applied_name': a.class_applied_name, 'intake_year': a.intake_year,
        'guardian_name': a.guardian_name, 'guardian_phone': a.guardian_phone,
        'guardian_email': a.guardian_email, 'created_at': a.created_at,
        'documents_count': getattr(a, 'documents_count', None),
    }


def application_detail(a):
    from apps.students import api as students_api

    data = application_summary(a)
    data.update({
        'student_dob': a.student_dob, 'student_gender': a.student_gender,
        'previous_school': a.previous_school, 'guardian_relationship': a.guardian_relationship,
        'guardian_address': a.guardian_address, 'message': a.message, 'language': a.language,
        'consent_given': a.consent_given, 'consent_at': a.consent_at,
        'internal_notes': a.internal_notes, 'handled_by': _actor_name(a.handled_by) if a.handled_by_id else '',
        'status_changed_at': a.status_changed_at,
        'enrolled_student_id': str(a.enrolled_student_id) if a.enrolled_student_id else None,
        'documents': [{'id': str(d.id), 'doc_type': d.doc_type, 'name': d.original_name, 'size': d.size}
                      for d in a.documents.all()],
        'audit': [{'action': e.action, 'from_status': e.from_status, 'to_status': e.to_status,
                   'actor': e.actor_name, 'at': e.created_at}
                  for e in a.audit.all()[:50]],
        'possible_duplicates': [] if a.status == ApplicationStatus.ENROLLED else
        students_api.find_possible_duplicate_pupils(
            school=a.school, name=a.student_full_name, date_of_birth=a.student_dob,
            guardian_phone=a.guardian_phone),
    })
    return data


def filtered_applications(request):
    queryset = scoped_applications(request.user)
    params = request.query_params
    if params.get('status') in ApplicationStatus.values:
        queryset = queryset.filter(status=params['status'])
    if params.get('class'):
        try:
            queryset = queryset.filter(class_applied_id=params['class'])
        except (ValueError, DjangoValidationError):
            queryset = queryset.none()
    start, end = parse_date(params.get('date_from', '') or ''), parse_date(params.get('date_to', '') or '')
    if start:
        queryset = queryset.filter(created_at__date__gte=start)
    if end:
        queryset = queryset.filter(created_at__date__lte=end)
    q = (params.get('q') or '').strip()[:100]
    if q:
        queryset = queryset.filter(
            Q(student_full_name__icontains=q) | Q(guardian_name__icontains=q) | Q(reference__icontains=q)
            | Q(guardian_phone__icontains=q) | Q(guardian_email__icontains=q))
    return queryset


class ApplicationListView(APIView):
    """GET /api/v1/schools/admissions/applications/ (paginated; status, class, date_from, date_to, q)."""

    permission_classes = [IsAdmissionsManager]

    @extend_schema(tags=['Admissions'], description="The school's admission applications.")
    def get(self, request):
        from django.db.models import Count

        queryset = filtered_applications(request).annotate(documents_count=Count('documents'))
        paginator = ApplicationPagination()
        page = paginator.paginate_queryset(queryset.order_by('-created_at'), request, view=self)
        counts = {}
        for row in scoped_applications(request.user).values('status').annotate(n=Count('id')):
            counts[row['status']] = row['n']
        response = paginator.get_paginated_response([application_summary(a) for a in page])
        response.data['status_counts'] = counts
        return response


class _ApplicationMixin:
    permission_classes = [IsAdmissionsManager]

    def get_application(self, request, pk, lock=False):
        queryset = scoped_applications(request.user).select_related('school', 'handled_by', 'class_applied')
        if lock:
            queryset = queryset.select_for_update(of=('self',))
        application = queryset.filter(pk=pk).first()
        if application is None:
            raise Http404
        return application


class ApplicationDetailView(_ApplicationMixin, APIView):
    """GET / PATCH /api/v1/schools/admissions/applications/<id>/ (status, internal_notes)."""

    @extend_schema(tags=['Admissions'], description='One admission application.')
    def get(self, request, pk):
        application = self.get_application(request, pk)
        svc.write_audit(application.school, request.user, 'viewed', application)
        return Response(application_detail(application))

    @extend_schema(tags=['Admissions'], description='Change the status or internal notes of an application.')
    @transaction.atomic
    def patch(self, request, pk):
        application = self.get_application(request, pk, lock=True)
        unknown = set(request.data) - {'status', 'internal_notes'}
        if unknown:
            raise ValidationError({k: 'This field cannot be edited here.' for k in sorted(unknown)})
        changed = False
        if 'status' in request.data:
            new = request.data['status']
            if new not in ApplicationStatus.values or new == ApplicationStatus.ENROLLED:
                raise ValidationError({'status': 'Use one of: new, under_review, accepted, rejected, waitlisted. '
                                                 'Use the enrol action to enrol.'})
            if application.status == ApplicationStatus.ENROLLED:
                raise ValidationError({'status': 'An enrolled application can no longer change status.'})
            if new != application.status:
                old = application.status
                application.status = new
                application.status_changed_at = timezone.now()
                svc.write_audit(application.school, request.user, 'status_changed', application, old, new)
                changed = True
        if 'internal_notes' in request.data:
            notes = clean_text(request.data['internal_notes'])
            if len(notes) > 4000:
                raise ValidationError({'internal_notes': 'Maximum 4000 characters.'})
            if notes != application.internal_notes:
                application.internal_notes = notes
                svc.write_audit(application.school, request.user, 'notes_updated', application)
                changed = True
        if changed:
            application.handled_by = request.user
            application.save()
        return Response(application_detail(application))


class ApplicationDocumentLinkView(_ApplicationMixin, APIView):
    """POST .../applications/<id>/documents/<doc>/link/ : a 5-minute signed download address."""

    @extend_schema(tags=['Admissions'], description='Short-lived signed URL for one application document.')
    def post(self, request, pk, doc_id):
        application = self.get_application(request, pk)
        document = ApplicationDocument.objects.filter(pk=doc_id, application=application).first()
        if document is None:
            raise Http404
        token = svc.make_download_token(document, request.user)
        response = Response({'url': f'/api/v1/schools/admissions/documents/download/{token}/',
                             'expires_in': svc.DOWNLOAD_MAX_AGE})
        response['Cache-Control'] = 'no-store'
        return response


class ApplicationDocumentDownloadView(APIView):
    """GET /api/v1/schools/admissions/documents/download/<token>/ : bound to the user who asked."""

    permission_classes = [IsAdmissionsManager]

    @extend_schema(tags=['Admissions'], description='Download a document with a valid signed token.')
    def get(self, request, token):
        try:
            doc_id, app_id = svc.read_download_token(token, request.user)
        except signing.SignatureExpired:
            return Response({'detail': 'This link has expired. Request a new one.'}, status=status.HTTP_410_GONE)
        except (signing.BadSignature, ValueError, PermissionError):
            return Response({'detail': 'Invalid link.'}, status=status.HTTP_403_FORBIDDEN)
        application = scoped_applications(request.user).filter(pk=app_id).select_related('school').first()
        document = ApplicationDocument.objects.filter(pk=doc_id, application_id=app_id).first() if application else None
        if document is None:
            raise Http404
        try:
            handle = document.file.open('rb')
        except (FileNotFoundError, OSError):
            raise Http404
        svc.write_audit(application.school, request.user, 'document_downloaded', application,
                        detail={'document': str(document.pk)})
        response = FileResponse(handle, content_type=document.content_type or mimetypes.guess_type(document.file.name)[0]
                                or 'application/octet-stream')
        response['Content-Disposition'] = f'attachment; filename="document-{str(document.pk)[:8]}.{document.doc_type}"'
        response['X-Content-Type-Options'] = 'nosniff'
        response['Cache-Control'] = 'private, no-store'
        return response


class ApplicationExportView(APIView):
    """GET /api/v1/schools/admissions/export/ : CSV of the filtered applications."""

    permission_classes = [IsAdmissionsManager]

    @extend_schema(tags=['Admissions'], description='CSV export of the filtered applications.')
    def get(self, request):
        queryset = filtered_applications(request).order_by('-created_at')
        svc.write_audit(request.user.school, request.user, 'exported',
                        detail={'rows': queryset.count(), 'filters': sorted(k for k in request.query_params)})
        response = StreamingHttpResponse(svc.csv_stream(queryset), content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = 'attachment; filename="admission-applications.csv"'
        response['Cache-Control'] = 'private, no-store'
        return response


class ApplicationEnrolView(_ApplicationMixin, APIView):
    """POST .../applications/<id>/enrol/ : create the pupil through apps.students.api, once."""

    @extend_schema(tags=['Admissions'], description='Enrol an accepted application as a pupil.')
    def post(self, request, pk):
        from apps.students import api as students_api

        with transaction.atomic():
            application = self.get_application(request, pk, lock=True)
            if application.status == ApplicationStatus.ENROLLED or application.enrolled_student_id:
                return Response({'detail': 'This application is already enrolled.'}, status=status.HTTP_409_CONFLICT)
            if application.status != ApplicationStatus.ACCEPTED:
                raise ValidationError({'status': 'Accept the application before enrolling.'})
            school = application.school
            school_class = application.class_applied
            override = request.data.get('class_id')
            if override:
                school_class = SchoolClass.objects.filter(pk=override, school=school).first()
                if school_class is None:
                    raise ValidationError({'class_id': 'Unknown class for this school.'})
            if school_class is None:
                raise ValidationError({'class_id': 'Choose the class to enrol the pupil in.'})
            if str(request.data.get('confirm_duplicate')).lower() not in ('true', '1'):
                duplicates = students_api.find_possible_duplicate_pupils(
                    school=school, name=application.student_full_name,
                    date_of_birth=application.student_dob, guardian_phone=application.guardian_phone)
                if duplicates:
                    return Response({'detail': 'A pupil with the same details may already exist.',
                                     'code': 'possible_duplicate', 'duplicates': duplicates},
                                    status=status.HTTP_409_CONFLICT)
            student = students_api.create_pupil_from_admission(
                requested_by=request.user, name=application.student_full_name, school_class=school_class,
                date_of_birth=application.student_dob, gender=application.student_gender,
                guardian_name=application.guardian_name, guardian_phone=application.guardian_phone,
                guardian_email=application.guardian_email, relationship=application.guardian_relationship,
                login=school.education_category != 'basic')
            old = application.status
            application.status = ApplicationStatus.ENROLLED
            application.enrolled_student_id = student.id
            application.status_changed_at = timezone.now()
            application.handled_by = request.user
            application.save()
            svc.write_audit(school, request.user, 'enrolled', application, old, ApplicationStatus.ENROLLED,
                            detail={'student': str(student.id)})
        return Response({'student_id': str(student.id), 'application': application_detail(application)},
                        status=status.HTTP_201_CREATED)
