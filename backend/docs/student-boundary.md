# The Student Management boundary

A manual for working with `apps.students.api` — the first Core service in the
EduIgnite architecture.

---

## 1. What this is, in one paragraph

Student data is used by nearly every feature in EduIgnite: attendance, grades,
fees, chat, exams, the library, notifications. Before this work, each of those
features imported `apps.students.models` and wrote its own queries against
`Student.objects`. That meant Student Management could not change any of its own
internals without breaking a dozen other features, and the same logic — "who are
this student's parents?", "which students is this parent allowed to see?" — was
re-implemented, slightly differently, in twenty places.

`apps.students.api` is now the one supported way for any other feature to read
or write student data. Student Management owns what is behind it and can change
freely, as long as the functions keep their promises.

---

## 2. The rule

> **No app outside `apps/students/` may import `apps.students.models`.**
> Call `apps.students.api` instead.

This is enforced by a test, not by discipline. See section 6.

---

## 3. Using it

Import it once at the top of your module:

```python
from apps.students import api as students_api
```

Then call it. The full surface is 19 functions, grouped below.

### Finding a student

```python
students_api.get_student(student_id)                 # -> Student | None
students_api.get_student_for_user(user)              # -> Student | None
students_api.get_student_by_admission_number(number) # -> Student | None
students_api.get_student_by_id_or_user(identifier)   # -> Student | None
```

All of them return `None` rather than raising. There is no `DoesNotExist` to
catch — that is deliberate, so the failure mode stays in your hands and the
model's exception type does not leak across the boundary:

```python
student = students_api.get_student_for_user(request.user)
if student is None:
    return Response({'detail': 'No student profile.'}, status=404)
```

`get_student_by_admission_number` is the one used by public QR verification. It
deliberately excludes drafted students and students of drafted schools — a
record that is not live must never be confirmed as authentic.

`get_student_by_id_or_user` accepts either kind of id, for endpoints that take a
`student` value straight off a request and cannot tell which they were handed.

### Listing students

```python
students_api.list_students(school=None, school_class=None, class_name='')
```

Returns a **QuerySet**, not a list. That is on purpose — you keep the full power
of the ORM and can carry on chaining:

```python
students = (
    students_api.list_students(school=request.user.school)
    .select_related('school_class__sub_school')
    .filter(user__role='STUDENT')
    .order_by('user__name')
)
```

`school` and `school_class` accept a model instance *or* a primary key.
`class_name` matches the denormalised text label carried by students who predate
concrete class records.

Call it with no arguments to get every student, then narrow however you like.

### Parents and guardians

A student can be linked to an adult two ways: the older `ParentStudentLink`
(parent user → student) and the newer `Guardian` record, which may or may not
own a user account. **You should never need to know that.** These helpers always
consider both:

```python
students_api.get_guardian_users(student)              # -> [User, ...]
students_api.get_guardian_users_by_student(students)  # -> {student_id: [User, ...]}
students_api.list_student_ids_for_guardian(user)      # -> {uuid, ...}
students_api.list_school_ids_for_guardian(user)       # -> {uuid, ...}
students_api.list_class_ids_for_guardian(user)        # -> {uuid, ...}
students_api.is_guardian_of(user, student)            # -> bool
```

**Notifying one student's parents:**

```python
for parent in students_api.get_guardian_users(record.student):
    if parent.email:
        send_mail(..., [parent.email])
```

**Notifying a whole class — use the bulk form.** Calling the single-student
helper in a loop turns one query into N:

```python
guardians_by_student = students_api.get_guardian_users_by_student(student_list)
names = {s.id: s.user.name for s in student_list}
for student_id, guardians in guardians_by_student.items():
    for parent in guardians:
        notify(parent, f"News about {names[student_id]}")
```

It keeps the mapping so you can still address each parent about *their own*
child, which matters for a parent with several children in the school.

**Scoping what a parent may see** — pick the helper that matches the shape of
your filter:

```python
# by student
qs.filter(student_id__in=students_api.list_student_ids_for_guardian(user))

# by school — a parent with children in two schools must see both
qs.filter(school_id__in=students_api.list_school_ids_for_guardian(user))

# by class — never contains None, safe in an __in lookup
qs.filter(school_class_id__in=students_api.list_class_ids_for_guardian(user))
```

**Authorising a single access:**

```python
if not students_api.is_guardian_of(request.user, student):
    raise PermissionDenied('You can only view your own linked children.')
```

### Activation

Schools pre-register students as activation tokens; the student later turns a
token into a real account by signing up with their matricule. Sign-up belongs to
`authentication`; what a student record is made of belongs to Student
Management. So `authentication` asks, rather than building a `Student` itself:

```python
students_api.has_pending_activation(matricule)        # -> bool
students_api.activation_was_used(matricule)           # -> bool
students_api.get_pending_activation(matricule)        # -> dict | None
students_api.create_student_from_activation(user, matricule)  # -> Student | None
students_api.list_activation_matricules(prefix='')    # -> [str, ...]
students_api.activation_matricule_exists(matricule)   # -> bool
```

The real sign-up flow, in order:

```python
activation = students_api.get_pending_activation(matricule)
if activation is None:
    if students_api.activation_was_used(matricule):
        return Response({'detail': 'This matricule is already used.'}, status=400)
    return Response({'detail': 'User not found'}, status=404)

user = User.objects.create_user(
    matricule=activation['matricule'],
    name=activation['student_name'],
    email=activation['placeholder_email'],
    role='STUDENT',
    school=activation['school'],
    password='!pending_activation',
)

if students_api.create_student_from_activation(user, matricule) is None:
    user.delete()   # token was spent between the lookup and here
    return Response({'detail': 'This matricule is already used.'}, status=400)
```

