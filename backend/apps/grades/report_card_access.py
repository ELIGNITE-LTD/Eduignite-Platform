"""Who may generate / print / download report cards.

Product rule (all school levels): only the principal side of the school
generates report cards. Teachers (class teachers and subject teachers alike)
enter marks, nursery ratings and comments but can never render a printable
card, a PDF, or a transcript. Students and parents keep reading their own
PUBLISHED card; that path is unchanged and is enforced in the views.

Decision on SUB_ADMIN (vice principal / section head): kept as today. They run
a section of the school and already publish its cards, so removing their
access would silently break secondary schools in production. Only teachers are
denied. Flip ``CARD_GENERATING_ROLES`` if the owner later wants principal-only.
"""

from rest_framework.exceptions import PermissionDenied

DENIED_MESSAGE = 'Only the principal generates report cards.'

# Roles that are refused every report-card generation endpoint.
CARD_DENIED_ROLES = frozenset({'TEACHER'})


def teacher_blocked_from_report_cards(user) -> bool:
    return getattr(user, 'role', None) in CARD_DENIED_ROLES


def ensure_not_teacher_for_report_cards(user, message=DENIED_MESSAGE) -> None:
    """Raise 403 (code ``report_cards_principal_only``) for teachers."""
    if teacher_blocked_from_report_cards(user):
        raise PermissionDenied(detail=message, code='report_cards_principal_only')
