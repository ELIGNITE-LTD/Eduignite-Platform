"""Server-side filters for the executive Schools tab.

Applied by ``SchoolViewSet`` only for platform executives; school-level users
are already scoped to their own school and never see these filters change what
they may read. Query params (each accepts a comma separated list):

* ``education_category`` basic | secondary | higher
* ``school_type``        general | technical | mixed
* ``level``              nursery | primary | secondary | higher
* ``subsystem``          anglophone | francophone | bilingual
* ``status``             active | pending | suspended
* ``q``                  text search (name, id, short name, principal, location, email)

``status=pending`` also lists legacy schools (from the removed linked-account flow) that are
waiting in Drafts for EduIgnite to activate them (``AWAITING_ACTIVATION``).
"""

from django.db.models import Count, Q

from .models import School

STATUS_VALUES = {'active': 'Active', 'pending': 'Pending', 'suspended': 'Suspended'}
LEVEL_VALUES = ('nursery', 'primary', 'secondary', 'higher')

# A school that was created from a (now removed) linked-account flow sits in
# Drafts with no deletion date until EduIgnite activates it. No code creates
# such schools any more, but any that already exist stay visible and
# restorable.
AWAITING_ACTIVATION = Q(is_drafted=True, status='Pending', draft_delete_after__isnull=True)


def _values(params, key, allowed=None):
    raw = params.get(key) or ''
    out = []
    for part in str(raw).split(','):
        part = part.strip().lower()
        if part and (allowed is None or part in allowed) and part not in out:
            out.append(part)
    return out


def wants_pending(params) -> bool:
    return 'pending' in _values(params, 'status', STATUS_VALUES)


def apply_school_filters(queryset, params, *, skip=()):
    """Narrow ``queryset`` by the executive filters present in ``params``.

    ``skip`` names filters to leave out (used to count a facet against every
    other active filter).
    """
    if 'education_category' not in skip:
        values = _values(params, 'education_category', {c for c, _ in School.EDUCATION_CATEGORY_CHOICES})
        if values:
            queryset = queryset.filter(education_category__in=values)
    if 'school_type' not in skip:
        values = _values(params, 'school_type', {c for c, _ in School.SCHOOL_TYPE_CHOICES})
        if values:
            queryset = queryset.filter(school_type__in=values)
    if 'subsystem' not in skip:
        values = _values(params, 'subsystem', {c for c, _ in School.SUBSYSTEM_CHOICES})
        if values:
            queryset = queryset.filter(subsystem__in=values)
    if 'level' not in skip:
        values = _values(params, 'level', LEVEL_VALUES)
        if values:
            cond = Q()
            for level in values:
                if level in ('nursery', 'primary'):
                    # A basic school that never set its sections offers both
                    # (the app defaults to nursery + primary), so it matches too.
                    cond |= Q(education_category=School.EDUCATION_CATEGORY_BASIC) & (
                        Q(settings__sections__contains=[level])
                        | Q(settings__sections=[])
                        | Q(settings__isnull=True)
                    )
                else:
                    cond |= Q(education_category=level)
            queryset = queryset.filter(cond)
    if 'status' not in skip:
        values = _values(params, 'status', STATUS_VALUES)
        if values:
            queryset = queryset.filter(status__in=[STATUS_VALUES[v] for v in values])
    if 'q' not in skip:
        query = str(params.get('q') or params.get('search') or '').strip()
        if query:
            queryset = queryset.filter(
                Q(name__icontains=query) | Q(id__icontains=query) | Q(short_name__icontains=query)
                | Q(principal__icontains=query) | Q(location__icontains=query) | Q(email__icontains=query)
            )
    return queryset


def school_facets(base, params):
    """Counts per category for the filter chips.

    Each facet is counted against every OTHER active filter, so a chip shows how
    many schools it would give if chosen.
    """
    def counts(field):
        rows = (apply_school_filters(base, params, skip=(field,))
                .order_by().values(field).annotate(n=Count('id', distinct=True)))
        return {row[field]: row['n'] for row in rows}

    levels = {}
    for level in LEVEL_VALUES:
        probe = {key: params.get(key) for key in params.keys()}
        probe['level'] = level
        levels[level] = apply_school_filters(base, probe).distinct().count()
    return {
        'total': apply_school_filters(base, params).distinct().count(),
        'education_category': counts('education_category'),
        'school_type': counts('school_type'),
        'subsystem': counts('subsystem'),
        'status': {k.lower(): v for k, v in counts('status').items()},
        'level': levels,
    }
