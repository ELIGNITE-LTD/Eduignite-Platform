"""Builds the EduIgnite Offline setup guide as a PDF.

A dedicated, brand-matched guide for the Windows desktop app's own 5-step
setup wizard (see apps/offline-desktop/src/pages/setup/SetupWizard.tsx),
served from the website alongside the app's download, replacing the single
generic account-setup PDF every app used to share. Purely static content, no
database needed — unlike build_os_manual.py this does not call django.setup(),
matching build_runbook_doc.py / build_app_platform_doc.py's pattern of
importing the shared house style directly.

    python docs/build_offline_setup_guide.py

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
    'EduIgnite Offline &mdash; Setup Guide',
    'Run your whole school with zero internet.<br/>'
    'A step-by-step walkthrough of the desktop app&rsquo;s setup wizard,<br/>'
    'plus how to activate your first year&rsquo;s license.',
)

# ------------------------------------------------------------------ 1
section('1. What EduIgnite Offline is')
S += [
    para(
        'EduIgnite Offline is a Windows desktop app that runs your school&rsquo;s day-to-day '
        'administration &mdash; student records, attendance, marks, report cards and fees &mdash; '
        'completely offline, on the office computer, with nothing stored anywhere else.'
    ),
    para(
        'It is a separate product, not a replacement for the full connected EduIgnite platform. '
        'It exists so a school with no reliable internet connection can start using EduIgnite '
        'today, and move to the cloud whenever a stable connection becomes available &mdash; '
        'without losing or rebuilding any of its records.'
    ),
    Paragraph(
        '<b>Free for the first year.</b> No payment and no internet connection is needed to '
        'install and start using EduIgnite Offline. An internet connection is only needed once, '
        'briefly, to activate the license &mdash; see section 3.', NOTE),
    para('What you need before you start', H2),
    *bullets([
        'A Windows 10 or 11 computer (64-bit) for the school office.',
        'An internet connection for the first two minutes of setup only (Steps 1 and 2 below) &mdash; '
        'everything after that works fully offline.',
        'Your school&rsquo;s official name, or its EduIgnite matricule if it is already registered '
        'on the platform.',
        'A phone with EduIgnite Companion (or the Companion tools built into EduIgnite Mobile) for '
        'the activation step in section 3.',
    ]),
    PageBreak(),
]

# ------------------------------------------------------------------ 2
section('2. The setup wizard')
S += [
    para(
        'The first time EduIgnite Offline starts, it walks you through a 5-step wizard. Each '
        'step must be completed before the next one unlocks.'
    ),
    Spacer(1, 2 * mm),
    table([
        ['Step', 'Name', 'What happens'],
        ['1', 'Connect', 'Confirms this computer can reach the EduIgnite server, just this once.'],
        ['2', 'Find your school', 'Search and confirm your school by name, short name, or matricule.'],
        ['3', 'School details', 'Fill in the rest of your school&rsquo;s profile (logo, address, contact details).'],
        ['4', 'Create admin', 'Create the first administrator login for this installation.'],
        ['5', 'Done', 'Setup is complete &mdash; continue straight to the sign-in screen.'],
    ], [16 * mm, 38 * mm, 111 * mm]),

    para('Step 1 &mdash; Connect', H2),
    para(
        'EduIgnite Offline first checks that this computer can reach the EduIgnite server. This '
        'is the only step, along with Step 2, that needs an internet connection at all &mdash; '
        'everything after this works fully offline. Press <b>Check connection</b>; once it '
        'succeeds, press <b>Continue</b>.'
    ),

    para('Step 2 &mdash; Find your school', H2),
    para(
        'Type your school&rsquo;s name, short name, or matricule into the search box. Select your '
        'school from the results, then press <b>Confirm this is my school</b>. This links your '
        'installation to your school&rsquo;s real EduIgnite School ID &mdash; the same ID used '
        'everywhere else on the platform, including if you ever migrate to the cloud.'
    ),
    Paragraph(
        'If your school does not appear in the results, it has not been registered on EduIgnite '
        'yet. Use the &ldquo;Request a school account&rdquo; link on the EduIgnite website first.',
        NOTE),

    para('Step 3 &mdash; School details', H2),
    para(
        'Fill in the rest of your school&rsquo;s profile: logo, motto, address, contact details and '
        'similar. You can always change these later from School Profile inside the app, so nothing '
        'here needs to be final.'
    ),

    para('Step 4 &mdash; Create admin', H2),
    para(
        'Create the first administrator account for this installation: a full name, an email or '
        'username, and a password (at least 8 characters). You will sign in with this account once '
        'setup finishes, and can add more staff accounts afterwards from Settings.'
    ),

    para('Step 5 &mdash; Done', H2),
    para(
        'Setup is complete. Press <b>Continue to sign in</b> to reach the normal sign-in screen and '
        'start using EduIgnite Offline with the administrator account you just created.'
    ),
    PageBreak(),
]

# ------------------------------------------------------------------ 3
section('3. Activating your first year, via the Companion app')
S += [
    para(
        'EduIgnite Offline works immediately after setup &mdash; no license is required to start. '
        'A license only becomes necessary once your free first year needs renewing (or sooner, if '
        'your school chooses paid activation earlier). Because the desktop app runs with no direct '
        'line to EduIgnite&rsquo;s servers, activation and renewal both happen through a QR code, '
        'scanned by a phone that does have internet.'
    ),
    table([
        ['Step', 'What happens'],
        ['1', 'On the desktop app, open the license screen. It shows a short-lived, one-time QR '
              'code &mdash; a temporary cryptographic challenge, never a permanent secret.'],
        ['2', 'Your school&rsquo;s administrator opens the EduIgnite Companion app on their phone '
              '(or the Companion tools built into EduIgnite Mobile) and scans the code. The app '
              'forwards the challenge to EduIgnite&rsquo;s licensing server over its own internet '
              'connection.'],
        ['3', 'The server verifies the request, signs a license tied to your School ID and that '
              'computer&rsquo;s hardware, and sends it back through the Companion app to the '
              'Desktop app &mdash; unlocking full access.'],
    ], [16 * mm, 149 * mm]),
    Paragraph(
        'Each QR challenge expires after a few minutes and can only be used once. The exact same '
        'flow covers annual renewals and device replacement (moving the installation to a new '
        'computer) &mdash; see the EduIgnite Companion guide for the Companion app&rsquo;s side of '
        'this.', NOTE),
    para(
        'Only your school&rsquo;s technical administrator needs a Companion-capable phone. Everyone '
        'else using EduIgnite Offline day to day never sees this screen.'
    ),
    PageBreak(),
]

# ------------------------------------------------------------------ 4
section('4. Moving to the cloud later')
S += [
    para(
        'EduIgnite Offline is not a dead end. When your school is ready for a stable internet '
        'connection, moving to the full connected EduIgnite platform does not mean starting over.'
    ),
    *bullets([
        'Your School ID and every Student ID stay identical after migration.',
        'Classes, subjects, marks, results and report cards keep their relationships intact.',
        'Attendance history, academic records and financial ledgers move across in full &mdash; '
        'nothing is deleted or rebuilt.',
    ]),
    para(
        'A school can start entirely offline, sync occasionally when a connection is available, or '
        'migrate fully to the cloud &mdash; at its own pace, without ever losing or fragmenting its '
        'records.'
    ),
    Spacer(1, 4 * mm),
    Paragraph(
        'Questions about EduIgnite Offline? Use the Feedback screen in the EduIgnite Companion '
        'app, or write to us at info@eduignite.online.', CAPTION),
]

out = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    'apps', 'website', 'public', 'EduIgnite-Offline-Setup-Guide.pdf',
)
build(out, S,
      title='EduIgnite Offline — Setup Guide',
      right_label='Offline Setup Guide',
      subject='Setting up EduIgnite Offline and activating its first-year license')
print('written:', out)
