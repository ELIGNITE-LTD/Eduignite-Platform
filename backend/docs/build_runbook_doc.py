"""Builds the app platform deployment runbook as a PDF.

Mirrors docs/app-platform-runbook.md. The markdown stays the source of truth
for diffing and for copying commands out of; this is the version to print or
hand to whoever is standing at the server.

    python docs/build_runbook_doc.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from reportlab.lib.units import mm  # noqa: E402
from reportlab.platypus import PageBreak, Paragraph, Spacer  # noqa: E402

from _pdf_style import (  # noqa: E402
    BODY, CAPTION, H1, H2, H3, NOTE, bullets, build, code, cover, para, rule, table,
)

S = []


def section(title):
    S.extend([para(title, H1), rule(), Spacer(1, 4 * mm)])


S += cover(
    'App Platform &mdash; Deployment Runbook',
    'Bringing the uploadable app platform up on the server,<br/>'
    'and getting the first app into a school&rsquo;s account.',
)

# ------------------------------------------------------------------ 1
section('1. Before you deploy')
S += [
    Paragraph(
        '<b>Read this section before deploying.</b> Skipping the migration takes every '
        'feature away from every school.', NOTE),

    para('1.1 The migration that matters', H2),
    para(
        '<font face="Courier">registry.0002_grandfather_existing_schools</font> grants '
        'every existing school every non-core app.'
    ),
    para(
        'Without it, entitlements are enforced that nobody has been granted, and every '
        'school already running loses <b>Attendance, Marks, Fees and Chat</b> the moment '
        'the release goes live. With it, the registry is a no-op for current schools and '
        'starts mattering only for new ones.'
    ),
    para('There is no safe way to deploy this release without running migrations.'),

    para('1.2 New settings', H2),
    para('All have defaults, but the first is worth setting explicitly.'),
    table([
        ['Setting', 'Default', 'What it does'],
        ['APP_RUNTIME_ROOT', 'BASE_DIR/app_runtime',
         'Where approved builds are unpacked and packages cached. Must be writable, and '
         'must not be served over HTTP — it holds app source.'],
        ['APP_PACKAGE_CACHE_ROOT', '<runtime>/app_packages',
         'Local copies of .eia files when storage is S3.'],
        ['APP_RUNTIME_TIMEOUT_SECONDS', '8', 'Wall clock per handler call.'],
        ['APP_RUNTIME_MEMORY_MB', '512', 'Address-space cap per call.'],
        ['APP_RUNTIME_CPU_SECONDS', '10', 'CPU cap per call.'],
        ['APP_RUNTIME_ALLOW_INLINE', 'unset',
         'Leave unset. It runs app code inside the web process, which is the thing the '
         'whole design exists to prevent.'],
    ], [46 * mm, 34 * mm, 85 * mm]),
    Paragraph(
        'Put <font face="Courier">APP_RUNTIME_ROOT</font> somewhere nginx does not serve. '
        'If it sits under a served directory, an app&rsquo;s Python source becomes '
        'downloadable.', NOTE),

    para('1.3 What the box needs', H2),
    *bullets([
        '<b>fork.</b> Linux is fine. Without it apps are refused rather than run unsafely, '
        'so the platform stays up but no app works.',
        '<b>Headroom for child processes.</b> Each in-flight call is a forked process '
        'holding up to APP_RUNTIME_MEMORY_MB. Worst case is roughly concurrent calls '
        '&times; that cap — check it against the instance size before enabling an app for '
        'a large school.',
        '<b>Disk</b> for APP_RUNTIME_ROOT: unpacked builds plus cached packages, a few MB '
        'per version, kept per version.',
    ]),
    PageBreak(),
]

# ------------------------------------------------------------------ 2
section('2. Deploying')
S += [
    code("""
# 1. Bring the code down
cd /path/to/eduignite && git pull

# 2. Dependencies, if requirements changed
source venv/bin/activate && pip install -r requirements.txt

# 3. Migrate - the step that must not be skipped
python manage.py migrate

# 4. Confirm the grandfather migration ran
python manage.py showmigrations registry

# 5. Create the runtime directory if not on the default path
mkdir -p /var/lib/eduignite/app_runtime
chown www-data:www-data /var/lib/eduignite/app_runtime

