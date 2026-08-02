"""Builds the uploadable app platform architecture document as a PDF.

Mirrors docs/eduignite-os-app-platform.md. The markdown stays the source of
truth for review and diffing; this produces the version people actually read.

    python docs/build_app_platform_doc.py
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
    'The Uploadable App Platform',
    'Architecture &mdash; for review<br/>'
    'Apps built separately, uploaded, reviewed and updated<br/>without touching EduIgnite.',
)

# ------------------------------------------------------------------ 1
section('1. What we are building')
S += [
    para(
        'Today an EduIgnite app is a Django module compiled into the release. Adding one '
        'means a backend deploy plus new mobile and desktop builds.'
    ),
    para(
        'We want apps that are <b>built separately, uploaded, reviewed, published and '
        'updated on their own schedule, without touching EduIgnite itself</b>. A school '
        'installs one from the store and it appears in their account.'
    ),
    para('The model is VS Code: apps ship real code, run inside a host the platform '
         'controls, and contribute UI that the platform draws.'),
    para('The four decisions this rests on', H2),
    para('These were settled in discussion. Everything in this document follows from them.'),
    table([
        ['Decision', 'Consequence'],
        ['App code runs inside the EduIgnite runtime',
         'We own the execution host; apps never run loose on the server.'],
        ['App data lives in the school database',
         'The platform provides storage; apps never create tables or run schema migrations.'],
        ['Apps contribute UI, the runtime draws it',
         'Apps ship UI code, but inside a frame we control &mdash; never their own window or site.'],
        ['Only our own team writes apps',
         'The sandbox contains <i>our bugs</i>, not an attacker. A far easier problem.'],
    ], [62 * mm, 103 * mm]),
    para('What an app is', H2),
    para(
        'A versioned package containing server logic, UI code, a declared data shape and a '
        'declared set of permissions. It is not a website, not an APK and not a Django app. '
        'It cannot exist outside the runtime.'
    ),
    PageBreak(),
]

# ------------------------------------------------------------------ 2
section('2. The two lifecycles')
S += [
    para('Conflating these is the usual source of confusion, so they are kept separate.'),
    para('Store side &mdash; what a build is doing globally', H3),
    code("""
Draft -> Submitted -> Automated checks -> In review -> Approved -> Published
                            |                  |
                        Rejected --------------+   (back to Draft)

Published -> Deprecated -> Pulled
"""),
    para('School side &mdash; what one school is actually running', H3),
    code("""
Available -> Installed (pinned to version X) -> Update available -> Updated
                    |
              Uninstalled (data retained)
"""),
    para(
        'A school runs v1 while v2 is published. Both are true at once, and both are '
        'stored. Uninstalling never deletes the school&#39;s records &mdash; the same rule '
        'the existing registry already follows.'
    ),
]

# ------------------------------------------------------------------ 3
section('3. Package format')
S += [
    para('An <font face="Courier">.eia</font> file is a zip:'),
    code("""
manifest.json     what the app is, what it needs, what it contributes
server/           Python package - app logic
web/              built JS bundle(s) - app UI
assets/           icons, images
migrations/       declared data migrations between app versions
CHANGELOG.md      shown to schools when an update is offered
"""),
    para(
        'Nothing outside <font face="Courier">server/</font> and '
        '<font face="Courier">web/</font> executes. Assets are served as static files. '
        'There is no install script and no hook that runs at upload time.'
    ),
    PageBreak(),
]

# ------------------------------------------------------------------ 4
section('4. Manifest')
S += [
    code("""
{
  "key": "teacher_attendance",     // permanent; installations reference it
  "version": "1.2.0",              // semver; every submission is a version
  "runtime_api": "1.x",            // host API range this build needs
  "name": "Teacher Attendance",
  "summary": "Clock-in register and monthly reports for teaching staff.",
  "icon": "ClipboardCheck",
  "publisher": "EduIgnite",

  "scope": "both",                 // school | user | both
  "pricing": { "model": "subscription", "price": 15000, "currency": "XAF" },
  "roles": ["SCHOOL_ADMIN", "SUB_ADMIN", "TEACHER"],

  "collections": [ ... ],
  "screens":     [ ... ],
  "permissions": { ... },
  "jobs":        [ ... ]
}
"""),
    Paragraph(
        '<b>key is permanent.</b> Changing it orphans every installation and every row of '
        'school data, so the review pipeline rejects a submission whose key does not match '
        'the published app.', NOTE),
    para(
        '<font face="Courier">scope</font> and <font face="Courier">pricing</font> already '
        'exist in the shipped registry and mean the same things. '
        '<font face="Courier">both</font> is &ldquo;the school buys the licence and each '
        'user opts in&rdquo;, which is exactly the Teacher Attendance case.'
    ),
]

# ------------------------------------------------------------------ 5
section('5. Data')
S += [
    para(
        'Apps <b>declare collections</b>. They never create tables and never run schema '
        'migrations against the EduIgnite database. This is the single most important '
        'constraint in the design: an uploaded package that could alter the schema holding '
        'student records is not something we can make safe.'
    ),
    code("""
