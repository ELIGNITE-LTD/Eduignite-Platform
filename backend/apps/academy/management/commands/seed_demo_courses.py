"""Seed (or remove) demo content for EduIgnite Academy.

The public `/academy` and `/academy/courses` pages read from
``Course.objects.filter(status=Course.Status.PUBLISHED)`` (see
``apps.academy.views.CourseViewSet.get_queryset``), and the landing page's
"Featured" rail additionally requires ``is_featured=True`` (see
``fetchCourses({ featured: true })`` in
``apps/website/src/app/academy/_lib/public-api.ts`` and
``apps/website/src/app/academy/page.tsx``). Before this command runs there is
no real course content, so both sections render their empty states.

This command creates one demo course per role pathway (PRINCIPAL, TEACHER,
ACCOUNTANT, LIBRARIAN, GENERAL) with realistic modules/lessons, so those
pages have real content to show. It is deliberately schema-free: no new
``is_demo`` column/migration. Every demo course/row is identified purely by
its title being prefixed ``"[DEMO] "``, which makes the whole thing trivially
reversible with `--delete` and safe to run repeatedly (idempotent — an
existing course with the exact same title is left alone, never duplicated).
"""

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify

from apps.academy.models import Course, Lesson, Module
from apps.users.models import User, UserRole

DEMO_PREFIX = '[DEMO] '
DEMO_NOTE = 'Demo/test content — safe to delete (run `python manage.py seed_demo_courses --delete`).'

