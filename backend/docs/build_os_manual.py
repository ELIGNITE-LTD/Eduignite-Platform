"""Builds the EduIgnite OS manual as a PDF.

Kept in the repo so the manual can be regenerated whenever the registry
changes, rather than becoming a stale binary nobody can update. The app table
is read from the live registry, so the manual cannot drift from the code.

    python docs/build_os_manual.py
"""

import os
import sys

import django

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.production')
django.setup()

from reportlab.lib import colors  # noqa: E402
from reportlab.lib.enums import TA_CENTER  # noqa: E402
from reportlab.lib.pagesizes import A4  # noqa: E402
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet  # noqa: E402
from reportlab.lib.units import mm  # noqa: E402
from reportlab.platypus import (  # noqa: E402
    KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
)

from apps.registry import api as registry_api  # noqa: E402

NAVY = colors.HexColor('#12314d')
BLUE = colors.HexColor('#264D73')
CYAN = colors.HexColor('#67D0E4')
GREY = colors.HexColor('#5b6b7c')
LIGHT = colors.HexColor('#F2F6FA')

styles = getSampleStyleSheet()


def style(name, **kw):
    kw.setdefault('parent', styles['Normal'])
    return ParagraphStyle(name, **kw)


BODY = style('Body', fontSize=10, leading=15.5, textColor=colors.HexColor('#22303c'),
             spaceAfter=8)
H1 = style('H1', fontName='Helvetica-Bold', fontSize=19, leading=23, textColor=NAVY,
           spaceBefore=6, spaceAfter=10)
H2 = style('H2', fontName='Helvetica-Bold', fontSize=13.5, leading=17, textColor=BLUE,
           spaceBefore=14, spaceAfter=6)
H3 = style('H3', fontName='Helvetica-Bold', fontSize=11, leading=14, textColor=NAVY,
           spaceBefore=10, spaceAfter=4)
BULLET = style('Bullet', parent=BODY, leftIndent=14, bulletIndent=4, spaceAfter=4)
CODE = style('Code', fontName='Courier', fontSize=8.4, leading=12,
             textColor=colors.HexColor('#11304a'), backColor=LIGHT,
             borderPadding=7, leftIndent=4, spaceBefore=5, spaceAfter=9)
NOTE = style('Note', parent=BODY, fontSize=9.4, leading=14, textColor=GREY,
             leftIndent=10, borderPadding=6, backColor=colors.HexColor('#FFF8E6'))
CAPTION = style('Caption', parent=BODY, fontSize=8.6, textColor=GREY, spaceAfter=12)


def para(text, s=BODY):
    return Paragraph(text, s)


def bullets(items, s=BULLET):
    return [Paragraph(f'&bull;&nbsp;&nbsp;{i}', s) for i in items]


def rule():
    t = Table([['']], colWidths=[165 * mm], rowHeights=[1.1])
    t.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), CYAN)]))
    return t


def header_footer(canvas, doc):
    canvas.saveState()
    if doc.page > 1:
        canvas.setFont('Helvetica-Bold', 7.5)
        canvas.setFillColor(BLUE)
        canvas.drawString(20 * mm, 285 * mm, 'EDUIGNITE OS')
        canvas.setFont('Helvetica', 7.5)
        canvas.setFillColor(GREY)
        canvas.drawRightString(190 * mm, 285 * mm, 'App Registry Manual')
        canvas.setStrokeColor(colors.HexColor('#dbe4ec'))
        canvas.setLineWidth(0.5)
        canvas.line(20 * mm, 282 * mm, 190 * mm, 282 * mm)
        canvas.setFont('Helvetica', 8)
        canvas.setFillColor(GREY)
        canvas.drawCentredString(105 * mm, 12 * mm, str(doc.page))
    canvas.restoreState()


def table(rows, widths, head=True):
    t = Table(rows, colWidths=widths, repeatRows=1 if head else 0)
    cmds = [
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 8.3),
        ('LEADING', (0, 0), (-1, -1), 11.5),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 7),
        ('RIGHTPADDING', (0, 0), (-1, -1), 7),
        ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#dbe4ec')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F8FAFC')]),
    ]
    if head:
        cmds += [
            ('BACKGROUND', (0, 0), (-1, 0), NAVY),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ]
    t.setStyle(TableStyle(cmds))
    return t


