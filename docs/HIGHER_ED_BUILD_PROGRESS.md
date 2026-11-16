# Higher-education build: students, results, finance (resume file)

Found while testing the live test institution (matricule TBHS0626, school TBHSB) as its administrator:
- Setup screens existed only on unmerged branches; merged in PR #204 (departments, programmes, calendar, grading, course units, curriculum, offerings, lecturers all work, verified through the live API).
- A higher institution could NOT add a student: the student path demands a secondary-school `student_class`. No enrolment, results or tuition concepts exist.

## Build order (one PR each, verify on the live account after each deploy)
- [x] H4 Students (done on branch claude/higher-students): `Enrolment` model (student + programme + level/year + academic year + status), `POST/GET/PATCH /higher-ed/students/`, page `/dashboard/higher/students`, student activation by matricule
- [x] H5 Results (built on branch claude/higher-results; verified locally; NOT merged yet): continuous assessment + exam per course offering, grade via the grading policy (GPA 4.0 or /20), semester and cumulative GPA, lecturer entry, student view, transcript
- [ ] H6 Finance: tuition per programme/year, payments (MoMo / Orange Money / cash / bank), balances, receipts
- [ ] Wording pass: welcome page, announcements, notifications, profile, chat, fees still use school-level words (Classes and sections, teachers, terms...)
- [ ] Lecturer employment type is "Civil Servant / PTA" (secondary idea): replace with Permanent / Part-time (vacataire) / Visiting

## Test data (live test institution; password is the shared test password, not stored here)
Faculties: Science; Law and Political Science; Management Sciences. Departments: Computer Science, Mathematics, Public Law, Private Law, Accounting and Finance, Marketing and Management.
Programmes: BSc Computer Science (3y, 180 cr), MSc Software Engineering (2y), LLB Law, HND Accounting, BSc Marketing. Year 2026/2027, Semesters 1 and 2, grading gpa_4.
Lecturers (activated): TBHS0626TE001 Dr. Emmanuel Ngwa, TE002 Dr. Chantal Fotso, TE003 Mr. Joseph Tabe, TE004 Dr. Grace Ndifor.

## Log
- 2026-11-16: PR #204 merged; live API setup done; students blocker confirmed; H4 started on branch claude/higher-students.
- 2026-11-16: H4 built: Enrolment model (higher_ed.0004), /higher-ed/students/ (admit, list, filter, promote, status), Students screen; verified locally in a browser. Also fixed: record ids were converted with Number() on the screens although ids are UUID text (adding programmes, course units, department heads would have failed), and the sign-in response now includes education_category and school_kind (the apps guessed 'secondary' first).
- 2026-11-16: H5 built: CourseResult (higher_ed.0005), /higher-ed/results/ (offerings, roster, save, submit, publish, unpublish, mine, transcript), Results screen for lecturers and admin, My results for students. CA 30 + exam 70 (GPA 4.0) or CA 8 + exam 12 (/20 with mentions). 15 backend tests pass. Local browser flow: lecturer enters, admin publishes, student sees GPA. NEXT: PR + merge after the stuck frontend deploy clears, then H6 finance, then the wording pass.