# One entry per apps/website/src/app/academy/_lib/public-api.ts::ROLE_PATHWAYS
# value. `published` picks which demo courses are actually publicly visible
# (status=PUBLISHED) vs. left as pending review, so the seeded catalog looks
# like a real, partially-curated CMS rather than "everything switched on at
# once". Lesson topics are kept deliberately in line with each pathway's
# "focus" wording already established in that file.
COURSE_SPECS = [
    {
        'role_pathway': Course.RolePathway.PRINCIPAL,
        'title': 'EduIgnite for Principals — Getting Started',
        'description': (
            'A task-oriented walkthrough for school principals and administrators: '
            'set up your school on EduIgnite, assign classes, publish report cards, '
            'and keep parents and staff informed with announcements. '
            f'{DEMO_NOTE}'
        ),
        'published': True,
        'featured': True,
        'modules': [
            {
                'title': 'School Setup',
                'lessons': [
                    ('Creating your school profile', 'Enter your school\'s name, address, academic year, and grading scale so every other module has the right foundation.'),
                    ('Adding classes and sections', 'Build out your class list — from Nursery to Form 5 or SS3 — and split large classes into sections.'),
                    ('Inviting teachers and staff', 'Send invitations to your teaching and non-teaching staff and assign each one a role.'),
                ],
            },
            {
                'title': 'Class Assignments',
                'lessons': [
                    ('Assigning a class teacher', 'Pick the right teacher for each class and section, and understand what access that grants them.'),
                    ('Assigning subjects to teachers', 'Map subjects to the teachers who will deliver them for the term.'),
                ],
            },
            {
                'title': 'Reports and Announcements',
                'lessons': [
                    ('Reviewing and publishing report cards', 'Check grades submitted by teachers, sign off, and publish report cards to parents.'),
                    ('Posting a school-wide announcement', 'Draft and send an announcement to every parent and staff member in one place.'),
                    ('Reading the principal dashboard', 'Interpret enrollment, attendance, and fee-collection numbers at a glance.'),
                ],
            },
        ],
    },
    {
        'role_pathway': Course.RolePathway.TEACHER,
        'title': 'EduIgnite for Teachers — Getting Started',
        'description': (
            'Everything a classroom teacher needs on day one: view your assigned classes, '
            'take attendance, and enter marks and results without leaving the app. '
            f'{DEMO_NOTE}'
        ),
        'published': True,
        'featured': True,
        'modules': [
            {
                'title': 'Your Classes',
                'lessons': [
                    ('Finding your assigned classes', 'Locate every class and subject you have been assigned for the term.'),
                    ('Viewing your class list', 'See the full roster for a class, including each student\'s photo and guardian contact.'),
                ],
            },
            {
                'title': 'Attendance',
                'lessons': [
                    ('Recording daily attendance', 'Mark students present, absent, or late in under a minute per class.'),
                    ('Correcting a past attendance record', 'Fix a mistaken mark from an earlier date without breaking the register.'),
                ],
            },
            {
                'title': 'Marks and Results',
                'lessons': [
                    ('Entering continuous assessment marks', 'Enter CA1, CA2, and exam scores against the subjects you teach.'),
                    ('Submitting results for a term', 'Lock in and submit your final marks so the principal can review and publish report cards.'),
                ],
            },
        ],
    },
    {
        'role_pathway': Course.RolePathway.ACCOUNTANT,
        'title': 'EduIgnite for Accountants — Getting Started',
        'description': (
            'Set up your finance dashboard, record fee payments as they come in, and '
            'generate receipts parents can trust. '
            f'{DEMO_NOTE}'
        ),
        'published': True,
        'featured': True,
        'modules': [
            {
                'title': 'Finance Dashboard Setup',
                'lessons': [
                    ('Configuring fee categories and terms', 'Set up tuition, PTA, and exam fee categories for each term or session.'),
                    ('Setting per-class fee amounts', 'Assign the correct fee amount to every class so invoices calculate themselves.'),
                ],
            },
            {
                'title': 'Recording Payments',
                'lessons': [
                    ('Recording a cash payment', 'Log a walk-in cash payment against a student\'s outstanding balance.'),
                    ('Recording a mobile money or bank payment', 'Reconcile a payment made outside the front desk against the right student.'),
                    ('Handling a partial payment', 'Record an installment and see the remaining balance update automatically.'),
                ],
            },
            {
                'title': 'Receipts and Reports',
                'lessons': [
                    ('Generating a receipt', 'Produce a printable or shareable receipt the moment a payment is recorded.'),
                    ('Running the fee-collection report', 'Pull a summary of collections by class, term, or payment method.'),
                ],
            },
        ],
    },
    {
        'role_pathway': Course.RolePathway.LIBRARIAN,
        'title': 'EduIgnite for Librarians — Getting Started',
        'description': (
            'Get the school library online: catalog your book inventory, register '
            'borrowers, and manage issuing and returns without a paper ledger. '
            f'{DEMO_NOTE}'
        ),
        'published': True,
        'featured': False,
        'modules': [
            {
                'title': 'Book Inventory',
                'lessons': [
                    ('Adding a book to the catalog', 'Enter title, author, ISBN, and copy count for a new book.'),
                    ('Bulk-importing an existing catalog', 'Bring in a spreadsheet of your current physical catalog in one pass.'),
                ],
            },
            {
                'title': 'Borrower Registration',
                'lessons': [
                    ('Registering a student as a borrower', 'Link a library card to a student profile already in EduIgnite.'),
                    ('Setting borrowing limits', 'Cap how many books a class level can borrow at once.'),
                ],
            },
            {
                'title': 'Issuing and Returns',
                'lessons': [
                    ('Issuing a book', 'Check a book out to a borrower and set the due date.'),
                    ('Processing a return', 'Mark a book back in and clear it from the borrower\'s record.'),
                    ('Handling an overdue or lost book', 'Flag an overdue loan and record a replacement fee for a lost copy.'),
                ],
            },
        ],
    },
    {
        'role_pathway': Course.RolePathway.GENERAL,
        'title': 'EduIgnite Essentials — Getting Started',
        'description': (
            'Foundational EduIgnite skills useful to anyone on the platform, '
            'regardless of role: navigating the dashboard, managing your profile, '
            'and getting help when you\'re stuck. '
            f'{DEMO_NOTE}'
        ),
        'published': False,
        'featured': False,
        'modules': [
            {
                'title': 'Finding Your Way Around',
                'lessons': [
                    ('A tour of the EduIgnite dashboard', 'Orient yourself: navigation, notifications, and where your role-specific tools live.'),
                    ('Switching between schools or roles', 'For users who belong to more than one school or hold more than one role.'),
                ],
            },
            {
                'title': 'Your Account',
                'lessons': [
                    ('Updating your profile and password', 'Keep your contact details current and set a strong password.'),
                    ('Managing notification preferences', 'Choose what you get notified about, and how.'),
                ],
            },
        ],
    },
]