`get_pending_activation` returns a **plain dict**, not the token record, so
callers cannot start depending on the token's shape. It includes
`placeholder_email` because you have to create the user account before a student
record exists.

`create_student_from_activation` allocates the admission number, generates the
QR code and marks the token spent. It returns `None` if there is no unused token
— which is what makes a double activation unable to create a second student.

### Writing

```python
students_api.set_academic_standing(student, annual_average=..., is_on_honour_roll=...)
students_api.relabel_class(school, old_class_name, school_class)  # -> int
```

`set_academic_standing` is keyword-only and writes just the fields you supply.
Grading owns the calculation; Student Management owns where the result is
stored.

`relabel_class` is called when a school renames a class. It updates the link to
the class record, the denormalised label kept for older students, *and* the same
pair on pending activation tokens. That last one is exactly why it lives here:
`schools` should not have to know `StudentActivationToken` exists, and forgetting
it would leave students unable to activate weeks later.

---

## 4. Adding to the API

When you need something the API does not do:

1. **Add a function to `apps/students/api.py`.** Do not reach past the boundary
   "just this once".
2. **Only add what a real call site needs now.** The module has a scope note
   saying exactly this. It grew from 3 functions to 19 by being driven by actual
   consumers, never by speculation.
3. **If an existing function is nearly right, change it.** Revising a function
   when a second consumer contradicts it is the point of the exercise — that is
   how `get_guardian_users_by_student` ended up returning a map instead of a flat
   list. Do not build a bigger abstraction to avoid the revision.
4. **Return `None` or an empty collection, never raise a model exception.**
5. **Write the docstring for someone who does not know the models.** Say what
   the function promises, not how it is implemented.

---

## 5. Import placement

Module-level is correct almost everywhere:

```python
from apps.students import api as students_api
```

**The one exception is model modules.** In `apps/schools/models.py` the import
stays inside the method:

```python
def save(self, *args, **kwargs):
    ...
    from apps.students import api as students_api
    students_api.relabel_class(self.school, old_name, self)
```

Model modules importing each other at module scope is a real hazard in Django.
The guard flags reach-ins regardless of import depth, so deferring costs nothing
here.

---

## 6. The guard

`core/tests/test_module_boundaries.py`

```bash
python manage.py test core.tests.test_module_boundaries
```

It needs **no database** — it parses source with the AST — so it runs anywhere,
including machines that cannot reach the test DB.

It is a **ratchet**, and it fails in both directions:

- a **new** file reaches past the boundary → add the call to the API instead;
- a listed file **stops** reaching past it → delete its line from
  `KNOWN_VIOLATIONS`, so the boundary cannot silently slip back.

`KNOWN_VIOLATIONS` only ever shrinks. It is not permission to add more.

It also catches `apps.get_model('students', 'Student')`, which reaches a model
without importing anything and would otherwise walk straight past an
import-only check.

**Currently allowlisted — 4 files, all test files:**

```
apps/attendance/tests.py
apps/fees/tests.py
apps/grades/tests.py
apps/schools/tests.py
```

These are deliberate. Building fixture rows is not something a read/write API
should cover, and tests are allowed to know more than production code.

Every non-test file in the backend is clean.

---

## 7. What this bought

Measured, not claimed:

- **The `students ↔ grades` import cycle is gone.** Every one of `grades`' 28
  imports had been written function-level to dodge that cycle. They are
  module-level now.
- **Duplication collapsed.** "Linked students of this parent" existed as 6
  identical copies in `grades` alone; "is this user a guardian" as 3. One call
  each now.
- **Four bugs surfaced**, all of the same kind: code that matched only
  `ParentStudentLink` and silently skipped guardian-linked children. It was in
  attendance emails, subject enrollments, the school directory's child counts,
  and AI feature scoping. Routing through the API fixed all four, because the
  API always considers both link types.
- **Three dead imports** and one `except Student.DoesNotExist` that referenced a
  `Student` never imported — it would have raised `NameError` had it ever fired.
- **API stability:** 3 functions → +4 → **0** → +1 → +2 → +1 → +6. The zero is
  `fees`, a whole app in a different domain that needed nothing new.

---

## 8. What is *not* built

This is the Core/App **boundary**, proven on one Core service. It is the
foundation the "EduIgnite OS" vision rests on — not the OS itself.

Explicitly **not** built, and deliberately so:

- `.eia` package format
- App Store and App Registry
- installer / uninstaller
- update system
- `manifest.json` schema
- Executive Developer Console, Developer Mode
- per-app pricing and licensing

None of it exists, not even as stubs or folder scaffolding. The reasoning was
that Core/App separation had to be proven on real features first, and it now
has been — across 14 apps.

**The next Core service** is the natural follow-on. `schools.School` is the
strongest candidate: ~14 apps hold a foreign key to it, the same shape Student
Management had before this work. The method is proven and repeatable:

1. Create `apps/<name>/api.py` with only what the first consumer needs.
2. Migrate the smallest consumer. Commit.
3. Migrate a consumer in a different domain. Revise the API where it does not
   fit. Commit.
4. Add the app to a boundary guard with an allowlist of everything still
   reaching in.
5. Shrink the allowlist, app by app, smallest first.

---

## 9. Caveat worth keeping in mind

The migration has **no automated test coverage**. The test database was
unreachable from the development machine throughout, so `manage.py check` and
the boundary guard both pass but neither executes a query.

The paths most worth exercising by hand on a database-connected machine:

- student sign-up by activation token, including repeating the same matricule
- renaming a class that has students on the old text label *and* unredeemed
  activation tokens
- publishing a report card, then verifying its QR code
- a parent with children in two different schools logging in
- chat's classmate / guardian / teacher relationship labelling
