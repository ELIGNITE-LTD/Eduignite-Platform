"""Catalog of executive activities the founders (CEO/CTO) can assign.

Each key names one area of work an executive account can be given access to.
CEO and CTO always have everything; every other executive sees the shared
default tabs (overview, profile, notifications, chat, AI assistant) plus only
the activities assigned to them here.

Keep this list in sync with the frontend catalog at
apps/*/src/lib/executive-modules.ts and the `module` keys on the sidebar nav.
"""

EXECUTIVE_MODULES = [
    ('schools', 'Schools - add and manage schools'),
    ('support', 'Support registry'),
    ('testimonials', 'Testimonials'),
    ('flyer_qr', 'Flyer QR'),
    ('portfolio_policy', 'Portfolio & Policy (branding / marketing)'),
    ('log_post', 'Log posts (blog)'),
    ('academy', 'Academy admin'),
    ('partners', 'Partners programme (admin)'),
    ('app_registry', 'App registry'),
    ('ai_economics', 'AI economics'),
    ('community', 'Community portal'),
    ('announcements', 'Announcements'),
    ('surveys', 'Surveys'),
    ('feedback', 'Feedback'),
    ('draft', 'Drafts'),
]

EXECUTIVE_MODULE_KEYS = {key for key, _ in EXECUTIVE_MODULES}


def clean_modules(value):
    """Return a de-duplicated list of known module keys, order preserved."""
    if not isinstance(value, (list, tuple)):
        return []
    seen = []
    for item in value:
        key = str(item).strip()
        if key in EXECUTIVE_MODULE_KEYS and key not in seen:
            seen.append(key)
    return seen
