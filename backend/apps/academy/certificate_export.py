"""Certificate -> PDF rendering for EduIgnite Academy.

Reuses the same dependency-fallback-safe HTML->PDF helper already used for
every other PDF export on this backend (exam questions, career reports,
guidance reports) — see ``apps/ai_features/pdf_utils.py``. No new PDF
library is introduced here.

Design matches the CEO-approved reference certificate exactly: off-white
card, the real EduIgnite shield mark (inlined as SVG below — no network
fetch, so generation never depends on the site being reachable), a gold
"CERTIFICATE OF COMPLETION"-style headline, a four-column footer
(Presented By / Duration / Date / Credential ID), and a faint repeating
diagonal "PRINTED BY EDUIGNITE ACADEMY" watermark. Uses the site's actual
established brand palette and type — navy ``#264D73`` / gold accent,
``Newsreader``-style serif headline — the same values already hard-coded
across the Academy frontend (see
``apps/website/src/app/academy/certificates/page.tsx``).
"""

from django.conf import settings
from django.http import HttpResponse
from django.utils import timezone
from django.utils.html import escape

# The real EduIgnite shield mark (apps/website/public/eduignite-logo.svg),
# inlined so the PDF never depends on a network fetch back to the site.
_SHIELD_SVG = '''<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="shield" x1="96" y1="56" x2="416" y2="456" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#264D73"/>
      <stop offset="1" stop-color="#173A5B"/>
    </linearGradient>
    <linearGradient id="page" x1="148" y1="240" x2="364" y2="356" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#F8FCFF"/>
      <stop offset="1" stop-color="#DDF4FA"/>
    </linearGradient>
  </defs>
  <path fill="url(#shield)" d="M256 36c17.8 15.4 62.4 38.5 137.8 44.9 12.9 1.1 22.8 11.8 22.8 24.8v139.1c0 108.2-65 190.6-160.6 231.2C160.4 435.4 95.4 353 95.4 244.8V105.7c0-13 9.9-23.7 22.8-24.8C193.6 74.5 238.2 51.4 256 36Z"/>
  <path fill="none" stroke="#67D0E4" stroke-linecap="round" stroke-width="18" opacity=".92" d="M256 74.5c-27 18.2-67.6 31.7-121.3 37.3v132.9c0 84.8 45.6 152.5 121.3 188.6 75.7-36.1 121.3-103.8 121.3-188.6V111.8C323.6 106.2 283 92.7 256 74.5Z"/>
  <text x="256" y="171" text-anchor="middle" font-family="Arial, sans-serif" font-size="48" font-weight="900"><tspan fill="#F8FCFF">Edu</tspan><tspan fill="#67D0E4">Ignite</tspan></text>
  <path fill="url(#page)" d="M153 245.8c0-10.5 8.9-18.7 19.3-17.8 34.2 2.8 61.8 12.2 83.7 28.4 21.9-16.2 49.5-25.6 83.7-28.4 10.4-.9 19.3 7.3 19.3 17.8v113.4c0 10.5-8.8 18.7-19.2 17.9-33.9-2.7-61.7 4.9-83.8 22.6-22.1-17.7-49.9-25.3-83.8-22.6-10.4.8-19.2-7.4-19.2-17.9V245.8Z"/>
  <path fill="none" stroke="#264D73" stroke-linecap="round" stroke-linejoin="round" stroke-width="14" d="M153 245.8c0-10.5 8.9-18.7 19.3-17.8 34.2 2.8 61.8 12.2 83.7 28.4 21.9-16.2 49.5-25.6 83.7-28.4 10.4-.9 19.3 7.3 19.3 17.8v113.4c0 10.5-8.8 18.7-19.2 17.9-33.9-2.7-61.7 4.9-83.8 22.6-22.1-17.7-49.9-25.3-83.8-22.6-10.4.8-19.2-7.4-19.2-17.9V245.8ZM256 256.4v143.3"/>
  <path fill="none" stroke="#264D73" stroke-linecap="round" stroke-width="9" opacity=".55" d="M185 269c20.8 2.3 38.9 7.9 54.2 16.8M185 305c20.8 2.3 38.9 7.9 54.2 16.8M327 269c-20.8 2.3-38.9 7.9-54.2 16.8M327 305c-20.8 2.3-38.9 7.9-54.2 16.8"/>
  <path fill="#67D0E4" d="M236 415.2c12.8 10.1 27.2 10.1 40 0 6.5-5.1 15.7-.2 15.4 8.1-.6 15.5-13.3 27.7-35.4 27.7s-34.8-12.2-35.4-27.7c-.3-8.3 8.9-13.2 15.4-8.1Z"/>
</svg>'''


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
    # portable — built by hand instead so "September 9, 2026" renders the
    # same on every platform this might ever run on.
    issued_at = f'{issued_date.strftime("%B")} {issued_date.day}, {issued_date.year}'

    # Enough diagonal watermark lines to visibly tile across an A4-landscape
    # card at a -28deg tilt, regardless of exact page size.
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
    display: flex;
    justify-content: space-between;
    padding-top: 22px;
    border-top: 1px solid #E7E0D0;
  }}
  .footer .col {{
    flex: 1;
    text-align: center;
    font-family: Arial, Helvetica, sans-serif;
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
      <div class="shield">{_SHIELD_SVG}</div>
      <p class="brand">EDUIGNITE ACADEMY</p>
      <p class="tagline">Professional Learning &amp; Certification</p>
      <div class="rule"></div>
      <h1>{tier_label}</h1>
      <div class="rule"></div>
      <p class="presented">This certificate is proudly presented to</p>
      <p class="learner-name">{learner_name}</p>
      <p class="for-course">For successfully completing</p>
      <p class="course-title">{course_title}</p>
      <div class="footer">
        <div class="col">
          <div class="label">Presented By</div>
          <div class="value">EduIgnite Academy Team</div>
        </div>
        <div class="col">
          <div class="label">Duration</div>
          <div class="value">{duration_label}</div>
        </div>
        <div class="col">
          <div class="label">Date</div>
          <div class="value">{issued_at}</div>
        </div>
        <div class="col">
          <div class="label">Credential ID</div>
          <div class="value">{verification_id}</div>
        </div>
      </div>
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
