"""Endpoints behind the Basic Education "Hierarchy & Sections" hub.

Access mirrors the existing hierarchy endpoints: SCHOOL_ADMIN (whole school),
SUB_ADMIN (only their sub-school(s)) and platform executives (read, or write
with the schools module). Every query is filtered by the managed school.
"""

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from . import class_levels
from . import hierarchy_setup as setup
from .class_teacher_rules import TeacherAlreadyHasClass, wants_reassign
from .models import ClassLevel, SchoolClass, SubSchool
from .serializers import ClassLevelSerializer, SchoolClassSerializer
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
        # Levels need no configuration: the standard ladder of each section is created on first use.
        class_levels.ensure_levels_for_school(school)
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
    """POST: create classes inside one section (idempotent).

    Either ``{sub_school, names: [..]}`` (free names; a name that reads as a level is placed in it)
    or ``{sub_school, level, streams: ['A','B'] | count: 3}`` ("create 3 classes for Class 1").
    """

    def post(self, request):
        school, error = self._context()
        if error:
            return error
        names = request.data.get('names')
        level = None
        count = None
        level_id = request.data.get('level')
        if level_id:
            level = ClassLevel.objects.filter(school=school, id=level_id).first()
            if not level:
                return _bad('Pick one of your levels.')
            streams = request.data.get('streams')
            count = request.data.get('count')
            if streams is not None and not isinstance(streams, list):
                return _bad('streams must be a list such as ["A", "B"].')
            try:
                count = int(count) if count not in (None, '') else None
            except (TypeError, ValueError):
                return _bad('count must be a number.')
            if not streams and not count:
                count = 1
            if (streams and len(streams) > class_levels.MAX_BULK_STREAMS) or (count and count > class_levels.MAX_BULK_STREAMS):
                return _bad(f'At most {class_levels.MAX_BULK_STREAMS} classes at a time.')
        else:
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
        ser = lambda rows: SchoolClassSerializer(rows, many=True, context=self.get_serializer_context()).data  # noqa: E731
        if level:
            result = class_levels.create_classes_in_level(
                school, level, section, streams=request.data.get('streams') or None, count=count,
            )
            return Response(
                {'created': ser(result['created']), 'existing': ser(result['existing']),
                 'adopted': ser(result['adopted']), 'conflicts': result['conflicts']},
                status=status.HTTP_201_CREATED if result['created'] else status.HTTP_200_OK,
            )
        result = setup.bulk_create_classes(school, section, names)
        return Response(
            {'created': ser(result['created']), 'existing': ser(result['existing'])},
            status=status.HTTP_201_CREATED if result['created'] else status.HTTP_200_OK,
        )


class BulkClassSubjectsView(_HubView):
    """POST: add typed subjects to classes ('custom') or copy another class's subjects ('copy').

    There are NO default subjects: schools create their own."""

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
            items = [
                {'name': str(i.get('name') or '').strip(), 'code': i.get('code') or '', 'coefficient': i.get('coefficient')}
                for i in (raw if isinstance(raw, list) else []) if isinstance(i, dict) and str(i.get('name') or '').strip()
            ]
            if not items:
                return _bad('Give at least one subject name.')
            return Response(setup.apply_subject_list(school, targets, items))
        if mode == 'copy':
            source = self._classes(school).filter(id=request.data.get('from_class')).first()
            if not source:
                return _bad('Pick the class to copy from.')
            return Response(setup.copy_class_subjects(school, source, targets))
        return _bad('mode must be custom or copy.')


class QuickSetupView(_HubView):
    """Wizard for an empty school: languages + class range -> levels and one class per level.

    No subjects are created: the school adds its own afterwards."""

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
        from django.db import transaction

        created_classes, existing_classes, sections = [], [], []
        with transaction.atomic():
            class_levels.ensure_default_levels(school, list(dict.fromkeys(langs)), nursery=nursery, primary=primary)
            for lang in dict.fromkeys(langs):
                section = setup.ensure_section_by_language(school, lang)
                sections.append(section)
                result = setup.bulk_create_classes(
                    school, section, setup.class_names_for(lang, nursery=nursery, primary=primary),
                )
                created_classes += result['created']
                existing_classes += result['existing']
        return Response({
            'sections': [{'id': str(s.id), 'name': s.name} for s in sections],
            'classes_created': [c.name for c in created_classes],
            'classes_existing': [c.name for c in existing_classes],
            'summary': setup.setup_summary(school),
        }, status=status.HTTP_201_CREATED if created_classes else status.HTTP_200_OK)


