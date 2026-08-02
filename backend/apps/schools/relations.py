from __future__ import annotations

from typing import Optional

from django.db.models import Q

from .models import School, SchoolClass


def resolve_school_class(
    school: School | None,
    *,
    school_class: SchoolClass | None = None,
    school_class_id: str | None = None,
    class_name: str | None = None,
) -> Optional[SchoolClass]:
    """Resolve a class for a school by FK first, then by ID, then by name."""
    if not school:
        return None

    if school_class is not None:
        return school_class if school_class.school_id == school.id else None

    if school_class_id:
        resolved = SchoolClass.objects.filter(id=school_class_id, school=school).first()
        if resolved:
            return resolved

    normalized_name = (class_name or "").strip()
    if normalized_name:
        return SchoolClass.objects.filter(school=school, name__iexact=normalized_name).first()

    return None


def build_class_match_q(relation_field: str, text_field: str, *, school_class_id=None, class_name: str | None = None) -> Q:
    query = Q()
    if school_class_id:
        query |= Q(**{relation_field: school_class_id})
    normalized_name = (class_name or "").strip()
    if normalized_name:
        query |= Q(**{text_field: normalized_name})
    return query
