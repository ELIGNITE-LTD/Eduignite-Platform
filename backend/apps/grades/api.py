"""Public read API of the grades app for other apps."""


def class_term_averages(school_id, academic_year: str | None = None) -> list:
    """Average mark per class / academic year / term for one school, in ONE query.

    Returns ``[{'class_name', 'academic_year', 'term', 'average', 'marks'}]``.
    Marks are on the school's own scale (see ``max_score``).
    """
    from django.db.models import Avg, Count

    from .models import Grade

    qs = Grade.objects.filter(school_id=school_id)
    if academic_year:
        qs = qs.filter(sequence__academic_year=academic_year)
    rows = (
        qs.order_by()
        .values('class_name_snapshot', 'sequence__academic_year', 'sequence__term')
        .annotate(average=Avg('score'), marks=Count('id'))
        .order_by('-sequence__academic_year', 'sequence__term', 'class_name_snapshot')
    )
    return [
        {
            'class_name': row['class_name_snapshot'],
            'academic_year': row['sequence__academic_year'],
            'term': row['sequence__term'],
            'average': round(float(row['average']), 2) if row['average'] is not None else None,
            'marks': row['marks'],
        }
        for row in rows
    ]


def max_score(school_id) -> float:
    """The top mark on this school's scale (20 by default)."""
    from .assessment_config import get_assessment_config

    return float(get_assessment_config(school_id).max_score)