"collections": [
  {
    "name": "clock_events",
    "fields": [
      { "name": "teacher", "type": "reference", "to": "core.user",
        "required": true, "indexed": true },
      { "name": "date",    "type": "date", "required": true, "indexed": true },
      { "name": "status",  "type": "enum", "values": ["present","absent","late"] },
      { "name": "minutes_late", "type": "integer" }
    ]
  }
]
"""),
    para('Storage', H2),
    para('One platform-owned table holds every app&#39;s records:'),
    code("app_records(app_key, school_id, collection, record_id, data JSONB, created, modified)"),
    para(
        'Fields marked <font face="Courier">indexed</font> get GIN/expression indexes so '
        'real queries stay fast. If a collection outgrows JSONB &mdash; high volume, heavily '
        'queried &mdash; that is a signal it should be a built-in app instead, and the '
        'review gate is where we notice.'
    ),
    para('Isolation', H2),
    Paragraph(
        '<b>This is the real security boundary, not the language sandbox.</b> Apps get no '
        'ORM, no SQL and no connection. They get an SDK, and the SDK injects '
        '<font face="Courier">app_key</font> and <font face="Courier">school_id</font> into '
        'every read and write. An app <i>cannot express</i> a query reaching another '
        'app&#39;s collections or another school&#39;s rows, because there is no API '
        'surface through which to say it.<br/><br/>'
        'A language-level sandbox can be escaped. A missing API cannot be called.', NOTE),
    PageBreak(),
]

# ------------------------------------------------------------------ 6
section('6. Permissions')
S += [
    para(
        'An app declares everything it touches. The runtime enforces the declaration, and '
        'review checks the declaration against what the code actually does.'
    ),
    code("""
"permissions": {
  "core":        ["students:read", "users:read", "classes:read"],
  "collections": ["clock_events:read", "clock_events:write"],
  "notify":      ["staff"],
  "jobs":        true
}
"""),
    para(
        '<b>Core access is read-only in v1.</b> An app that could write student records or '
        'marks is one bad build away from corrupting a term of data, and nothing in the '
        'first four apps we want needs it. Revisit when something real requires it.'
    ),
    para(
        'Core reads go through the existing service boundaries &mdash; '
        '<font face="Courier">apps.students.api</font> and the ones that follow it &mdash; '
        'so apps are subject to the same rules as first-party code, and the boundary guard '
        'keeps applying.'
    ),
]

# ------------------------------------------------------------------ 7
section('7. UI')
S += [
    para(
        'Apps ship real UI code. It is loaded into an <b>iframe inside the EduIgnite '
        'dashboard chrome</b> &mdash; the approach VS Code uses for webviews.'
    ),
    code("""
"screens": [
  { "id": "register", "title": "Daily Register", "route": "/register",
    "roles": ["SCHOOL_ADMIN", "TEACHER"], "entry": "web/register.js" },
  { "id": "report", "title": "Monthly Report", "route": "/report",
    "roles": ["SCHOOL_ADMIN"], "entry": "web/report.js" }
]
"""),
    para(
        'The platform draws the navigation entry, the page frame, the title and the '
        'breadcrumbs. The app draws inside the panel.'
    ),
    para('Why an iframe', H2),
    para(
        'App UI <b>never receives the auth token and never touches the host DOM</b>. It '
        'asks the bridge for data and gets back only what its declared permissions allow. '
        'Even with trusted authorship this is worth having: a mistake in an app cannot leak '
        'a session, scrape a page, or interfere with a screen it does not own.'
    ),
    para('The bridge, over postMessage:'),
    code("""
