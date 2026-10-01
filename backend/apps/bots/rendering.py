"""Answers as PDFs, drawn exactly as the apps draw them.

A chat app cannot show a graph, a chart or typeset mathematics, so an answer
with any of them is sent as a PDF. It is not redrawn here: the website's own
answer renderer (`/print/ai-answer`) is opened in a headless browser and
printed, so the charts, the mathematics and the EduIgnite heading are the
ones a student sees in the app, and any improvement there reaches the bot.

The answer reaches that page through a one-time token, never in the address,
so a question and its answer are never written into a server log.

When the browser is not available, a plainer PDF is made from the text, so
the person still gets a document rather than an error.
"""

from __future__ import annotations

import html
import logging
import secrets

from django.conf import settings
from django.core.cache import cache
from django.utils import timezone

from .formatting import strip_visuals, to_print_html

logger = logging.getLogger(__name__)

RENDER_TTL_SECONDS = 600


def _cache_key(token: str) -> str:
    return f'bots:render:{token}'


def stash_for_render(question: str, answer: str, *, asked_by: str = '', language: str = 'en') -> str:
    token = secrets.token_urlsafe(24)
    cache.set(_cache_key(token), {
        'question': question or '',
        'answer': answer or '',
        'asked_by': asked_by or '',
        'language': language,
        'created_at': timezone.now().isoformat(),
    }, RENDER_TTL_SECONDS)
    return token


def payload_for(token: str):
    return cache.get(_cache_key(token))


def render_base_url() -> str:
    return (getattr(settings, 'BOT_RENDER_BASE_URL', '') or getattr(settings, 'FRONTEND_URL', '')).rstrip('/')


def _with_browser(token: str) -> bytes:
    from playwright.sync_api import sync_playwright

    url = f'{render_base_url()}/print/ai-answer?t={token}'
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(args=['--no-sandbox', '--disable-dev-shm-usage'])
        try:
            page = browser.new_page(viewport={'width': 820, 'height': 1160}, device_scale_factor=2)
            page.goto(url, wait_until='networkidle', timeout=90_000)
            page.wait_for_selector('[data-render-ready="true"], [data-render-error="true"]', timeout=90_000)
            if page.query_selector('[data-render-error="true"]'):
                raise RuntimeError('The answer page could not load the answer.')
            return page.pdf(
                format='A4',
                print_background=True,
                margin={'top': '14mm', 'bottom': '16mm', 'left': '12mm', 'right': '12mm'},
            )
        finally:
            browser.close()


def _fallback(question: str, answer: str, asked_by: str, note: str) -> bytes:
    from apps.ai_features.pdf_utils import render_html_to_pdf

    body = to_print_html(strip_visuals(answer, note))
    document = f"""<!doctype html><html><head><meta charset="utf-8"><style>
      body {{ font-family: 'Liberation Sans', Arial, sans-serif; font-size: 11pt; color: #1f2937; line-height: 1.55; }}
      h1 {{ color: #264D73; font-size: 16pt; margin: 0 0 4px; }}
      .meta {{ color: #6b7280; font-size: 9pt; margin-bottom: 14px; }}
      .question {{ background: #eef4fa; border-left: 4px solid #264D73; padding: 8px 12px; margin-bottom: 16px; }}
      pre {{ background: #f3f4f6; padding: 8px; font-size: 9.5pt; white-space: pre-wrap; }}
    </style></head><body>
      <h1>EduIgnite AI</h1>
      <div class="meta">{html.escape(asked_by)} · {timezone.localtime():%d %b %Y}</div>
      <div class="question">{html.escape(question)}</div>
      <div>{body}</div>
    </body></html>"""
    return render_html_to_pdf(document)


def answer_pdf(question: str, answer: str, *, asked_by: str = '', language: str = 'en', chart_note: str = '') -> bytes:
    """A PDF of one answer. Tries the real renderer, then the plain one."""
    if getattr(settings, 'BOT_BROWSER_RENDERING', True) and render_base_url():
        token = stash_for_render(question, answer, asked_by=asked_by, language=language)
        try:
            return _with_browser(token)
        except Exception:  # noqa: BLE001 - the plain PDF below still serves the person
            logger.exception('Browser rendering of an AI answer failed; using the plain PDF')
        finally:
            cache.delete(_cache_key(token))
    return _fallback(question, answer, asked_by, chart_note or 'Chart not shown in this version of the PDF.')