class Command(BaseCommand):
    help = (
        'Seed demo EduIgnite Academy courses (one per role pathway) so the public '
        '/academy and /academy/courses pages have real content. Idempotent — safe '
        'to run more than once. Pass --delete to remove every course whose title '
        'starts with "[DEMO] " (modules/lessons/etc. cascade-delete via their FKs).'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--delete',
            action='store_true',
            help='Remove every demo course (title starting with "[DEMO] ") instead of creating them.',
        )
        parser.add_argument(
            '--created-by',
            dest='created_by',
            default=None,
            help=(
                'Matricule of the user to attribute demo courses to as creator/approver. '
                'Falls back to an existing CEO/CTO/COO account, or the first superuser, '
                'if omitted.'
            ),
        )

    def handle(self, *args, **options):
        if options['delete']:
            self._delete_demo_courses()
            return
        self._seed_demo_courses(options.get('created_by'))

    # -- delete ------------------------------------------------------------

    def _delete_demo_courses(self):
        qs = Course.objects.filter(title__startswith=DEMO_PREFIX)
        count = qs.count()
        if count == 0:
            self.stdout.write('No demo courses found — nothing to delete.')
            return
        titles = list(qs.values_list('title', flat=True))
        qs.delete()  # cascades to Module/Lesson/Resource/Quiz/etc. via their FK on_delete
        self.stdout.write(self.style.SUCCESS(f'Deleted {count} demo course(s):'))
        for title in titles:
            self.stdout.write(f'  - {title}')

    # -- seed ----------------------------------------------------------------

    def _resolve_creator(self, matricule):
        if matricule:
            try:
                return User.objects.get(matricule=matricule)
            except User.DoesNotExist:
                raise CommandError(f'No user found with matricule "{matricule}".')
        # Sensible fallback: an existing platform executive account (CEO, CTO,
        # then COO — the order here is just a deterministic tie-break for this
        # seed script, not a statement about relative authority between the
        # CEO/CTO founders). Falls further back to any superuser, then to
        # whichever user happens to exist first, so the command never hard-fails
        # with an IntegrityError on Course.created_by just because no exec
        # account exists yet in this particular database.
        for role in (UserRole.CEO, UserRole.CTO, UserRole.COO):
            user = User.objects.filter(role=role).order_by('matricule').first()
            if user:
                return user
        user = User.objects.filter(is_superuser=True).order_by('matricule').first()
        if user:
            return user
        user = User.objects.order_by('id').first()
        if user:
            return user
        return None

    def _seed_demo_courses(self, created_by_matricule):
        creator = self._resolve_creator(created_by_matricule)
        if creator is None:
            self.stderr.write(self.style.ERROR(
                'No users exist in this database — cannot set Course.created_by. '
                'Create at least one user first (e.g. via createsuperuser), then re-run.'
            ))
            return

        self.stdout.write(f'Attributing demo courses to: {creator.matricule} ({creator.name})')

        created_count = 0
        skipped_count = 0

        for spec in COURSE_SPECS:
            title = DEMO_PREFIX + spec['title']
            existing = Course.objects.filter(title=title).first()
            if existing:
                self.stdout.write(f'Skipping (already exists): {title}')
                skipped_count += 1
                continue

            with transaction.atomic():
                course = self._create_course(spec, title, creator)

            self.stdout.write(self.style.SUCCESS(
                f'Created: {title} '
                f'({course.modules.count()} modules, '
                f'{sum(m.lessons.count() for m in course.modules.all())} lessons, '
                f'status={course.status}, featured={course.is_featured})'
            ))
            created_count += 1

        self.stdout.write(
            f'\nDone. Created {created_count}, skipped {skipped_count} '
            f'(already present) out of {len(COURSE_SPECS)} demo course(s).'
        )

    def _create_course(self, spec, title, creator):
        slug = self._unique_slug(title)
        status = Course.Status.PUBLISHED if spec['published'] else Course.Status.PENDING_REVIEW

        course = Course.objects.create(
            title=title,
            slug=slug,
            description=spec['description'],
            role_pathway=spec['role_pathway'],
            status=status,
            created_by=creator,
            assigned_by=creator,
            approved_by=creator if spec['published'] else None,
            approved_at=timezone.now() if spec['published'] else None,
            is_featured=bool(spec['featured']) and spec['published'],
        )

        for module_order, module_spec in enumerate(spec['modules']):
            module = Module.objects.create(
                course=course,
                title=module_spec['title'],
                order=module_order,
            )
            for lesson_order, (lesson_title, lesson_description) in enumerate(module_spec['lessons']):
                Lesson.objects.create(
                    module=module,
                    title=lesson_title,
                    order=lesson_order,
                    duration_minutes=6,
                    description=lesson_description,
                )

        return course

    def _unique_slug(self, title):
        base = slugify(title)
        slug = base
        suffix = 2
        while Course.objects.filter(slug=slug).exists():
            slug = f'{base}-{suffix}'
            suffix += 1
        return slug
