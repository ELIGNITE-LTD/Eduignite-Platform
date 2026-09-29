"""Certificate -> PDF rendering for EduIgnite Academy.

Reuses the same dependency-fallback-safe HTML->PDF helper already used for
every other PDF export on this backend (exam questions, career reports,
guidance reports) -- see ``apps/ai_features/pdf_utils.py``. No new PDF
library is introduced here.

Design matches the CEO-approved reference certificate exactly: off-white
card, the real EduIgnite shield mark, a gold "CERTIFICATE OF COMPLETION"-
style headline, a four-column footer (Presented By / Duration / Date /
Credential ID), and a faint repeating diagonal "PRINTED BY EDUIGNITE
ACADEMY" watermark. Uses the site's actual established brand palette and
type -- navy ``#264D73`` / gold accent, ``Newsreader``-style serif
headline -- the same values already hard-coded across the Academy frontend
(see ``apps/website/src/app/academy/certificates/page.tsx``).

Engine note (found live, 2026-09-13): this backend's PDF engine falls back
from WeasyPrint to xhtml2pdf whenever WeasyPrint's native Pango libraries
aren't installed on the host (see pdf_utils.py) -- and xhtml2pdf does not
implement flexbox, position, transform, or opacity at all, silently
DROPPING those rules rather than erroring. An earlier version of this
template used all four for the footer layout and the watermark, and
rendered correctly under WeasyPrint but produced a badly broken PDF under
the xhtml2pdf fallback (the "absolutely positioned, low-opacity, rotated"
watermark became a full-strength, non-rotated block sitting ABOVE the
actual content, and the "flex" footer collapsed into an unlabelled
vertical stack). Confirmed via direct production testing (SSM into the
deploy box, rendering a real certificate through the live code path) --
see the Dockerfile fix landing alongside this file for the actual
root-cause fix (installing WeasyPrint's real dependencies), and the
footer/logo changes below for defense in depth: a plain <table> and a
raster <img> degrade far more gracefully than flex/inline-SVG if a PDF
is ever rendered by xhtml2pdf again for any reason.
"""

import base64
from pathlib import Path

from django.conf import settings
from django.http import HttpResponse
from django.utils import timezone
from django.utils.html import escape

# The official EduIgnite mark, the same file the Academy screens show
# (apps/website/public/icon.png, 512 px), shipped with the backend in
# ``assets/`` and inlined as a data URI so the PDF never depends on a network
# fetch back to the site, and renders the same under either PDF engine.
#
# It used to be pasted into this file as a base64 string, and that string was
# corrupt (a length no base64 decoder accepts), so certificates came out
# without their logo. Reading the real file removes that failure mode.
_LOGO_PATH = Path(__file__).resolve().parent / 'assets' / 'eduignite-logo.png'
_SHIELD_PNG_B64 = base64.b64encode(_LOGO_PATH.read_bytes()).decode('ascii')


def _format_duration(total_minutes):
    if not total_minutes:
        return 'Self-paced'
    if total_minutes < 60:
        return '< 1 Hour'
    hours = round(total_minutes / 60)
    return f'{hours} Hour{"s" if hours != 1 else ""}'