story = []

# ---------------------------------------------------------------- cover
story += [
    Spacer(1, 45 * mm),
    Paragraph('EDUIGNITE', ParagraphStyle('CoverBrand', parent=styles['Normal'],
              fontName='Helvetica-Bold', fontSize=40, leading=44, textColor=NAVY,
              alignment=TA_CENTER)),
    Spacer(1, 3 * mm),
    Paragraph('O P E R A T I N G &nbsp; S Y S T E M',
              ParagraphStyle('CoverSub', parent=styles['Normal'], fontName='Helvetica-Bold',
                             fontSize=12, textColor=CYAN, alignment=TA_CENTER)),
    Spacer(1, 10 * mm),
    rule(),
    Spacer(1, 10 * mm),
    Paragraph('App Registry &mdash; Complete Manual',
              ParagraphStyle('CoverTitle', parent=styles['Normal'], fontName='Helvetica-Bold',
                             fontSize=17, textColor=BLUE, alignment=TA_CENTER)),
    Spacer(1, 6 * mm),
    Paragraph('How founders install apps for schools,<br/>and how developers add new ones.',
              ParagraphStyle('CoverBlurb', parent=styles['Normal'], fontSize=10.5, leading=16,
                             textColor=GREY, alignment=TA_CENTER)),
    Spacer(1, 60 * mm),
    Paragraph('Powered by EduIgnite &nbsp;&middot;&nbsp; Bamenda, Cameroon',
              ParagraphStyle('CoverFoot', parent=styles['Normal'], fontSize=8.5,
                             textColor=GREY, alignment=TA_CENTER)),
    PageBreak(),
]

# ---------------------------------------------------------------- part 0
story += [
    para('1. What the OS is', H1),
    rule(),
    Spacer(1, 5 * mm),
    para(
        'EduIgnite is built as a <b>Core</b> plus a set of <b>Apps</b>. Core is the part '
        'no school can run without: accounts, schools and classes, student records, '
        'notifications. Apps are the features sold and enabled on top of it &mdash; '
        'Attendance, Marks &amp; Report Cards, Fees, Messaging, the Library, and the rest.'
    ),
    para(
        'An app is a feature module that <b>ships inside the release</b>. Installing an app '
        'for a school grants that school a licence to use it. No code is transferred, '
        'downloaded or uploaded.'
    ),
    para('Why it works that way', H2),
    para(
        'EduIgnite runs on Android through Capacitor and on Windows through Electron. Both '
        'are compiled binaries that a school downloads. Schools also have to keep working '
        'through power and network cuts. A design where apps arrive over the network at '
        'runtime would break offline use, and would not survive app-store rules on shipping '
        'executable code. Shipping every app in the binary and controlling access with a '
        'licence is the only approach that is reliable on the connections these schools have.'
    ),
    para('What that means in practice', H2),
    *bullets([
        'A founder can give or remove an app for a school <b>instantly</b>. It is a licence change.',
        'A brand-new app requires a release: a backend deploy plus new mobile and desktop builds.',
        'Uninstalling an app <b>never deletes the school\'s data</b>.',
        'Core apps cannot be uninstalled by anyone. Nothing works without them.',
    ]),
    Spacer(1, 4 * mm),
    Paragraph(
        '<b>Important.</b> Hiding an app in the menu is presentation only. The real check runs '
        'on the server on every request, so a school without an app cannot reach its data even '
        'with a valid login and a direct request.', NOTE),
    PageBreak(),
]

