from rest_framework.pagination import PageNumberPagination, LimitOffsetPagination, CursorPagination


class StandardResultsSetPagination(PageNumberPagination):
    """Standard pagination: 20 items per page by default.

    Clients ask for a bigger page with ``page_size`` (or its alias ``limit``,
    which the web/mobile/desktop apps have always sent). The ceiling is
    ``max_page_size``; a request above it is clamped, so callers that need a
    complete list must follow ``next`` (see the ``fetchAllPages`` helper in the
    apps) rather than assume one page holds everything.
    """

    page_size = 20
    page_size_query_param = 'page_size'
    page_size_query_description = 'Number of results to return per page.'
    max_page_size = 1000
    page_query_description = 'A page number within the paginated result set.'
    limit_query_param = 'limit'

    def get_page_size(self, request):
        size = super().get_page_size(request)
        if request.query_params.get(self.page_size_query_param) not in (None, ''):
            return size
        raw = request.query_params.get(self.limit_query_param)
        if raw in (None, ''):
            return size
        try:
            value = int(raw)
        except (TypeError, ValueError):
            return size
        if value < 1:
            return size
        return min(value, self.max_page_size)


class LargeResultsSetPagination(PageNumberPagination):
    """Large pagination with 100 items per page."""

    page_size = 100
    page_size_query_param = 'page_size'
    page_size_query_description = 'Number of results to return per page.'
    max_page_size = 1000


class ChatMessageCursorPagination(CursorPagination):
    """Cursor-based pagination for chat messages."""

    page_size = 50
    page_size_query_param = 'page_size'
    page_size_query_description = 'Number of results to return per page.'
    max_page_size = 100
    ordering = '-created_at'
    template = None


class NotificationPagination(PageNumberPagination):
    """Pagination for notifications with 50 items per page."""

    page_size = 50
    page_size_query_param = 'page_size'
    page_size_query_description = 'Number of results to return per page.'
    max_page_size = 500


class ReportPagination(LimitOffsetPagination):
    """Limit/offset pagination for reports."""

    default_limit = 20
    limit_query_param = 'limit'
    limit_query_description = 'Number of results to return.'
    offset_query_param = 'offset'
    offset_query_description = 'The initial index from which to return the results.'
    max_limit = 1000
