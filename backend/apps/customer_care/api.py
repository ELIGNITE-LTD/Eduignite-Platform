"""Public surface of Customer Care for other apps (module-boundary convention).

Other apps import from here, never from ``apps.customer_care.models`` or ``services``.
"""

from .access import MODULE_KEY, has_customer_care_access, is_founder, visible_conversations  # noqa: F401
from .contact import public_items as public_contact_items  # noqa: F401
from .services import audit  # noqa: F401
