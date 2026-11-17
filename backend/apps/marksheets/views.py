from decimal import Decimal, InvalidOperation

from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import permissions, serializers, status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.students.models import Student

from . import importer
from .models import MarkSheet
from .pdf import build_pdf
from .reader import SheetReadError, read_page, straighten

MAX_PHOTOS = 12
MAX_PHOTO_BYTES = 15 * 1024 * 1024
TEACHING_ROLES = {'TEACHER', 'SCHOOL_ADMIN', 'SUB_ADMIN'}


class CanScanMarks(permissions.BasePermission):
    message = 'Only teachers and school administrators can enter marks.'

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated and getattr(user, 'school_id', None)):
            return False
        if user.role not in TEACHING_ROLES:
            return False
        from apps.registry import api as registry_api
        return bool({'grades', 'higher_ed'} & set(registry_api.installed_app_keys(user.school)))


class ColumnSerializer(serializers.Serializer):
    key = serializers.RegexField(r'^[a-z0-9_]{1,20}$')
    label = serializers.CharField(max_length=24)
    max_score = serializers.DecimalField(max_digits=6, decimal_places=2, min_value=Decimal('0.01'), max_value=Decimal('999.99'))


class SheetCreateSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=[k for k, _ in MarkSheet.KIND_CHOICES])
    title = serializers.CharField(max_length=120)
    subtitle_lines = serializers.ListField(child=serializers.CharField(max_length=160), max_length=6, required=False)
    # One wide box per column on the printed sheet, e.g. CA and Exam. Without it the sheet has a single "Mark" column.
    columns = ColumnSerializer(many=True, required=False, max_length=3)
    max_score = serializers.DecimalField(max_digits=6, decimal_places=2, min_value=Decimal('0.01'), required=False)
    scope = serializers.DictField(required=False)
    student_ids = serializers.ListField(child=serializers.UUIDField(), min_length=1, max_length=400)

    def validate(self, data):
        columns = data.get('columns')
        if not columns:
            if data.get('max_score') is None:
                raise serializers.ValidationError({'columns': 'Say what the sheet marks are out of.'})
            columns = [{'key': 'mark', 'label': 'Mark', 'max_score': data['max_score']}]
        if len({c['key'] for c in columns}) != len(columns):
            raise serializers.ValidationError({'columns': 'Each column needs its own key.'})
        data['columns'] = [{'key': c['key'], 'label': c['label'], 'max': float(c['max_score'])} for c in columns]
        return data


def _roster(school, ids):
    found = {s.id: s for s in Student.objects.filter(school=school, id__in=ids).select_related('user')}
    rows = []
    for sid in ids:
        s = found.get(sid)
        if s is None:
            raise serializers.ValidationError({'student_ids': 'Some students are not in your school.'})
        rows.append({'student_id': str(s.id), 'name': s.display_name if hasattr(s, 'display_name') else str(s),
                     'matricule': s.display_matricule})
    return rows


class SheetCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated, CanScanMarks]

    def post(self, request):
        ser = SheetCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        sheet = MarkSheet.objects.create(
            school=request.user.school, created_by=request.user, kind=d['kind'], title=d['title'],
            subtitle_lines=d.get('subtitle_lines', []), max_score=d['columns'][0]['max'], columns=d['columns'],
            scope=d.get('scope', {}), rows=_roster(request.user.school, d['student_ids']))
        return Response({'id': str(sheet.id), 'pdf_url': f'/api/v1/marksheets/{sheet.id}/pdf/', 'rows': sheet.rows,
                         'columns': sheet.column_list}, status=status.HTTP_201_CREATED)


def _mine(request, pk):
    return get_object_or_404(MarkSheet, pk=pk, school=request.user.school)


class SheetPdfView(APIView):
    permission_classes = [permissions.IsAuthenticated, CanScanMarks]

    def get(self, request, pk):
        sheet = _mine(request, pk)
        response = HttpResponse(build_pdf(sheet), content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="marksheet-{str(sheet.id)[:8]}.pdf"'
        return response


class SheetReadView(APIView):
    """Photos in, readings out. Nothing is stored; the teacher confirms before anything is saved."""

    permission_classes = [permissions.IsAuthenticated, CanScanMarks]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, pk):
        sheet = _mine(request, pk)
        files = request.FILES.getlist('photos') or request.FILES.getlist('photo')
        if not files:
            return Response({'detail': 'Add at least one photo of the filled sheet.'}, status=400)
        if len(files) > MAX_PHOTOS:
            return Response({'detail': f'Send at most {MAX_PHOTOS} photos at a time.'}, status=400)
        rows, problems, seen = {}, [], set()
        for f in files:
            if f.size > MAX_PHOTO_BYTES:
                problems.append({'file': f.name, 'detail': 'This photo is too large.'})
                continue
            try:
                page = straighten(f.read())
                if page.sheet_id != str(sheet.id):
                    raise SheetReadError('This photo belongs to a different sheet. Use the sheet you printed for this class.')
                if page.number in seen:
                    raise SheetReadError(f'Page {page.number} was already added.')
                result = read_page(page, sheet)
            except SheetReadError as exc:
                problems.append({'file': f.name, 'detail': str(exc)})
                continue
            seen.add(page.number)
            for row in result['rows']:
                rows[row['row']] = row
        from .layout import pages_needed
        pages = pages_needed(len(sheet.rows))
        return Response({'rows': [rows[i] for i in sorted(rows)], 'pages_read': sorted(seen), 'pages_total': pages,
                         'problems': problems, 'columns': sheet.column_list})


class SheetImportView(APIView):
    """Marks from Excel/CSV or pasted text, matched to the sheet's students."""

    permission_classes = [permissions.IsAuthenticated, CanScanMarks]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request, pk):
        sheet = _mine(request, pk)
        upload = request.FILES.get('file')
        try:
            if upload:
                if upload.size > 5 * 1024 * 1024:
                    return Response({'detail': 'This file is too large.'}, status=400)
                table = importer.parse_table(upload.read(), upload.name)
            else:
                text = str(request.data.get('text') or '')
                if not text.strip():
                    return Response({'detail': 'Choose a file or paste the marks.'}, status=400)
                table = importer.parse_table(text[:200000])
        except Exception:
            return Response({'detail': 'This file could not be read. Use an Excel (.xlsx) or CSV file.'}, status=400)
        return Response(importer.match_rows(table, sheet))