def _certificate_html(certificate):
    learner_name = escape(certificate.user.name or certificate.user.matricule)
    course_title = escape(certificate.course.title)
    tier_label = escape(certificate.get_tier_display()).upper()
    verification_id = escape(certificate.verification_id)
    duration_label = escape(_format_duration(certificate.course.duration_minutes))
    issued_date = certificate.issued_at or timezone.now()
    # "%-d" (no zero-padding) is a glibc/Linux-only strftime extension, not
    # portable -- built by hand instead so "September 9, 2026" renders the
    # same on every platform this might ever run on.
    issued_at = f'{issued_date.strftime("%B")} {issued_date.day}, {issued_date.year}'

    # Enough diagonal watermark lines to visibly tile across an A4-landscape
    # card at a -28deg tilt, regardless of exact page size. Renders
    # correctly under WeasyPrint (this module's Dockerfile now installs its
    # real dependencies); see module docstring for the xhtml2pdf fallback
    # caveat.
    watermark_lines = '\n'.join(
        '<div class="watermark-line">' + ' &nbsp;&nbsp;&nbsp; '.join(['PRINTED BY EDUIGNITE ACADEMY'] * 4) + '</div>'
        for _ in range(7)
    )

    return f'''<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  @page {{ size: A4 landscape; margin: 0; }}
  html, body {{
    height: 100%;
    margin: 0;
    padding: 0;
    background: #FBF9F4;
    font-family: Georgia, "Times New Roman", serif;
  }}
  .cert {{
    position: relative;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: center;
    /* height:100% of the now-explicitly-sized html/body, not 100vh --
       "vh" is ambiguous in a print @page context and renders
       inconsistently across preview tools/engines; an explicit ancestor
       height makes percentage sizing (and therefore flex centering)
       unambiguous everywhere. */
    width: 100%;
    height: 100%;
    overflow: hidden;
    padding: 44px 64px 40px;
    background: #FBF9F4;
    text-align: center;
  }}
  .watermark {{
    position: absolute;
    top: -20%;
    left: -20%;
    width: 140%;
    height: 160%;
    transform: rotate(-28deg);
    z-index: 0;
    display: flex;
    flex-direction: column;
    justify-content: space-evenly;
  }}
  .watermark-line {{
    white-space: nowrap;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 15px;
    font-weight: bold;
    letter-spacing: 3px;
    color: #12314D;
    opacity: 0.07;
  }}
  .content {{
    position: relative;
    z-index: 1;
  }}
  .shield {{
    width: 56px;
    height: 56px;
    margin: 0 auto;
  }}
  .brand {{
    margin-top: 14px;
    color: #1A2B4C;
    font-size: 26px;
    font-weight: bold;
    letter-spacing: 4px;
  }}
  .tagline {{
    margin-top: 4px;
    color: #A6813D;
    font-family: Arial, Helvetica, sans-serif;
    font-weight: bold;
    font-size: 10px;
    letter-spacing: 3px;
    text-transform: uppercase;
  }}
  .rule {{
    width: 90px;
    height: 1px;
    background: #D9CFB8;
    margin: 22px auto;
  }}
  h1 {{
    margin: 0;
    color: #A6813D;
    font-size: 38px;
    letter-spacing: 4px;
    font-weight: normal;
  }}
  .presented {{
    margin-top: 34px;
    color: #64748b;
    font-style: italic;
    font-size: 14px;
  }}
  .learner-name {{
    margin-top: 12px;
    font-size: 32px;
    font-weight: bold;
    color: #1A2B4C;
  }}
  .for-course {{
    margin-top: 22px;
    color: #64748b;
    font-style: italic;
    font-size: 14px;
  }}
  .course-title {{
    margin-top: 10px;
    font-size: 22px;
    font-weight: bold;
    color: #1A2B4C;
  }}
  .footer {{
    margin-top: 48px;
    width: 100%;
    border-collapse: collapse;
    padding-top: 22px;
    border-top: 1px solid #E7E0D0;
    font-family: Arial, Helvetica, sans-serif;
  }}
  .footer td {{
    width: 25%;
    text-align: center;
    vertical-align: top;
    padding-top: 22px;
  }}
  .footer .label {{
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: #94a3b8;
    font-size: 9px;
    font-weight: bold;
  }}
  .footer .value {{
    margin-top: 6px;
    font-weight: bold;
    color: #1A2B4C;
    font-size: 12px;
  }}
</style>
</head>
<body>
  <div class="cert">
    <div class="watermark">{watermark_lines}</div>
    <div class="content">
      <img class="shield" src="data:image/png;base64,{_SHIELD_PNG_B64}" alt="EduIgnite" />
      <p class="brand">EDUIGNITE ACADEMY</p>
      <p class="tagline">Professional Learning &amp; Certification</p>
      <div class="rule"></div>
      <h1>{tier_label}</h1>
      <div class="rule"></div>
      <p class="presented">This certificate is proudly presented to</p>
      <p class="learner-name">{learner_name}</p>
      <p class="for-course">For successfully completing</p>
      <p class="course-title">{course_title}</p>
      <table class="footer">
        <tr>
          <td>
            <div class="label">Presented By</div>
            <div class="value">EduIgnite Academy Team</div>
          </td>
          <td>
            <div class="label">Duration</div>
            <div class="value">{duration_label}</div>
          </td>
          <td>
            <div class="label">Date</div>
            <div class="value">{issued_at}</div>
          </td>
          <td>
            <div class="label">Credential ID</div>
            <div class="value">{verification_id}</div>
          </td>
        </tr>
      </table>
    </div>
  </div>
</body>
</html>'''


def build_certificate_pdf_response(certificate):
    """Return an ``HttpResponse`` carrying the certificate as a downloadable
    PDF attachment."""
    from apps.ai_features.pdf_utils import render_html_to_pdf

    html = _certificate_html(certificate)
    pdf = render_html_to_pdf(html, base_url=getattr(settings, 'WEASYPRINT_BASEURL', None))
    response = HttpResponse(pdf, content_type='application/pdf')
    response['Content-Disposition'] = f'attachment; filename="EduIgnite-Certificate-{certificate.verification_id}.pdf"'
    return response
