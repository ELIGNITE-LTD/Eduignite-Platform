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
    ('proprietors', 'Proprietors - create proprietor accounts and link schools to them'),
    ('platform_billing', 'Platform billing - per-student fee and school bills'),
    ('school_websites', 'School websites - publication status, force-unpublish and unlock'),
    ('customer_care', 'Customer Care - handle customer conversations assigned by the CEO'),
]

EXECUTIVE_MODULE_KEYS = {key for key, _ in EXECUTIVE_MODULES}

#: Plain-language name and what the module lets the executive do. Used in the
#: assignment emails; mirrors EXECUTIVE_MODULES in apps/*/src/lib/executive-modules.ts
#: (a test keeps the keys, labels and descriptions equal).
MODULE_INFO = {
    'schools': ('Schools', "Add schools to the system, manage them and their staff, and work on any school's records."),
    'proprietors': ('Proprietors', "Create proprietor accounts, link schools to them and reset their administrators' logins."),
    'school_websites': ('School websites', "See every school's website status, force a site offline and unlock it."),
    'support': ('Support registry', 'Handle support requests, contact messages and account requests.'),
    'testimonials': ('Testimonials', 'Review and publish testimonials.'),
    'flyer_qr': ('Flyer QR', 'Generate marketing flyers and QR codes.'),
    'portfolio_policy': ('Portfolio & Policy', 'Branding, marketing content, tutorials and platform policy.'),
    'platform_billing': ('Platform billing', "Set the per-student fee and deadlines, and follow each school's platform bill."),
    'log_post': ('Log posts', 'Write blog / log posts.'),
    'academy': ('Academy admin', 'Manage EduIgnite Academy courses and content.'),
    'partners': ('Partners (admin)', 'Administer the partner programme.'),
    'app_registry': ('App registry', 'Manage the app registry and the application store.'),
    'ai_economics': ('AI economics', 'See AI usage economics and revenue (changing prices stays with the founders).'),
    'community': ('Community portal', 'The executive community portal.'),
    'announcements': ('Announcements', 'Publish announcements and managed notifications.'),
    'surveys': ('Surveys', 'Create and review surveys.'),
    'feedback': ('Feedback', 'Read and resolve feedback.'),
    'draft': ('Drafts', 'Recover drafted schools and accounts.'),
    'customer_care': ('Customer Care', 'Handle customer conversations assigned by the CEO.'),
}


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


# ---------------------------------------------------------------------------
# Navigation: what a non-founder executive can see. Mirrors
# apps/*/src/lib/executive-modules.ts (GENERAL_EXECUTIVE_ROUTES and
# MODULES_BY_HREF); a test keeps the two in sync.
# ---------------------------------------------------------------------------

#: Tabs every executive account has: overview, own profile, messages, notifications.
GENERAL_EXECUTIVE_ROUTES = ['/dashboard', '/dashboard/profile', '/dashboard/chat', '/dashboard/notifications']

#: Route -> modules that open it (any one is enough).
MODULES_BY_HREF = {
    '/dashboard/log-post': ['log_post'],
    '/dashboard/apps': ['app_registry'],
    '/dashboard/app-store': ['app_registry'],
    '/dashboard/partners': ['partners'],
    '/academy/admin': ['academy'],
    '/dashboard/schools': ['schools', 'proprietors'],
    '/dashboard/school-website': ['school_websites'],
    '/dashboard/support': ['support'],
    '/dashboard/customer-care': ['customer_care'],
    '/dashboard/flyer-qr': ['flyer_qr'],
    '/dashboard/testimonials': ['testimonials'],
    '/dashboard/platform-settings': ['portfolio_policy', 'platform_billing'],
    '/dashboard/community': ['community'],
    '/dashboard/announcements': ['announcements'],
    '/dashboard/surveys': ['surveys'],
    '/dashboard/feedback': ['feedback'],
    '/dashboard/draft': ['draft'],
    '/dashboard/ai-economics': ['ai_economics'],
}


def _matches(path: str, base: str) -> bool:
    return path == base or path.startswith(base + '/')


def modules_for_path(path: str) -> list:
    clean = path.split('?')[0].split('#')[0].rstrip('/') or '/'
    best = ''
    for href in MODULES_BY_HREF:
        if _matches(clean, href) and len(href) > len(best):
            best = href
    return MODULES_BY_HREF[best] if best else []
