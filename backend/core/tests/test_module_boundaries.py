"""Guards the Student Management module boundary.

Student data is Core: every other feature reads and writes it through
``apps.students.api``, not by importing ``apps.students.models`` and querying
``Student.objects`` directly. That is what lets Student Management change its
own internals without breaking a dozen features.

This test is a *ratchet*, not a wall. The codebase predates the boundary, so
files that still reach past it are listed in ``KNOWN_VIOLATIONS`` below. The
test fails in two directions:

* a **new** file reaches past the boundary  -> add the call to
  ``apps.students.api`` instead (add a function there if one is missing);
* a listed file **stops** reaching past it  -> delete its line from the list,
  so the boundary can never silently slip back.

The list only ever shrinks. It is not a permission to add more.

Runs without a database on purpose (``SimpleTestCase``, source scanning only),
so the boundary is checked even where the test database is unreachable.
"""

import ast
import os

from django.test import SimpleTestCase

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
APPS_DIR = os.path.join(BACKEND_DIR, 'apps')

# The module every other feature must go through.
PUBLIC_API = 'apps.students.api'
# The internals it hides.
PRIVATE_PREFIX = 'apps.students.models'
# The app label, for the get_model() escape hatch.
APP_LABEL = 'students'

# Files that still import apps.students.models directly. Shrink this list;
# never grow it. Paths are relative to backend/ and use forward slashes.
KNOWN_VIOLATIONS = {
    'apps/attendance/tests.py',
    'apps/fees/tests.py',
    'apps/grades/tests.py',
    'apps/schools/tests.py',
}


def _python_files():
    for root, dirs, files in os.walk(APPS_DIR):
        dirs[:] = [d for d in dirs if d not in ('__pycache__', 'migrations')]
        for name in files:
            if name.endswith('.py'):
                yield os.path.join(root, name)


def _relative(path):
    return os.path.relpath(path, BACKEND_DIR).replace(os.sep, '/')


def _reaches_via_get_model(node):
    """Return whether this call is get_model('students', ...).

    ``apps.get_model('students', 'Student')`` reaches a model without importing
    anything, so an import-only check walks straight past it. It is the obvious
    way around this test, which is exactly why it is checked.
    """
    if not isinstance(node, ast.Call):
        return False
    name = node.func.attr if isinstance(node.func, ast.Attribute) else getattr(node.func, 'id', '')
    if name != 'get_model' or not node.args:
        return False
    first = node.args[0]
    if not isinstance(first, ast.Constant) or not isinstance(first.value, str):
        return False
    # Both call shapes: ('students', 'Student') and ('students.Student').
    return first.value.split('.')[0] == APP_LABEL


def _imports_student_internals(path):
    """Return whether this file reaches into Student Management's internals.

    Uses the AST rather than a text search so that a mention inside a comment,
    a docstring or this very test file is not mistaken for a real reach-in.
    Function-level imports count: hiding the import inside a function still
    couples the caller to those internals.
    """
    with open(path, encoding='utf-8') as handle:
        try:
            tree = ast.parse(handle.read(), filename=path)
        except SyntaxError:  # pragma: no cover - a broken file fails elsewhere
            return False

    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            module = node.module or ''
            if module == PRIVATE_PREFIX or module.startswith(PRIVATE_PREFIX + '.'):
                return True
        elif isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name == PRIVATE_PREFIX or alias.name.startswith(PRIVATE_PREFIX + '.'):
                    return True
        elif _reaches_via_get_model(node):
            return True
    return False


class StudentModuleBoundaryTests(SimpleTestCase):
    """Other features must go through apps.students.api, not the models."""

    def setUp(self):
        self.offenders = {
            _relative(path)
            for path in _python_files()
            # Student Management is allowed to know its own internals.
            if not _relative(path).startswith('apps/students/')
            and _imports_student_internals(path)
        }

    def test_no_new_module_boundary_violations(self):
        new = sorted(self.offenders - KNOWN_VIOLATIONS)
        self.assertEqual(
            new,
            [],
            'These files import apps.students.models directly instead of going '
            'through {api}:\n  {files}\n\nCall {api} instead. If it is missing '
            'the function you need, add one there — that is the supported way '
            'to grow the boundary.'.format(api=PUBLIC_API, files='\n  '.join(new)),
        )

    def test_known_violations_list_is_current(self):
        fixed = sorted(KNOWN_VIOLATIONS - self.offenders)
        self.assertEqual(
            fixed,
            [],
            'These files no longer import apps.students.models — remove them '
            'from KNOWN_VIOLATIONS in this file so the boundary cannot slip '
            'back:\n  {files}'.format(files='\n  '.join(fixed)),
        )

    def test_public_api_is_importable(self):
        """The boundary is only real if the module other features call exists."""
        from apps.students import api as students_api

        for name in (
            'get_student',
            'list_activation_matricules',
            'activation_matricule_exists',
            'list_class_ids_for_guardian',
            'has_pending_activation',
            'get_student_by_id_or_user',
            'get_pending_activation',
            'create_student_from_activation',
            'activation_was_used',
            'get_student_by_admission_number',
            'get_student_for_user',
            'list_students',
            'get_guardian_users',
            'get_guardian_users_by_student',
            'list_school_ids_for_guardian',
            'relabel_class',
            'list_student_ids_for_guardian',
            'is_guardian_of',
            'set_academic_standing',
        ):
            self.assertTrue(
                callable(getattr(students_api, name, None)),
                '{}.{} is missing — features depend on it.'.format(PUBLIC_API, name),
            )
