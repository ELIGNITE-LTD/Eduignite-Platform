"""Public interface of the school-site content module (blog posts, leadership).

Other apps (for example the executive tooling that edits any school's website)
import from here, never from ``models``/``services`` directly. Every function
takes the school explicitly, so tenant scoping is the caller's decision and is
the same for a school administrator and for an executive with the
``school_websites`` module.
"""

from .sanitize import plain_text, sanitize_html
from .services import (
    add_leader, candidate_rows, create_post, delete_post, eligible_staff, public_leaders,
    publish_post, published_posts, reorder_leaders, remove_leader, rotate_post_preview_token,
    save_category, school_leaders, school_posts, unpublish_post, update_leader, update_post,
    upload_image,
)

__all__ = [
    'add_leader', 'candidate_rows', 'create_post', 'delete_post', 'eligible_staff', 'plain_text',
    'public_leaders', 'publish_post', 'published_posts', 'remove_leader', 'reorder_leaders',
    'rotate_post_preview_token', 'sanitize_html', 'save_category', 'school_leaders', 'school_posts',
    'unpublish_post', 'update_leader', 'update_post', 'upload_image',
]