bridge.data.query('clock_events', { where: { date: today }, limit: 200 })
bridge.data.insert('clock_events', { teacher, date, status })
bridge.core.students.list({ school_class })      // read-only
bridge.call('server_handler_name', args)          // invoke app server logic
bridge.ui.toast('Saved') / bridge.ui.confirm(...)
bridge.theme                                      // tokens, so apps look native
"""),
    PageBreak(),
]

# ------------------------------------------------------------------ 8
section('8. Execution')
S += [
    para('App server logic runs in a <b>dedicated host process</b>, never in gunicorn.'),
    code("client -> EduIgnite API -> permission check -> RPC -> app host process -> SDK -> database"),
    para(
        'Per call: a wall-clock timeout, a memory cap, no filesystem, no outbound network. '
        'A crash or a runaway loop takes down one app host worker; a supervisor restarts it '
        'and the platform never notices.'
    ),
    para('Scheduled work is declared, not self-scheduled:'),
    code('"jobs": [ { "name": "monthly_report", "schedule": "0 6 1 * *",\n'
         '            "handler": "jobs.monthly_report" } ]'),
    para('On the word &ldquo;sandbox&rdquo;', H2),
    Paragraph(
        'In-process Python sandboxing is <b>not</b> a security boundary. RestrictedPython, '
        '<font face="Courier">exec</font> with stripped globals and similar approaches have '
        'documented escapes, and we should not pretend otherwise in any document a school '
        'might read.', NOTE),
    para('What actually protects the platform, in order of importance:'),
    *bullets([
        'apps reach data only through a scoped SDK (&sect;5);',
        'logic runs in a separate process with limits (&sect;8);',
        'nothing runs until a human has reviewed and approved it (&sect;10);',
        'only our own team can publish.',
    ]),
    para(
        'Given trusted authorship, that combination is sufficient. It contains bugs, which '
        'is the actual threat. It would not stop a determined insider, and we should not '
        'claim it does.'
    ),
]

# ------------------------------------------------------------------ 9
section('9. Host API versioning &mdash; the permanent cost')
S += [
    para(
        'Once apps ship code against the runtime API, <b>we cannot break it without '
        'breaking apps</b>. Every exposed function is a long-term commitment.'
    ),
    *bullets([
        'the manifest declares <font face="Courier">runtime_api</font>;',
        'the platform advertises the range it supports;',
        'an incompatible app is <b>refused with a clear message, not loaded and crashed</b>;',
        'breaking changes require a major version, and the previous major stays supported '
        'until every published app has moved.',
    ]),
    para('Cheap to build now. Impossible to retrofit once apps exist in the wild.'),
    PageBreak(),
]

# ------------------------------------------------------------------ 10
section('10. Review pipeline')
S += [
    para('Automated checks first, then a person:'),
    *bullets([
        'manifest validates against schema; <font face="Courier">key</font> matches the '
        'published app; version increments;',
        'declared permissions match what static analysis finds the code doing;',
        'no forbidden imports (<font face="Courier">socket</font>, '
        '<font face="Courier">subprocess</font>, <font face="Courier">os</font>, raw DB access);',
        'migrations declare a reverse;',
        'bundle size within budget &mdash; these clients run on mid-range Android over slow '
        'connections;',
        '<b>the build runs against a staging school with test data and must pass.</b>',
    ]),
    para('That last one catches the class of mistake self-review reliably misses.'),
    Paragraph(
        '<b>Honest limitation.</b> Our team writes the apps and our team reviews them. That '
        'is a quality gate &mdash; regressions, bad migrations, slow queries &mdash; not an '
        'adversarial one. It should never be described to schools as though it verifies '
        'intent.<br/><br/>'
        'If review is to have teeth, the author and the approver should be different people. '
        'Worth deciding as policy rather than leaving to habit.', NOTE),
]

# ------------------------------------------------------------------ 11
section('11. Updates and rollback')
S += [
    para('Schools <b>pin to a version</b>. Updates are <i>offered</i>, not pushed:'),
    *bullets([
        'a published update shows in the school&#39;s app list with its changelog;',
        'an administrator chooses when to take it;',
        'founders can <b>force</b> a build when the current one is actively harmful &mdash; '
        'the &ldquo;halt rollout&rdquo; equivalent;',
        'rollback re-points a school at the previous approved version.',
    ]),
    para(
        'Silent auto-update is the wrong default here. A school mid-term cannot stop taking '
        'attendance while a surprise update settles.'
    ),
    para(
        'Data migrations between app versions are declared in '
        '<font face="Courier">migrations/</font>, run on update, and must declare a reverse '
        'so a rollback is not a data loss event.'
    ),
]

# ------------------------------------------------------------------ 12
section('12. Offline')
S += [
    para('Non-negotiable &mdash; these schools lose power and network routinely.'),
    *bullets([
        'manifest and UI bundles cached on device, keyed by app version;',
        'collection data cached per app; writes queued and synced on reconnect;',
        'the pinned version means a device offline for a week comes back to the version it '
        'left, not to a surprise.',
    ]),
    PageBreak(),
]

# ------------------------------------------------------------------ 13
section('13. Explicitly out of scope for v1')
S += [
    para('Named so nobody has to guess.'),
    table([
        ['Excluded', 'Why'],
        ['Third-party publishers', 'Only our team publishes. Removes the hostile-code problem entirely.'],
        ['Apps writing Core data', 'Read-only until something real needs otherwise.'],
        ['Outbound network calls from apps', 'No app reaches the internet from our server.'],
        ['Payment apps',
         'A wallet accepting online money needs gateway credentials, a ledger, '
         'reconciliation, refunds and an audit trail. That is reviewed as code, not '
         'assembled from plugin primitives. It ships built-in and is sold through the '
         'registry like any other app &mdash; same store, different construction.'],
        ['New UI component types', 'The component vocabulary belongs to the platform.'],
    ], [46 * mm, 119 * mm]),
]

# ------------------------------------------------------------------ 14
section('14. Build sequence')
S += [
    para('Each stage is useful on its own.'),
    table([
        ['#', 'Stage', 'Produces'],
        ['1', 'Package, upload, review, versioning', 'Apps exist and can be approved. Nothing executes yet.'],
        ['2', 'Data service and SDK', 'School and app scoping enforced. Testable without any app.'],
        ['3', 'Server execution host', 'Process isolation, limits, RPC.'],
        ['4', 'Client bridge and iframe renderer', 'Web first.'],
        ['5', 'Desktop and mobile', 'Plus offline bundle caching.'],
        ['6', 'Teacher Attendance as the first real app', 'Proves all of it end to end.'],
    ], [10 * mm, 68 * mm, 87 * mm]),
    para(
        'Teacher Attendance is deliberately the proving app rather than a content app like '
        'GCE Past Questions. It writes data, has roles, needs a report and a scheduled job. '
        'A content app would exercise almost none of the runtime and would teach us the '
        'wrong lessons.'
    ),
]

# ------------------------------------------------------------------ 15
section('15. Open decisions')
S += [
    para('Not settled. Each one changes the build.'),
    table([
        ['#', 'Decision', 'What hangs on it'],
        ['1', 'Python or JavaScript for app logic?',
         'Python fits the existing stack and team. JavaScript would mean one language for '
         'both halves of an app and one toolchain, at the cost of a second runtime on the '
         'server. Changes stage 3 substantially.'],
        ['2', 'Will apps ever write Core data?',
         'Read-only is the v1 position. If Teacher Attendance should update a teacher record, '
         'the permission model changes.'],
        ['3', 'Update default &mdash; offered or forced?', 'And who may force one.'],
        ['4', 'Author &ne; approver?', 'Decides whether review is a real gate.'],
        ['5', 'Data volume ceiling',
         'At what point does a collection stop being JSONB and become a signal that the app '
         'should be built in instead?'],
    ], [10 * mm, 52 * mm, 103 * mm]),
]

# ------------------------------------------------------------------ 16
section('16. What this costs')
S += [
    para(
        'This is the largest piece of work in the project by a wide margin: a package '
        'format, an upload and review pipeline, versioning, a process-isolated execution '
        'host, a scoped data SDK, a message bridge, an iframe renderer in three clients and '
        'offline bundle caching &mdash; before a single app exists.'
    ),
    para(
        'The App Registry already shipped is the foundation it sits on: installations, '
        'scopes, pricing, licence expiry and the console are built and working. An uploaded '
        'app is an installation like any other.'
    ),
    Paragraph(
        'Worth being clear-eyed that stages 1&ndash;5 produce <b>no visible feature for a '
        'school</b>. The first thing a school sees is stage 6.', NOTE),
    Spacer(1, 6 * mm),
    Paragraph(
        'This document is a design for review. Nothing described here is built.', CAPTION),
]

out = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   'EduIgnite-OS-App-Platform-Architecture.pdf')
build(out, S,
      title='EduIgnite OS — Uploadable App Platform Architecture',
      right_label='App Platform Architecture',
      subject='Design for apps built, uploaded, reviewed and updated independently')
print('written:', out)
