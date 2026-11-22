"""Kind of a Basic Education school: nursery, primary or the legacy "both".

The kind is not a new education category (that stays ``basic``). It lives in
``SchoolSettings.sections``: ``['nursery']`` is a nursery school, ``['primary']``
a primary school, ``[]`` or both is the legacy "Nursery & Primary" school.
This module is the single place that applies that rule.
"""

KIND_NURSERY = 'nursery'
KIND_PRIMARY = 'primary'
KIND_BASIC = 'basic'
BASIC_SECTION_CHOICES = (KIND_NURSERY, KIND_PRIMARY)


def kind_from_sections(education_category, sections):
    """'nursery' | 'primary' | 'basic' for basic schools, None for the others."""
    if education_category != 'basic':
        return None
    cleaned = [s for s in (sections or []) if s in BASIC_SECTION_CHOICES]
    unique = set(cleaned)
    if unique == {KIND_NURSERY}:
        return KIND_NURSERY
    if unique == {KIND_PRIMARY}:
        return KIND_PRIMARY
    return KIND_BASIC


def school_kind(school):
    """Kind of ``school`` (see :func:`kind_from_sections`)."""
    if school is None:
        return None
    category = getattr(school, 'education_category', None)
    if category != 'basic':
        return None
    pending = getattr(school, 'pending_basic_section', None)
    if pending in BASIC_SECTION_CHOICES:
        # Set by SchoolCreateSerializer: the post_save seeding runs before the settings row exists.
        return pending
    from .models import SchoolSettings

    # Fresh query: the cached ``school.settings`` can be stale after an update.
    sections = SchoolSettings.objects.filter(school=school).values_list('sections', flat=True).first() or []
    return kind_from_sections(category, sections)


def offers_nursery(school) -> bool:
    return school_kind(school) in (KIND_NURSERY, KIND_BASIC)


def offers_primary(school) -> bool:
    return school_kind(school) in (KIND_PRIMARY, KIND_BASIC)


def _is_nursery_class(klass) -> bool:
    level = getattr(klass, 'level', None) if getattr(klass, 'level_id', None) else None
    if level is not None:
        return level.cycle == 'nursery'
    name = (getattr(klass, 'name', '') or '').lower()
    return 'nurs' in name or 'mater' in name or 'creche' in name or 'crèche' in name


def runs_nursery_only(school, classes=None) -> bool:
    """True for a nursery school, and also for a legacy "Nursery & Primary" school whose classes are all nursery classes.

    Such a school has no primary section to move pupils into, so its last nursery class is its final class and
    those pupils graduate instead of waiting for a next class that will never exist.
    """
    kind = school_kind(school)
    if kind == KIND_NURSERY:
        return True
    if kind != KIND_BASIC:
        return False
    if classes is None:
        from .models import SchoolClass

        classes = list(SchoolClass.objects.filter(school=school).select_related('level'))
    classes = list(classes)
    return bool(classes) and all(_is_nursery_class(c) for c in classes)
