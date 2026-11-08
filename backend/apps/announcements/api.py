"""Public read API of the announcements app for other apps."""


def recent_school_announcements(school_id, limit: int = 5) -> list:
    """The latest announcements a school itself published (not platform ones)."""
    from .models import Announcement

    rows = (
        Announcement.objects.filter(school_id=school_id)
        .exclude(target='PERSONAL')
        .order_by('-created_at')
        .values('id', 'title', 'target', 'created_at', 'is_pinned')[:limit]
    )
    return [
        {
            'id': str(row['id']), 'title': row['title'], 'target': row['target'],
            'created_at': row['created_at'].isoformat(), 'is_pinned': row['is_pinned'],
        }
        for row in rows
    ]
