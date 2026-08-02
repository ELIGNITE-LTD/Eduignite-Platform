"""Robust HTML -> PDF rendering for AI feature exports.

WeasyPrint produces the nicest output but depends on native system libraries
(Pango/Cairo/GDK) that are frequently missing on the deployment host, which made
every PDF export (exam questions, career reports, guidance reports) fail with a
"Download failed" error.

This helper tries WeasyPrint first and transparently falls back to the
pure-Python ``xhtml2pdf`` engine (no system dependencies) so downloads keep
working everywhere.
"""

from io import BytesIO


class PdfGenerationError(RuntimeError):
    """Raised when no available engine could render the PDF."""


def _render_with_weasyprint(html, base_url=None):
    from weasyprint import HTML  # imported lazily; may be unavailable

    return HTML(string=html, base_url=base_url).write_pdf()


def _render_with_xhtml2pdf(html):
    from xhtml2pdf import pisa  # pure-Python fallback

    buffer = BytesIO()
    status = pisa.CreatePDF(src=html, dest=buffer, encoding='utf-8')
    if status.err:
        raise PdfGenerationError('xhtml2pdf failed to render the document.')
    return buffer.getvalue()


def render_html_to_pdf(html, base_url=None):
    """Return PDF bytes for the given HTML string.

    Tries WeasyPrint, then xhtml2pdf. Raises :class:`PdfGenerationError` only
    when both engines are unavailable or fail.
    """
    errors = []

    try:
        return _render_with_weasyprint(html, base_url=base_url)
    except Exception as exc:  # ImportError, OSError (missing native libs), etc.
        errors.append(f'weasyprint: {exc}')

    try:
        return _render_with_xhtml2pdf(html)
    except Exception as exc:
        errors.append(f'xhtml2pdf: {exc}')

    raise PdfGenerationError('Unable to generate PDF. ' + ' | '.join(errors))
