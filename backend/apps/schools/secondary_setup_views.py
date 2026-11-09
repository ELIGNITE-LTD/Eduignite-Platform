"""Endpoints behind the SECONDARY / HIGHER "Hierarchy & Sections" overview.

Same access model as the existing hierarchy endpoints (SCHOOL_ADMIN: whole school, SUB_ADMIN:
only their sub-school(s), platform executives: read, or write with the schools module). Every
query is filtered by the managed school. Nursery / primary schools are refused (400): they use
``hierarchy_setup_views``.
"""

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from . import secondary_setup as sec
from .models import SchoolClass, SubSchool
from .serializers import SchoolClassSerializer
from .views import HierarchyAccessMixin

User = get_user_model()


def _bad(detail, code=status.HTTP_400_BAD_REQUEST):
    return Response({'detail': detail}, status=code)


class _SecondaryView(HierarchyAccessMixin, APIView):
    def _context(self):
        school, error = self._ensure_hierarchy_access()
        if error:
            return None, error
        if getattr(school, 'education_category', None) == 'higher':
            return None, _bad(
                'The class ladder does not apply to higher education institutions: use programmes instead.',
                status.HTTP_403_FORBIDDEN,
            )
        if not sec.is_secondary_like(school):
            return None, _bad('This overview is only for secondary schools.')
        return school, None

    def get_serializer_context(self):
        return {'school': self._get_managed_school(), 'request': self.request}

    def _classes(self, school):
        qs = SchoolClass.objects.filter(school=school).select_related('sub_school', 'class_master')
        managed = self._managed_sub_school_ids()
        return qs if managed is None else qs.filter(sub_school_id__in=managed)

    def _pick_classes(self, school, data):
        qs = self._classes(school)
        if data.get('all'):
            return list(qs.order_by('name'))
        ids = data.get('classes') or []
        if not isinstance(ids, list) or not ids:
            return None
        return list(qs.filter(id__in=ids).order_by('name'))


class SecondarySetupSummaryView(_SecondaryView):
    def get(self, request):
        school, error = self._context()
        if error:
            return error
        return Response(sec.secondary_summary(school, self._managed_sub_school_ids()))


class SecondaryQuickSetupView(_SecondaryView):
    """POST {sub_school?, language?: en|fr, cycles?: [first, second]}: add the standard classes.

    Optional and idempotent: existing names are reused, nothing is renamed or moved, and no
    subject is ever created."""

    def post(self, request):
        school, error = self._context()
        if error:
            return error
        sections = SubSchool.objects.filter(school=school)
        managed = self._managed_sub_school_ids()
        if managed is not None:
            sections = sections.filter(id__in=managed)
        section_id = request.data.get('sub_school')
        if section_id:
            section = sections.filter(id=section_id).first()
            if not section:
                return _bad('Pick one of your sections.')
        elif managed is not None or sections.count() > 1:
            return _bad('Say which section these classes belong to.')
        else:
            section = sections.first()
        language = request.data.get('language')
        if language not in ('en', 'fr'):
            language = sec.ladder_language(school, section)
        cycles = [c for c in (request.data.get('cycles') or []) if c in ('first', 'second')] or None
        result = sec.bulk_create_classes(school, section, language, cycles)
        ser = lambda rows: SchoolClassSerializer(rows, many=True, context=self.get_serializer_context()).data  # noqa: E731
        return Response(
            {'created': ser(result['created']), 'existing': ser(result['existing'])},
            status=status.HTTP_201_CREATED if result['created'] else status.HTTP_200_OK,
        )


class SecondaryBulkSubjectsView(_SecondaryView):
    """POST: add typed subjects to classes ('custom') or copy another class's subjects ('copy').

    There are NO default subjects: schools create their own. Existing links are never changed."""

    def post(self, request):
        school, error = self._context()
        if error:
            return error
        mode = request.data.get('mode')
        targets = self._pick_classes(school, request.data)
        if targets is None:
            return _bad('Pick the classes (or choose all classes).')
        if not targets:
            return _bad('No matching class in your school.', status.HTTP_404_NOT_FOUND)
        if mode == 'custom':
            raw = request.data.get('subjects')
            items = []
            for i in (raw if isinstance(raw, list) else []):
                if not isinstance(i, dict) or not str(i.get('name') or '').strip():
                    continue
                coefficient = i.get('coefficient')
                if coefficient not in (None, ''):
                    try:
                        if float(coefficient) <= 0:
                            return _bad('A coefficient must be greater than zero.')
                    except (TypeError, ValueError):
                        return _bad('A coefficient must be a number.')
                items.append({'name': str(i.get('name')).strip(), 'code': i.get('code') or '',
                              'coefficient': coefficient, 'type': i.get('type')})
            if not items:
                return _bad('Give at least one subject name.')
            if len(items) > sec.MAX_BULK:
                return _bad(f'At most {sec.MAX_BULK} subjects at a time.')
            return Response(sec.apply_subjects(school, targets, items))
        if mode == 'copy':
            source = self._classes(school).filter(id=request.data.get('from_class')).first()
            if not source:
                return _bad('Pick the class to copy from.')
            return Response(sec.copy_subjects(source, targets, with_teachers=bool(request.data.get('with_teachers'))))
        return _bad('mode must be custom or copy.')


class SecondarySubjectTeacherView(_SecondaryView):
    """POST {subject, teacher: id | null, classes: [..] | all}: one teacher for the same subject in many classes."""

    def post(self, request):
        from apps.grades.models import Subject

        school, error = self._context()
        if error:
            return error
        subject = Subject.objects.filter(school=school, id=request.data.get('subject')).first()
        if not subject:
            return _bad('Pick one of your subjects.')
        teacher = None
        if request.data.get('teacher'):
            teacher = User.objects.filter(
                id=request.data.get('teacher'), school=school, role__in=sec.TEACHING_ROLES, is_teacher_twin=False,
            ).first()
            if not teacher:
                return _bad('The teacher must be an academic staff member of this school.')
        targets = self._pick_classes(school, request.data)
        if targets is None:
            return _bad('Pick the classes (or choose all classes).')
        if not targets:
            return _bad('No matching class in your school.', status.HTTP_404_NOT_FOUND)
        return Response(sec.set_subject_teacher(school, subject, teacher, targets))