class LevelListView(_HubView):
    """GET the school's levels (with class and pupil counts); POST a new level (head only)."""

    def get(self, request):
        school, error = self._context()
        if error:
            return error
        rows = {r['id']: r for r in setup.setup_summary(school, self._managed_sub_school_ids())['levels']}
        levels = list(class_levels.levels_of(school))
        sections = list(SubSchool.objects.filter(school=school))
        data = ClassLevelSerializer(levels, many=True).data
        for item, level in zip(data, levels):
            item.update({k: rows.get(str(item['id']), {}).get(k, 0) for k in ('classes', 'pupils')})
            item['sections'] = class_levels.level_section_ids(school, level, sections)
        return Response(data)

    def post(self, request):
        school, error = self._context()
        if error:
            return error
        if self._managed_sub_school_ids() is not None:
            return _bad('Only the head of the school can manage levels.', status.HTTP_403_FORBIDDEN)
        ser = ClassLevelSerializer(data=request.data, context={'school': school})
        ser.is_valid(raise_exception=True)
        level = class_levels.create_level(school, **ser.validated_data)
        return Response(ClassLevelSerializer(level).data, status=status.HTTP_201_CREATED)


class LevelDetailView(_HubView):
    """PATCH rename / change a level; DELETE only when no class uses it (head only)."""

    def patch(self, request, pk):
        school, error = self._context()
        if error:
            return error
        if self._managed_sub_school_ids() is not None:
            return _bad('Only the head of the school can manage levels.', status.HTTP_403_FORBIDDEN)
        level = ClassLevel.objects.filter(school=school, pk=pk).first()
        if not level:
            return _bad('Level not found.', status.HTTP_404_NOT_FOUND)
        old_name = level.name
        ser = ClassLevelSerializer(level, data=request.data, partial=True, context={'school': school})
        ser.is_valid(raise_exception=True)
        from django.db import transaction

        with transaction.atomic():
            level = ser.save()
            renamed = class_levels.recompose_class_names(level) if level.name != old_name else 0
        data = ClassLevelSerializer(level).data
        data['classes_renamed'] = renamed
        return Response(data)

    def delete(self, request, pk):
        school, error = self._context()
        if error:
            return error
        if self._managed_sub_school_ids() is not None:
            return _bad('Only the head of the school can manage levels.', status.HTTP_403_FORBIDDEN)
        level = ClassLevel.objects.filter(school=school, pk=pk).first()
        if not level:
            return _bad('Level not found.', status.HTTP_404_NOT_FOUND)
        used = SchoolClass.objects.filter(level=level).count()
        if used:
            return _bad(f'{level.name} still has {used} class(es). Move or delete them first.')
        level.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class LevelReorderView(_HubView):
    """POST {ids: [..]}: set the order of the levels (head only)."""

    def post(self, request):
        school, error = self._context()
        if error:
            return error
        if self._managed_sub_school_ids() is not None:
            return _bad('Only the head of the school can manage levels.', status.HTTP_403_FORBIDDEN)
        ids = request.data.get('ids')
        if not isinstance(ids, list) or not ids:
            return _bad('Give the level ids in the new order.')
        return Response(ClassLevelSerializer(class_levels.reorder_levels(school, ids), many=True).data)


class LevelSeedView(_HubView):
    """POST: add the standard nursery / primary levels that are missing (idempotent, head only)."""

    def post(self, request):
        school, error = self._context()
        if error:
            return error
        if self._managed_sub_school_ids() is not None:
            return _bad('Only the head of the school can manage levels.', status.HTTP_403_FORBIDDEN)
        langs = [l for l in (request.data.get('languages') or []) if l in ('en', 'fr')] or None
        result = class_levels.ensure_default_levels(
            school, langs, nursery=bool(request.data.get('nursery', True)), primary=bool(request.data.get('primary', True)),
        )
        return Response(
            {'created': ClassLevelSerializer(result['created'], many=True).data, 'existing': len(result['existing'])},
            status=status.HTTP_201_CREATED if result['created'] else status.HTTP_200_OK,
        )


class AssignClassLevelView(_HubView):
    """POST {level, stream?}: put an unleveled class in a level WITHOUT renaming it.

    The stream defaults to what follows the level in the class name ("Class 3 A" -> "A")."""

    def post(self, request, pk):
        school, error = self._context()
        if error:
            return error
        klass = self._classes(school).filter(pk=pk).first()
        if not klass:
            return _bad('Class not found.', status.HTTP_404_NOT_FOUND)
        level = ClassLevel.objects.filter(school=school, id=request.data.get('level')).first()
        if not level:
            return _bad('Pick one of your levels.')
        if 'stream' in request.data:
            stream = class_levels.clean_stream(request.data.get('stream'))
        else:
            _stage, _lang, stream = class_levels.parse_basic_class_name(klass.name)
        if SchoolClass.objects.filter(school=school, level=level, stream__iexact=stream).exclude(pk=klass.pk).exists():
            return _bad(f'{class_levels.compose_class_name(level, stream)} already exists. Pick another letter.')
        SchoolClass.objects.filter(pk=klass.pk).update(level=level, stream=stream, cycle=level.cycle)
        klass.refresh_from_db()
        from apps.students import api as students_api

        students_api.sync_class_students(klass)
        return Response(SchoolClassSerializer(klass, context={'school': school}).data)


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