# ---------------------------------------------------------------- part 1
story += [
    para('2. For founders: the Executive Console', H1),
    rule(),
    Spacer(1, 5 * mm),
    para(
        'The App Registry is open to the CEO, the CTO and Super Admins. Nobody else can see '
        'it, including school administrators.'
    ),
    para('Opening it', H2),
    *bullets([
        'Sign in to your founder account on web, desktop or mobile.',
        'In the left menu choose <b>App Registry</b>.',
        'Pick a school from the dropdown at the top right.',
    ]),
    para('What you see', H2),
    para(
        'Every app in the release, as a card showing its name, what it does, its tier, and '
        'its state for the school you selected. Use the search box to filter by name or '
        'description.'
    ),
    para('Installing an app', H2),
    *bullets([
        'Find the app and press <b>Install for this school</b>.',
        'It is available to that school immediately &mdash; staff see it on their next screen load.',
        'No deploy, no restart, no new download for the school.',
    ]),
    para('Removing an app', H2),
    *bullets([
        'Press <b>Remove from this school</b>.',
        'A confirmation appears listing exactly which records are affected.',
        'Confirm, and the school loses access at once.',
    ]),
    Spacer(1, 3 * mm),
    Paragraph(
        '<b>Removal keeps the data.</b> If you remove Attendance, that school\'s attendance '
        'records are not deleted. Staff simply cannot open the app. Re-install it and '
        'everything is exactly where it was. This is deliberate: an accidental removal of a '
        'term\'s marks or attendance has to be recoverable.', NOTE),
    para('Tiers', H2),
    para('Each app sits in one of four tiers, which decides how a school gets it.'),
    table([
        ['Tier', 'Meaning'],
        ['Core', 'The platform itself. Always on, never billed, cannot be removed.'],
        ['Included', 'Comes with any subscription. New schools get these automatically.'],
        ['Standard', 'Sold separately. A founder installs it per school.'],
        ['Premium', 'Sold separately, higher tier. A founder installs it per school.'],
    ], [28 * mm, 137 * mm]),
    para('Licence expiry', H2),
    para(
        'An installation can carry an expiry date. On the day after it passes, the school '
        'loses access automatically &mdash; no action needed from you &mdash; and the app '
        'shows as <i>Licence expired</i> in the console. Leave the date blank for no expiry.'
    ),
    para('New schools', H2),
    para(
        'When you create a school it is given every <b>Included</b> app straight away, so it '
        'is usable from the first login. Standard and Premium apps are added by you.'
    ),
    PageBreak(),
]

# ---------------------------------------------------------------- catalogue
catalogue = registry_api.list_catalogue()
rows = [['App', 'Tier', 'What it does']]
for m in catalogue:
    rows.append([m.name, m.tier.value.title(), m.summary])

story += [
    para('3. The apps in this release', H1),
    rule(),
    Spacer(1, 5 * mm),
    para(
        f'{len(catalogue)} apps ship in this release. This table is generated from the '
        'registry itself, so it always matches what is actually installed on the server.'
    ),
    Spacer(1, 3 * mm),
    table(rows, [38 * mm, 20 * mm, 107 * mm]),
    Paragraph(
        'Core apps are listed first. Anything not marked Core can be installed and removed '
        'per school.', CAPTION),
    PageBreak(),
]

