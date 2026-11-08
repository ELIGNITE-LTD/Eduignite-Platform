"""Builds the EduIgnite Companion guide as a PDF.

A dedicated, brand-matched guide for the EduIgnite Companion Android app —
sign-in, QR-based license activation/renewal, and the five features the app
grew into (announcements, chat with EduIgnite, testimony, feedback, survey).
Served from the website alongside the app's download, replacing the single
generic account-setup PDF every app used to share. Purely static content, no
database needed — same pattern as build_offline_setup_guide.py /
build_runbook_doc.py (imports the shared house style directly, no
django.setup()).

    python docs/build_companion_guide.py

Writes straight into apps/website/public/ (not docs/) since this PDF is
served as a static website asset, same place EduIgnite-Account-Setup-Guide.pdf
already lives.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from reportlab.lib.units import mm  # noqa: E402
from reportlab.platypus import PageBreak, Paragraph, Spacer  # noqa: E402

from _pdf_style import (  # noqa: E402
    CAPTION, H1, H2, NOTE, bullets, build, cover, para, rule, table,
)

S = []


def section(title):
    S.extend([para(title, H1), rule(), Spacer(1, 4 * mm)])


S += cover(
    'EduIgnite Companion &mdash; Guide',
    'The small Android app for your school&rsquo;s administrator.<br/>'
    'Activate and renew EduIgnite Offline&rsquo;s license,<br/>'
    'and stay connected with EduIgnite&rsquo;s office.',
)

# ------------------------------------------------------------------ 1
section('1. What EduIgnite Companion is')
S += [
    para(
        'EduIgnite Companion is a small, focused Android app built for a school&rsquo;s '
        'administrator. Its original and most important job is licensing: scanning the QR code '
        'shown by the EduIgnite Offline desktop app to activate a new install or renew an '
        'expiring license, without needing to install the much larger EduIgnite Mobile app.'
    ),
    Paragraph(
        'Already have EduIgnite Mobile installed? You do not need Companion as well &mdash; '
        'Mobile&rsquo;s built-in Companion tools do the exact same licensing job. EduIgnite '
        'Companion is the lighter option for a technical admin who has no other reason to use '
        'the full Mobile app.', NOTE),
    para(
        'Companion has since grown a small set of everyday features, listed in section 4, so an '
        'administrator who only ever uses Companion is not cut off from EduIgnite&rsquo;s office.'
    ),
    PageBreak(),
]

# ------------------------------------------------------------------ 2
section('2. Getting started')
S += [
    para('Step 1 &mdash; Download and install', H2),
    para(
        'Download EduIgnite Companion from the EduIgnite website&rsquo;s download page and '
        'install it, same as any other Android app.'
    ),
    para('Step 2 &mdash; Sign in', H2),
    para(
        'Sign in with the matricule and password your school already gave you &mdash; the same '
        'account used across every EduIgnite app. There is no separate sign-up: if your school '
        'is on EduIgnite, your administrator or sub-administrator account already works here.'
    ),
    Paragraph(
        'Only a school administrator or sub-administrator account can activate or renew '
        'licenses. Signing in with any other account still works, but the licensing screens stay '
        'locked.', NOTE),
    PageBreak(),
]

# ------------------------------------------------------------------ 3
section('3. Activating or renewing a license')
S += [
    para(
        'The Offline Desktop app has no direct line to EduIgnite&rsquo;s servers, so Companion '
        'bridges the gap with a QR code.'
    ),
    table([
        ['Step', 'What happens'],
        ['1', 'On the EduIgnite Offline desktop app, open the license screen. It shows a '
              'short-lived, one-time QR code &mdash; a temporary cryptographic challenge, never a '
              'permanent secret.'],
        ['2', 'In Companion, open <b>Activate / Renew License</b> and point the camera at the '
              'code. Companion forwards the challenge to EduIgnite&rsquo;s licensing server over '
              'its own internet connection.'],
        ['3', 'The server verifies the request, signs a license tied to your School ID and that '
              'computer&rsquo;s hardware, and sends it back through Companion to the Desktop app '
              '&mdash; unlocking full access.'],
    ], [16 * mm, 149 * mm]),
    para(
        'Each QR challenge expires after a few minutes and can only be used once. The same flow '
        'covers annual renewals.'
    ),
    para('Replacing a device', H2),
    para(
        'If the office computer running EduIgnite Offline fails or is upgraded, open '
        '<b>Device Replacement</b> in Companion instead. On the new computer, start EduIgnite '
        'Offline and choose &ldquo;Replace Device&rdquo; to generate a single-use replacement '
        'challenge QR code, then scan it in Companion the same way. The old device&rsquo;s '
        'license is deactivated by the server automatically.'
    ),
    PageBreak(),
]

# ------------------------------------------------------------------ 4
section('4. Staying connected with EduIgnite')
S += [
    para(
        'Beyond licensing, Companion carries five lighter features so an administrator who only '
        'uses this app can still reach EduIgnite&rsquo;s office. All five are open to any signed-in '
        'account, not just administrators.'
    ),
    para('Announcements', H2),
    para('Updates and notices EduIgnite&rsquo;s office sends to your school appear here as they arrive.'),

    para('Chat with EduIgnite', H2),
    para(
        'Message EduIgnite&rsquo;s team directly using the same messaging system every EduIgnite '
        'app shares &mdash; no separate support-ticket system to learn.'
    ),

    para('Surveys', H2),
    para(
        'When EduIgnite&rsquo;s office publishes a survey for your school, it shows up here. '
        'Answer each question and submit &mdash; each survey can only be answered once.'
    ),

    para('Share a testimony', H2),
    para(
        'Tell other schools about your experience with EduIgnite. Submitted testimonies are '
        'reviewed by the EduIgnite team before they can appear publicly.'
    ),

    para('Feedback', H2),
    para('Report an issue or suggest an improvement directly to the EduIgnite team, with a priority level attached.'),

    Spacer(1, 4 * mm),
    Paragraph(
        'Questions about EduIgnite Companion? Use the Feedback screen in the app itself, or write '
        'to us at info@eduignite.online.', CAPTION),
]

out = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    'apps', 'website', 'public', 'EduIgnite-Companion-Guide.pdf',
)
build(out, S,
      title='EduIgnite Companion — Guide',
      right_label='Companion Guide',
      subject='Signing in, activating a license, and using EduIgnite Companion')
print('written:', out)
