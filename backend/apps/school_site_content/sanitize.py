"""Allow-list HTML sanitiser for school blog posts (nh3).

Used on WRITE (what is stored is already clean) and again on READ (so content
saved before a rule tightened, or written straight into the database, can never
reach a visitor unclean).

Allowed: headings, paragraphs, lists, bold/italic, blockquote, line breaks,
links (https only, forced ``rel="noopener nofollow ugc"``) and images that are
one of the school's OWN uploaded images (exact URL match). Everything else is
removed; script/style/iframe/object/embed content is dropped with the tag.
"""

import re

import nh3

ALLOWED_TAGS = {
    'h1', 'h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'a', 'img', 'blockquote', 'br',
}
ALLOWED_ATTRIBUTES = {
    'a': {'href', 'title'},
    'img': {'src', 'alt'},
}
DROP_WITH_CONTENT = {
    'script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'svg', 'math', 'form',
    'textarea', 'select', 'option', 'button', 'frame', 'frameset', 'applet', 'link', 'meta', 'title',
}
_SRCLESS_IMG = re.compile(r'<img(?![^>]*\ssrc=)[^>]*>')
LINK_REL = 'noopener nofollow ugc'
MAX_LINK_LENGTH = 500


def sanitize_html(html, allowed_image_urls=()):
    """Return ``html`` reduced to the allow-list. ``allowed_image_urls`` are the only ``<img src>`` kept."""
    if not html:
        return ''
    images = frozenset(allowed_image_urls)

    def attribute_filter(tag, attr, value):
        value = (value or '').strip()
        if tag == 'a' and attr == 'href':
            if value.lower().startswith('https://') and len(value) <= MAX_LINK_LENGTH:
                return value
            return None
        if tag == 'img' and attr == 'src':
            return value if value in images else None
        if attr == 'rel':
            return LINK_REL
        if attr in ('alt', 'title'):
            return value[:300]
        return None

    cleaned = nh3.clean(
        str(html),
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        attribute_filter=attribute_filter,
        url_schemes={'https'},
        link_rel=LINK_REL,
        clean_content_tags=DROP_WITH_CONTENT,
        strip_comments=True,
    )
    # An <img> whose src was refused is an empty box: remove it entirely.
    return _SRCLESS_IMG.sub('', cleaned)


def plain_text(html):
    """Visible text of sanitised HTML (for word counts and excerpts)."""
    text = nh3.clean(str(html or ''), tags=set())
    return re.sub(r'\s+', ' ', text).strip()