# ---------------------------------------------------------------- part 2
story += [
    para('4. For developers: adding an app', H1),
    rule(),
    Spacer(1, 5 * mm),
    para(
        'An app is a Django app that declares itself, reads Core data through Core service '
        'APIs, and guards its own endpoints. Four steps.'
    ),

    para('Step 1 &mdash; Declare it', H2),
    para('Create <font face="Courier">apps/&lt;name&gt;/eduignite_app.py</font>:'),
    Paragraph(
        'from apps.registry.manifest import AppManifest, AppTier, register<br/><br/>'
        'register(<br/>'
        '&nbsp;&nbsp;&nbsp;&nbsp;AppManifest(<br/>'
        '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;key=&#39;transport&#39;,<br/>'
        '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;name=&#39;School Transport&#39;,<br/>'
        '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;summary=&#39;Bus routes, stops and pickup registers.&#39;,<br/>'
        '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon=&#39;Bus&#39;,<br/>'
        '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;tier=AppTier.STANDARD,<br/>'
        '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;roles=[&#39;SCHOOL_ADMIN&#39;, &#39;TEACHER&#39;, &#39;PARENT&#39;],<br/>'
        '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;routes=[&#39;/dashboard/transport&#39;],<br/>'
        '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;api_prefixes=[&#39;transport/&#39;],<br/>'
        '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;core_services=[&#39;students&#39;],<br/>'
        '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;owns_data=[&#39;bus routes&#39;, &#39;pickup records&#39;],<br/>'
        '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;price_hint=&#39;Standard&#39;,<br/>'
        '&nbsp;&nbsp;&nbsp;&nbsp;)<br/>'
        ')', CODE),
    para(
        'Add the app to <font face="Courier">INSTALLED_APPS</font>. The registry finds the '
        'declaration at startup. A mistake in it stops the server rather than producing a '
        'platform quietly missing a feature.'
    ),
    *bullets([
        '<b>key</b> is permanent. Installations reference it; changing it orphans every licence.',
        '<b>routes</b> must be unique across all apps &mdash; two apps claiming one route is a test failure.',
        '<b>core_services</b> may only name Core apps.',
        '<b>owns_data</b> is shown verbatim in the uninstall warning, so write it in plain language.',
    ]),

    para('Step 2 &mdash; Read Core data through the Core API', H2),
    para(
        'Never import another app\'s models. Student data goes through '
        '<font face="Courier">apps.students.api</font>, which is enforced by a test. The full '
        'reference is in <i>docs/student-boundary.md</i>.'
    ),
    Paragraph(
        'from apps.students import api as students_api<br/><br/>'
        'students = students_api.list_students(school=request.user.school)', CODE),

    para('Step 3 &mdash; Guard the endpoints', H2),
    para('Every view the app owns must carry the guard:'),
    Paragraph(
        'from apps.registry.permissions import RequiresApp<br/><br/>'
        'class TransportViewSet(viewsets.ModelViewSet):<br/>'
        '&nbsp;&nbsp;&nbsp;&nbsp;permission_classes = [IsAuthenticated, RequiresApp(&#39;transport&#39;)]',
        CODE),
    Spacer(1, 2 * mm),
    Paragraph(
        '<b>Watch out.</b> If your class defines <font face="Courier">get_permissions()</font>, '
        'DRF ignores <font face="Courier">permission_classes</font> completely and your guard '
        'enforces nothing while still looking correct in review. Put the guard inside '
        '<font face="Courier">get_permissions()</font> as well. A test checks for this, '
        'because it is invisible on inspection.', NOTE),

    para('Step 4 &mdash; Run the tests', H2),
    Paragraph('python manage.py test apps.registry core.tests.test_module_boundaries', CODE),
    para('These run without a database. They will fail if:'),
    *bullets([
        'an app has no name or summary, or a key that is not a slug;',
        'two apps claim the same route;',
        'an app depends on a service that is not Core;',
        'a guard is shadowed by <font face="Courier">get_permissions()</font>;',
        'a sellable app guards no endpoint at all;',
        'anything outside <font face="Courier">apps/students/</font> imports student models directly.',
    ]),
    PageBreak(),
]