# 6. Restart all three services
sudo systemctl restart eduignite-gunicorn
sudo systemctl restart eduignite-celery-worker
sudo systemctl restart eduignite-celery-beat
"""),
    para('Service names vary; use whatever this box actually calls them.'),
    Paragraph(
        '<b>Restart the Celery worker and beat, not just gunicorn.</b> They load '
        'application code at startup. Leaving them on the previous release against the new '
        'API is the same shape as the import-prefix fault that previously put the worker '
        'into a restart loop.', NOTE),

    para('2.1 Immediately after', H2),
    code("""
sudo systemctl status eduignite-celery-worker --no-pager
sudo journalctl -u eduignite-gunicorn -n 50 --no-pager
"""),
    para(
        'Then, signed in as a founder, open <b>App Registry</b> and confirm an existing '
        'school lists its apps as installed. If a school shows nothing installed, stop and '
        'check that migration 0002 ran — before anyone notices.'
    ),
]

# ------------------------------------------------------------------ 3
section('3. Verifying the deploy')
S += [
    para('Do these on a <b>test school</b>, not a real one.'),
    table([
        ['#', 'Check', 'Expected'],
        ['1', 'Existing schools kept their apps',
         'A school that existed before the release shows Attendance, Marks and Fees '
         'installed.'],
        ['2', 'Removal works', "A removed Standard app disappears from that school's menu."],
        ['3', 'The endpoint refuses it too',
         "Calling the removed app's endpoint directly with a token for that school returns "
         '403. If it returns data, the guard is not applied — that is blocking.'],
        ['4', 'Re-install restores everything',
         "The school's existing records are all still there."],
        ['5', 'A new school arrives usable',
         'It has the Included apps without anyone installing them.'],
    ], [8 * mm, 52 * mm, 105 * mm]),
    PageBreak(),
]

# ------------------------------------------------------------------ 4
section('4. First upload, end to end')

S += [
    para('4.1 Build the package', H2),
    code("""
cd studio-main
python apps-source/teacher-attendance/build.py
# -> apps-source/teacher-attendance/dist/teacher-attendance-1.0.0.eia
"""),
    para(
        'The build is deterministic — identical source produces identical bytes — so the '
        'file can be checksummed and compared with what reached the server.'
    ),

    para('4.2 Upload', H2),
    code("""
curl -X POST https://<host>/api/v1/registry/builds/upload/ \\
  -H "Authorization: Bearer <founder token>" \\
  -F "package=@apps-source/teacher-attendance/dist/teacher-attendance-1.0.0.eia"
"""),
    para(
        'Returns the build with <font face="Courier">"state": "draft"</font>. '
        '<b>Nothing has run.</b> The package was validated — paths, manifest, screen '
        'bundles — and stored. A 400 says exactly what is wrong with it; that is the '
        'intended path, so fix the source and rebuild.'
    ),

    para('4.3 Submit for review', H2),
    code("""
curl -X POST https://<host>/api/v1/registry/builds/<id>/submit/ \\
  -H "Authorization: Bearer <founder token>"
"""),
    para('The automated checks run immediately. Two outcomes:'),
    *bullets([
        '<font face="Courier">"state": "in_review"</font> — passed, waiting for a person;',
        '<font face="Courier">"state": "checks_failed"</font> — '
        '<font face="Courier">check_report.errors</font> lists what failed.',
    ]),
    para(
        'The checks read the source without importing it, and catch network, filesystem, '
        'subprocess and direct database access, eval and friends, migrations with no '
        'reverse, and code performing a collection write the manifest never declared.'
    ),

    para('4.4 Approve', H2),
    code("""
curl -X POST https://<host>/api/v1/registry/builds/<id>/approve/ \\
  -H "Authorization: Bearer <reviewer token>" \\
  -H "Content-Type: application/json" \\
  -d '{"note": "Reviewed against the staging school."}'
"""),
    Paragraph(
        '<b>The account that submitted a build cannot approve it.</b> That is enforced, '
        'not convention. Use a second founder account, or the approval is refused. To send '
        'it back instead, reject with a reason — a reason is required, because a rejection '
        'with none is not actionable.', NOTE),

    para('4.5 Publish', H2),
    code("""
curl -X POST https://<host>/api/v1/registry/builds/<id>/publish/ \\
  -H "Authorization: Bearer <founder token>"
