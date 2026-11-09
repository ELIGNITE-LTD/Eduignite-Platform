"""Endpoints behind the Basic Education "Hierarchy & Sections" hub.

Access mirrors the existing hierarchy endpoints: SCHOOL_ADMIN (whole school),
SUB_ADMIN (only their sub-school(s)) and platform executives (read, or write
with the schools module). Every query is filtered by the managed school.
"""

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from . import hierarchy_setup as setup
from .class_teacher_rules import TeacherAlreadyHasClass, wants_reassign
from .models import SchoolClass, SubSchool
from .serializers import SchoolClassSerializer
from .views import HierarchyAccessMixin

User = get_user_model()
MAX_BULK = 60


def _bad(detail, code=status.HTTP_400_BAD_REQUEST):
    return Response({'detail': detail}, status=code)


class _HubView(HierarchyAccessMixin, APIView):
    """Common access check: a managed, basic-education school."""

    def _context(self):
        school, error = self._ensure_hierarchy_access()
        if error:
            return None, error
        if not setup.is_basic(school):
            return None, _bad('The hierarchy setup hub is only for nursery and primary schools.')
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


class SetupSummaryView(_HubView):
    def get(self, request):
        school, error = self._context()
        if error:
            return error
        return Response(setup.setup_summary(school, self._managed_sub_school_ids()))


class BulkClassesView(_HubView):
    """POST {sub_school, names: [..]}: create missing classes inside one section (idempotent)."""

    def post(self, request):
        school, error = self._context()
        if error:
            return error
        names = request.data.get('names')
        if not isinstance(names, list) or not names:
            return _bad('Give at least one class name.')
        if len(names) > MAX_BULK:
            return _bad(f'At most {MAX_BULK} classes at a time.')
        sections = SubSchool.objects.filter(school=school)
        managed = self._managed_sub_school_ids()
        if managed is not None:
            sections = sections.filter(id__in=managed)
        section_id = request.data.get('sub_school')
        if section_id:
            section = sections.filter(id=section_id).first()
            if not section:
                return _bad('Pick one of your sections.')
        else:
            if managed is not None or sections.count() > 1:
                return _bad('Say which section these classes belong to.')
            section = sections.first() or (setup.ensure_default_sections(school) or [None])[0]
        result = setup.bulk_create_classes(school, section, names)
        ser = lambda rows: SchoolClassSerializer(rows, many=True, context=self.get_serializer_context()).data  # noqa: E731
        return Response(
            {'created': ser(result['created']), 'existing': ser(result['existing'])},
            status=status.HTTP_201_CREATED if result['created'] else status.HTTP_200_OK,
        )


class BulkClassSubjectsView(_HubView):
    """POST: apply the default template, a custom list, or copy another class's subjects."""

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
        if mode == 'template':
            return Response(setup.apply_subject_template(school, targets))
        if mode == 'custom':
            raw = request.data.get('subjects')
            items = [
                {'name': str(i.get('name') or '').strip(), 'code': i.get('code') or '', 'coefficient': i.get('coefficient')}
                for i in (raw if isinstance(raw, list) else []) if isinstance(i, dict) and str(i.get('name') or '').strip()
            ]
            if not items:
                return _bad('Give at least one subject name.')
            return Response(setup.apply_subject_template(school, targets, items))
        if mode == 'copy':
            source = self._classes(school).filter(id=request.data.get('from_class')).first()
            if not source:
                return _bad('Pick the class to copy from.')
            return Response(setup.copy_class_subjects(school, source, targets))
        return _bad('mode must be template, custom or copy.')


class QuickSetupView(_HubView):
    """Wizard for an empty school: languages + class range + default subjects, in one go."""

    def post(self, request):
        school, error = self._context()
        if error:
            return error
        if self._managed_sub_school_ids() is not None:
            return _bad('Only the head of the school can run the quick setup.', status.HTTP_403_FORBIDDEN)
        langs = [l for l in (request.data.get('languages') or []) if l in ('en', 'fr')]
        if not langs:
            return _bad('Choose English, French or both.')
        nursery = bool(request.data.get('nursery', True))
        primary = bool(request.data.get('primary', True))
        if not (nursery or primary):
            return _bad('Choose nursery, primary or both.')
        apply_subjects = bool(request.data.get('subjects', True))
        from django.db import transaction

        created_classes, existing_classes, sections = [], [], []
        with transaction.atomic():
            for lang in dict.fromkeys(langs):
                section = setup.ensure_section_by_language(school, lang)
                sections.append(section)
                result = setup.bulk_create_classes(
                    school, section, setup.class_names_for(lang, nursery=nursery, primary=primary),
                )
                created_classes += result['created']
                existing_classes += result['existing']
            template = {'created': 0, 'existing': 0}
            if apply_subjects:
                touched = [c for c in created_classes + existing_classes if c.sub_school_id in {s.id for s in sections}]
                template = setup.apply_subject_template(school, touched)
        return Response({
            'sections': [{'id': str(s.id), 'name': s.name} for s in sections],
            'classes_created': [c.name for c in created_classes],
            'classes_existing': [c.name for c in existing_classes],
            'subjects_created': template['created'],
            'subjects_existing': template['existing'],
            'summary': setup.setup_summary(school),
        }, status=status.HTTP_201_CREATED if created_classes else status.HTTP_200_OK)


class SetClassTeacherView(_HubView):
    """POST {teacher: id | null, reassign?: bool}: the class teacher (class master + lead assignment).

    One class per teacher: a teacher already holding another class gets a 409 naming it;
    ``reassign=true`` (admin confirmed) moves them atomically.
    """

    def post(self, request, pk):
        school, error = self._context()
        if error:
            return error
        klass = self._classes(school).filter(pk=pk).first()
        if not klass:
            return _bad('Class not found.', status.HTTP_404_NOT_FOUND)
        teacher_id = request.data.get('teacher')
        teacher = None
        if teacher_id:
            teacher = User.objects.filter(
                id=teacher_id, school=school, role='TEACHER', is_teacher_twin=False,
            ).first()
            if not teacher:
                return _bad('The class teacher must be a teacher of this school.')
        year = getattr(getattr(school, 'settings', None), 'academic_year', '') or ''
        try:
            moved = setup.set_class_teacher(
                klass, teacher, academic_year=year, reassign=wants_reassign(request),
                managed_sub_school_ids=self._managed_sub_school_ids(),
            )
        except TeacherAlreadyHasClass as exc:
            return Response({'detail': str(exc.detail), 'message': str(exc.detail), **exc.extra},
                            status=status.HTTP_409_CONFLICT)
        klass.refresh_from_db()
        data = SchoolClassSerializer(klass, context={'school': school}).data
        data['moved_from'] = [{'id': str(c.id), 'name': c.name} for c in moved]
        return Response(data)