# ---------------------------------------------------------------- part 3
story += [
    para('5. Reference', H1),
    rule(),
    Spacer(1, 5 * mm),

    para('Endpoints', H2),
    table([
        ['Endpoint', 'Who', 'Purpose'],
        ['GET /api/v1/registry/my-apps/', 'Any signed-in user',
         "The caller's apps and routes. Clients call this to build navigation."],
        ['GET /api/v1/registry/catalogue/', 'Founders', 'Every app in the release.'],
        ['GET /api/v1/registry/schools/{id}/apps/', 'Founders',
         "The catalogue annotated with one school's state."],
        ['POST /api/v1/registry/schools/{id}/apps/', 'Founders',
         'Install, uninstall, or set a licence expiry.'],
    ], [58 * mm, 27 * mm, 80 * mm]),

    para('Install / uninstall request', H2),
    Paragraph(
        'POST /api/v1/registry/schools/&lt;school_id&gt;/apps/<br/>'
        '{<br/>'
        '&nbsp;&nbsp;&quot;app_key&quot;: &quot;attendance&quot;,<br/>'
        '&nbsp;&nbsp;&quot;action&quot;: &quot;install&quot;,'
        ' &nbsp;&nbsp;// install | uninstall | set_expiry<br/>'
        '&nbsp;&nbsp;&quot;licence_expiry&quot;: &quot;2026-09-01&quot;,'
        ' &nbsp;// optional, null for none<br/>'
        '&nbsp;&nbsp;&quot;note&quot;: &quot;Paid to end of year&quot;<br/>'
        '}', CODE),

    para('Service API', H2),
    para('For code that needs to ask about entitlements directly:'),
    table([
        ['Function', 'Returns'],
        ['is_installed(school, app_key)', 'bool &mdash; may this school use the app'],
        ['is_installed_for_user(user, app_key)',
         "bool &mdash; same, via the user's school. Executives always pass."],
        ['installed_app_keys(school)', 'set of keys, always including Core'],
        ['describe_for_school(school)', 'catalogue annotated with state, for the console'],
        ['install(school, key, by=, licence_expiry=, note=)', 'AppInstallation'],
        ['uninstall(school, key, by=, note=)', 'AppInstallation (data kept)'],
        ['set_licence_expiry(school, key, expiry)', 'AppInstallation'],
        ['install_defaults(school, by=)', 'int &mdash; installs every Included app'],
    ], [78 * mm, 87 * mm]),

    para('Where things live', H2),
    table([
        ['Path', 'What'],
        ['apps/registry/manifest.py', 'The manifest format and the registry itself'],
        ['apps/registry/models.py', 'AppInstallation &mdash; one row per school per app'],
        ['apps/registry/api.py', 'Service API; the supported way to ask and to change'],
        ['apps/registry/permissions.py', 'RequiresApp &mdash; server-side enforcement'],
        ['apps/registry/views.py', 'Console endpoints'],
        ['apps/registry/tests.py', 'Registry tests; no database needed'],
        ['apps/&lt;name&gt;/eduignite_app.py', "Each app's declaration"],
        ['src/app/dashboard/apps/page.tsx', 'The Executive Console screen'],
        ['src/lib/hooks/useRegistry.ts', 'Client hooks'],
        ['docs/student-boundary.md', 'The Core service manual'],
    ], [66 * mm, 99 * mm]),
    PageBreak(),

    para('6. Deploying this release', H1),
    rule(),
    Spacer(1, 5 * mm),
    para(
        'This release adds the registry to a platform where every school already had every '
        'feature. The migration handles that, but the order matters.'
    ),
    para('Order of operations', H2),
    *bullets([
        'Deploy the backend and run <font face="Courier">python manage.py migrate</font>.',
        'Migration <font face="Courier">registry.0002</font> grants every existing school '
        'every non-core app.',
        'Restart gunicorn <b>and</b> the Celery worker and beat.',
        'Sign in as a founder and open App Registry to confirm schools show their apps.',
    ]),
    Spacer(1, 3 * mm),
    Paragraph(
        '<b>Do not skip the migration.</b> Without it, entitlements are enforced that nobody '
        'has been granted, and every existing school loses Attendance, Marks, Fees and Chat '
        'the moment the release goes live. With it, the registry changes nothing for current '
        'schools and starts mattering only for new ones.', NOTE),
    para('Restarting Celery', H2),
    para(
        'The worker and beat load application code at startup. Restarting only gunicorn '
        'leaves them running the previous release against the new API, which has caused a '
        'worker restart loop on this platform before. Restart all three.'
    ),
    para('Verifying after deploy', H2),
    *bullets([
        'Open App Registry and check an existing school lists its apps as installed.',
        'Remove a Standard app from a test school; confirm it disappears from that school\'s menu.',
        'Confirm the endpoint refuses it too, not just the menu.',
        'Re-install it and confirm the school\'s existing records are all still there.',
        'Create a new school and confirm it arrives with the Included apps.',
    ]),
    Spacer(1, 4 * mm),
    Paragraph(
        '<b>Known gap.</b> The registry\'s own tests run without a database and all pass. The '
        'paths that touch the database &mdash; installing, removing, the grandfather '
        'migration &mdash; have not been executed against a real database, because the test '
        'database was not reachable from the machine this was built on. Run the checks above '
        'on a staging copy before trusting this in front of schools.', NOTE),
]

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'EduIgnite-OS-Manual.pdf')
doc = SimpleDocTemplate(
    out, pagesize=A4,
    leftMargin=22 * mm, rightMargin=22 * mm,
    topMargin=25 * mm, bottomMargin=20 * mm,
    title='EduIgnite OS — App Registry Manual',
    author='EduIgnite',
    subject='How to use the EduIgnite OS App Registry',
)
doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)
print('written:', out)