"""),
    para(
        'Now it is installable. The previous build, if any, becomes <i>deprecated</i> '
        'rather than deleted — schools still on it keep running, and rollback re-points at '
        'something that still exists.'
    ),

    para('4.6 Install for a school', H2),
    para('App Registry &rarr; select the test school &rarr; <b>Install for this school</b>.'),
    para(
        'Teacher Attendance is <font face="Courier">scope: both</font>, so the school '
        'licence is only half of it: each member of staff also has to add it to their own '
        'account. That is the &ldquo;school purchases it, authorised users use it&rdquo; case.'
    ),

    para('4.7 Open it', H2),
    para(
        'Sign in as a teacher at that school. <b>Daily Register</b> appears in the menu, '
        'showing every member of staff, unmarked.'
    ),
    para(
        'Mark someone present. Then mark the same person absent. There must be <b>one</b> '
        'record for that person that day, now reading absent — a register is corrected '
        'constantly, and duplicating on correction would make the month meaningless.'
    ),
    PageBreak(),
]

# ------------------------------------------------------------------ 5
section('5. What to watch on the first run')
S += [
    table([
        ['Symptom', 'Likely cause'],
        ['Screen blank, spinner forever',
         'Bundle failed to parse. Browser console inside the frame.'],
        ['503 This app could not be loaded',
         'Package not fetchable from storage. Check APP_PACKAGE_CACHE_ROOT is writable.'],
        ['422 on every action',
         'Handler raised. The real traceback is in the server log, deliberately not in the '
         'response.'],
        ['422 … took too long', 'Handler exceeded APP_RUNTIME_TIMEOUT_SECONDS.'],
        ['403 not part of your subscription',
         'Installed for the school but not the user, or licence expired.'],
        ['Apps refused platform-wide',
         'fork unavailable. Check the log for NoIsolation.'],
    ], [58 * mm, 107 * mm]),
    Spacer(1, 3 * mm),
    code("""
sudo journalctl -u eduignite-gunicorn -f | grep -i "app \\|runner\\|registry"
ls -la /var/lib/eduignite/app_runtime/teacher_attendance/1.0.0/
"""),
]

# ------------------------------------------------------------------ 6
section('6. Rolling back')
S += [
    para('One bad app, schools keep working', H3),
    code("""
curl -X POST https://<host>/api/v1/registry/builds/<id>/pull/ \\
  -H "Authorization: Bearer <founder token>" \\
  -H "Content-Type: application/json" \\
  -d '{"reason": "Register saves the wrong date"}'
"""),
    para(
        'Pulling stops that build running <i>everywhere</i>, including for schools already '
        'on it, and falls back to the previous published build automatically. If there is '
        'none, the app goes dark until a fix is published — the right outcome for a build '
        'doing damage.'
    ),
    para('The whole release', H3),
    para(
        'Revert the stage commits, redeploy, restart all three services. The registry '
        'migrations can stay: with every school grandfathered into every app, the tables '
        'are inert.'
    ),
    Paragraph(
        '<b>Do not reverse registry.0002 on a live system.</b> It deletes the installations '
        'that are keeping schools&rsquo; features switched on.', NOTE),
]

# ------------------------------------------------------------------ 7
section('7. Known gaps at first deploy')
S += [
    para('Stated plainly so nobody discovers them at the wrong moment.'),
    *bullets([
        '<b>Nothing here has run against a real database.</b> All 105 tests pass, but the '
        'scoping guarantees are verified structurally and against generated SQL, never by a '
        'real query. Section 3 is the first time that happens.',
        '<b>The fork path has never executed.</b> It was built on Windows, which cannot '
        'fork, so the timeout and the memory and CPU caps are untested. The timeout row in '
        'section 5 is the first real check of them.',
        '<b>No screen has rendered in a browser.</b> The iframe, bridge, offline cache and '
        'write queue are covered by unit tests and reading only.',
        '<b>Offline is untested end to end.</b> Load a screen, turn off the network, mark '
        'someone, turn it back on, confirm the change syncs.',
    ]),
    Spacer(1, 4 * mm),
    Paragraph(
        'Expect integration bugs in section 4. That is what the test school is for.',
        CAPTION),
]

out = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   'EduIgnite-App-Platform-Runbook.pdf')
build(out, S,
      title='EduIgnite — App Platform Deployment Runbook',
      right_label='App Platform Runbook',
      subject='Deploying the uploadable app platform and publishing the first app')
print('written:', out)
