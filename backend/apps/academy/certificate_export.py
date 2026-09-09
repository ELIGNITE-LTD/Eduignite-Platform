"""Certificate -> PDF rendering for EduIgnite Academy.

Reuses the same dependency-fallback-safe HTML->PDF helper already used for
every other PDF export on this backend (exam questions, career reports,
guidance reports) — see ``apps/ai_features/pdf_utils.py``. No new PDF
library is introduced here.

The certificate template is built inline (no ``templates/`` dir for the
``academy`` app yet) using the site's actual established brand palette and
type — navy ``#264D73`` / cyan ``#67D0E4``, ``Newsreader`` serif headline —
the same values already hard-coded across the Academy frontend (see
``apps/website/src/app/academy/certificates/page.tsx`` and
``apps/website/tailwind.config.ts``'s ``serif`` font family), so the
downloaded certificate visually matches the on-site certificate cards.
"""

from django.conf import settings
from django.http import HttpResponse
from django.utils import timezone
from django.utils.html import escape


def _certificate_html(certificate):
    learner_name = escape(certificate.user.name or certificate.user.matricule)
    course_title = escape(certificate.course.title)
    tier_label = escape(certificate.get_tier_display())
    verification_id = escape(certificate.verification_id)
    issued_at = certificate.issued_at.strftime('%d %B %Y') if certificate.issued_at else timezone.now().strftime('%d %B %Y')

    return f'''<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page {{ size: A4 landscape; margin: 0; }}
  body {{
    margin: 0;
    padding: 0;
    background: #FBFCFE;
    font-family: Georgia, "Times New Roman", serif;
  }}
  .cert {{
    box-sizing: border-box;
    width: 100%;
    min-height: 100vh;
    padding: 48px 64px;
    background: linear-gradient(135deg, #EAF3FA 0%, #FBFCFE 55%, #FFFFFF 100%);
    border: 10px solid #264D73;
    outline: 2px solid #67D0E4;
    outline-offset: -22px;
    text-align: center;
  }}
  .eyebrow {{
    color: #67D0E4;
    text-transform: uppercase;
    letter-spacing: 6px;
    font-size: 12px;
    font-weight: bold;
    font-family: Arial, Helvetica, sans-serif;
    margin-top: 12px;
  }}
  .brand {{
    color: #264D73;
    font-size: 22px;
    font-weight: bold;
    letter-spacing: 2px;
    font-family: Arial, Helvetica, sans-serif;
    margin-top: 8px;
  }}
  h1 {{
    color: #12314d;
    font-size: 40px;
    margin: 28px 0 4px 0;
  }}
  .tier {{
    display: inline-block;
    margin-top: 6px;
    padding: 6px 20px;
    border-radius: 999px;
    background: rgba(103, 208, 228, 0.18);
    color: #264D73;
    font-family: Arial, Helvetica, sans-serif;
    font-weight: bold;
    letter-spacing: 2px;
    text-transform: uppercase;
    font-size: 11px;
  }}
  .presented {{
    margin-top: 36px;
    color: #475569;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 13px;
    letter-spacing: 1px;
    text-transform: uppercase;
  }}
  .learner-name {{
    margin-top: 10px;
    font-size: 34px;
    color: #12314d;
    border-bottom: 2px solid #67D0E4;
    display: inline-block;
    padding-bottom: 10px;
  }}
  .for-course {{
    margin-top: 28px;
    color: #475569;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 13px;
  }}
  .course-title {{
    margin-top: 8px;
    font-size: 24px;
    color: #264D73;
  }}
  .footer {{
    margin-top: 56px;
    display: flex;
    justify-content: space-between;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 11px;
    color: #64748b;
    text-align: left;
  }}
  .footer .label {{
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #94a3b8;
    font-size: 9px;
  }}
  .footer .value {{
    margin-top: 3px;
    font-weight: bold;
    color: #264D73;
    font-family: "Courier New", monospace;
  }}
</style>
</head>
<body>
  <div class="cert">
    <p class="eyebrow">Certificate of Achievement</p>
    <p class="brand">EDUIGNITE ACADEMY</p>
    <div class="tier">{tier_label}</div>
    <h1>&nbsp;</h1>
    <p class="presented">This certifies that</p>
    <p class="learner-name">{learner_name}</p>
    <p class="for-course">has successfully completed the course</p>
    <p class="course-title">{course_title}</p>
    <div class="footer">
      <div>
        <div class="label">Issued</div>
        <div class="value">{issued_at}</div>
      </div>
      <div>
        <div class="label">Verification ID</div>
        <div class="value">{verification_id}</div>
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
