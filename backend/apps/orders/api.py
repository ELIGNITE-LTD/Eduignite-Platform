"""Public surface of the orders app for other apps (see core/tests/test_module_boundaries.py)."""

from .notifications import (  # noqa: F401
    executive_recipients,
    notify_linked_school_pending,
    notify_order_processed,
    notify_order_received,
    notify_school_activated,
)

# Building blocks for other apps approved-event emails (idempotent, after commit, never raises).
from .notifications import (  # noqa: E402,F401
    _after_commit as after_commit,
    _clean as clean_line,
    _page as email_page,
    _send_once as send_once,
    _text as email_text,
)
