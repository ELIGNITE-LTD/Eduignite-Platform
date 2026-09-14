/**
 * Populates a real, running EduIgnite Offline installation with a small,
 * coherent set of sample records — one class/stream, two teachers (one with
 * a real login), five students, a few days of attendance, CAT/exam marks,
 * compiled report cards, a fee template + payment, and a published notice —
 * using the exact same repository functions (createTeacher, createStudent,
 * recordDay, ...) every real screen in the app calls. Nothing here is mocked
 * and nothing is tracked in a special table: this is ordinary data in the
 * ordinary tables, editable and deletable through the app's own screens
 * exactly like anything a real school typed in.
 *
 * Every seeded row is given a recognisable, grep-able name/number so it's
 * obvious at a glance which records are samples (admission numbers like
 * `SAMPLE-001`, teacher numbers like `SAMPLE-TCH-001`, class name
 * "Form 1 (Sample)", etc.) and so `--clear` can find them again by exactly
 * the same values a human would use to find and delete them by hand.
 *
 * Usage (via the `tsx` dev dependency, so relative imports resolve exactly
 * like they do everywhere else in this project — Node's own native `.ts`
 * support needs an explicit extension on every relative import in the
 * whole dependency chain to do this, which isn't worth changing across
 * every repository file just for one script):
 *
 *   npm run seed:sample -- --db <path-to-eduignite-offline.sqlite> --key <path-to-.key file>
 *   npm run seed:sample -- --db <path> --key <path> --clear
 *
 * This project's better-sqlite3-multiple-ciphers build targets Node's own
 * ABI (not Electron's), since installs run under plain `npm install` — so
 * running under `tsx` (plain Node underneath) opens the real database file
 * exactly like the packaged app does, just outside the Electron shell.
 *
 * Find your real paths: this app stores its database at
 * `<Electron userData>/data/eduignite-offline.sqlite` (and the sibling
 * `.key` file next to it) — see electron/main.ts's `userDataPaths()`. On a
 * normal Windows dev machine that's typically
 * `%APPDATA%\eduignite-offline-desktop\data\`.
 */
import path from 'node:path';
import { openDatabase } from '../src/db/connection';
import { getSchool } from '../src/repositories/schoolRepository';
import { createTeacher } from '../src/repositories/teacherRepository';
import { createUser } from '../src/repositories/userRepository';
import { createClass, createStream } from '../src/repositories/classRepository';
import { createSubject, assignSubjectToStream } from '../src/repositories/subjectRepository';
import { createStudent } from '../src/repositories/studentRepository';
import { recordDay } from '../src/repositories/attendanceRepository';
import { recordCat, recordExam } from '../src/repositories/academicsRepository';
import { compileReportCardsForStream } from '../src/repositories/reportCardRepository';
import { createFeeTemplate, recordPayment } from '../src/repositories/financeRepository';
import { createNotice, setNoticePublished } from '../src/repositories/noticeRepository';

const SAMPLE_TEACHER_USERNAME = 'sample.teacher';
const SAMPLE_TEACHER_PASSWORD = 'Sample@1234';
const SAMPLE_ADMISSION_PREFIX = 'SAMPLE-';
const SAMPLE_TEACHER_NUMBER_PREFIX = 'SAMPLE-TCH-';
const SAMPLE_CLASS_NAME = 'Form 1 (Sample)';
const SAMPLE_SUBJECT_CODES = ['MATH-S', 'ENG-S', 'PHY-S'];

function parseArgs(argv: string[]): { dbPath: string; keyFilePath: string; clear: boolean } {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const dbPath = get('--db');
  const keyFilePath = get('--key');
  const clear = argv.includes('--clear');
  if (!dbPath || !keyFilePath) {
    console.error(
      'Usage: node scripts/seed-sample-data.ts --db <path to eduignite-offline.sqlite> --key <path to .key file> [--clear]'
    );
    process.exit(1);
  }
  return { dbPath, keyFilePath, clear };
}

function isoDateDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

const SAMPLE_STUDENTS = [
  { first: 'Achu', last: 'Ngwa', gender: 'male' as const, dob: '2013-03-14' },
  { first: 'Belinda', last: 'Fon', gender: 'female' as const, dob: '2013-07-02' },
  { first: 'Divine', last: 'Tabe', gender: 'male' as const, dob: '2013-01-25' },
  { first: 'Elsie', last: 'Bih', gender: 'female' as const, dob: '2013-11-09' },
  { first: 'Franklin', last: 'Ojong', gender: 'male' as const, dob: '2013-05-30' },
];

async function seed(db: ReturnType<typeof openDatabase>): Promise<void> {
  const school = getSchool(db);
  if (!school) {
    throw new Error('No school found — finish the app\'s setup wizard once before seeding sample data.');
  }
  const existingSample = db
    .prepare("SELECT id FROM students WHERE admission_number LIKE ? LIMIT 1")
    .get(`${SAMPLE_ADMISSION_PREFIX}%`);
  if (existingSample) {
    throw new Error('Sample data already looks present (found a SAMPLE- student). Run with --clear first to reseed.');
  }

  const term = school.active_term;
  const academicYear = school.academic_year;

  const teacherGrace = createTeacher(db, {
    school_id: school.id,
    teacher_number: `${SAMPLE_TEACHER_NUMBER_PREFIX}001`,
    first_name: 'Grace',
    last_name: 'Mbeki',
    gender: 'female',
    phone: '+237670000001',
    email: 'grace.mbeki@example.com',
    date_of_joining: isoDateDaysAgo(400),
  });
  const teacherPaul = createTeacher(db, {
    school_id: school.id,
    teacher_number: `${SAMPLE_TEACHER_NUMBER_PREFIX}002`,
    first_name: 'Paul',
    last_name: 'Nkeng',
    gender: 'male',
    phone: '+237670000002',
    email: 'paul.nkeng@example.com',
    date_of_joining: isoDateDaysAgo(200),
  });

  // A real TEACHER-role login for Grace, via the exact same createUser()
  // function the setup wizard uses for the first SCHOOL_ADMIN account -- not
  // a special demo mechanism, just the app's real staff-account creation
  // path, called once from a script instead of a not-yet-built Settings UI
  // (see userRepository.ts's createUser() doc comment).
  await createUser(db, {
    school_id: school.id,
    teacher_id: teacherGrace.id,
    matricule: null,
    full_name: 'Grace Mbeki',
    email_or_username: SAMPLE_TEACHER_USERNAME,
    password: SAMPLE_TEACHER_PASSWORD,
    role: 'TEACHER',
  });

  const stream = createStream(
    db,
    (() => {
      const demoClass = createClass(db, {
        school_id: school.id,
        name: SAMPLE_CLASS_NAME,
        cycle: 'FIRST',
        display_order: 999,
      });
      return {
        class_id: demoClass.id,
        name: 'A',
        academic_year: academicYear,
        class_teacher_id: teacherGrace.id,
        capacity: 40,
      };
    })()
  );

  const subjectMath = createSubject(db, { school_id: school.id, name: 'Mathematics (Sample)', code: SAMPLE_SUBJECT_CODES[0] });
  const subjectEnglish = createSubject(db, { school_id: school.id, name: 'English Language (Sample)', code: SAMPLE_SUBJECT_CODES[1] });
  const subjectPhysics = createSubject(db, { school_id: school.id, name: 'Physics (Sample)', code: SAMPLE_SUBJECT_CODES[2] });

  assignSubjectToStream(db, { class_stream_id: stream.id, subject_id: subjectMath.id, teacher_id: teacherGrace.id, academic_year: academicYear, coefficient: 4, is_compulsory: 1 });
  assignSubjectToStream(db, { class_stream_id: stream.id, subject_id: subjectEnglish.id, teacher_id: teacherGrace.id, academic_year: academicYear, coefficient: 4, is_compulsory: 1 });
  assignSubjectToStream(db, { class_stream_id: stream.id, subject_id: subjectPhysics.id, teacher_id: teacherPaul.id, academic_year: academicYear, coefficient: 3, is_compulsory: 1 });

  const students = SAMPLE_STUDENTS.map((s, index) =>
    createStudent(db, {
      school_id: school.id,
      class_stream_id: stream.id,
      admission_number: `${SAMPLE_ADMISSION_PREFIX}${String(index + 1).padStart(3, '0')}`,
      first_name: s.first,
      last_name: s.last,
      date_of_birth: s.dob,
      place_of_birth: 'Bamenda',
      gender: s.gender,
      guardian_name: `${s.last} Family`,
      guardian_phone: '+237680000000',
      guardian_whatsapp: null,
      admission_date: isoDateDaysAgo(60),
    })
  );

  const baseStatuses: Array<'present' | 'absent' | 'late' | 'excused'> = ['present', 'present', 'present', 'late', 'present'];
  for (const dayOffset of [2, 1, 0]) {
    recordDay(db, {
      classStreamId: stream.id,
      attendanceDate: isoDateDaysAgo(dayOffset),
      term,
      academicYear,
      recordedBy: teacherGrace.id,
      entries: students.map((student, index) => ({
        studentId: student.id,
        status: dayOffset === 1 && index === 2 ? 'absent' : baseStatuses[index],
      })),
    });
  }

  const subjectScores: Record<string, number[]> = {
    [subjectMath.id]: [16, 12, 9, 18, 14],
    [subjectEnglish.id]: [14, 15, 11, 17, 10],
    [subjectPhysics.id]: [13, 10, 8, 16, 12],
  };
  for (const [subjectId, scores] of Object.entries(subjectScores)) {
    students.forEach((student, index) => {
      recordCat(db, { studentId: student.id, subjectId, classStreamId: stream.id, term, academicYear, catNumber: 1, score: Math.max(0, scores[index] - 2), recordedBy: teacherGrace.id });
      recordExam(db, { studentId: student.id, subjectId, classStreamId: stream.id, term, academicYear, score: scores[index], recordedBy: teacherGrace.id });
    });
  }

  compileReportCardsForStream(db, stream.id, term, academicYear);

  const feeTemplate = createFeeTemplate(db, {
    school_id: school.id,
    class_id: stream.class_id,
    name: 'Tuition Fee (Sample)',
    term,
    academic_year: academicYear,
    amount: 25000,
    currency: school.subscription_currency,
    due_date: isoDateDaysAgo(-30),
    is_mandatory: 1,
  });
  recordPayment(db, {
    schoolId: school.id,
    studentId: students[0].id,
    feeTemplateId: feeTemplate.id,
    amount: 15000,
    currency: school.subscription_currency,
    paymentMethod: 'cash',
    paymentDate: isoDateDaysAgo(3),
    notes: 'Sample partial payment',
    schoolShortCode: school.short_name || school.id,
  });

  const teacherUserRow = db
    .prepare('SELECT id FROM users WHERE email_or_username = ?')
    .get(SAMPLE_TEACHER_USERNAME) as { id: string } | undefined;
  const notice = createNotice(db, {
    school_id: school.id,
    title: 'Welcome to the new term! (Sample)',
    body: 'This is a sample notice created by seed-sample-data.ts. Delete it from Manage Notices whenever you like.',
    published_by: teacherUserRow?.id ?? null,
  });
  setNoticePublished(db, notice.id, true);

  console.log('Sample data created:');
  console.log(`  - ${students.length} students in "${SAMPLE_CLASS_NAME} A" (admission numbers ${SAMPLE_ADMISSION_PREFIX}001..${SAMPLE_ADMISSION_PREFIX}00${students.length})`);
  console.log('  - 2 teachers, 3 subjects, attendance, CAT + exam marks, report cards, a fee template + payment, a published notice');
  console.log('');
  console.log(`Teacher login: ${SAMPLE_TEACHER_USERNAME} / ${SAMPLE_TEACHER_PASSWORD} (role TEACHER, scoped to`);
  console.log(`"${SAMPLE_CLASS_NAME} A" via teacherScopeRepository -- sign in to see the teacher experience).`);
  console.log('');
  console.log('To remove all of this again: node scripts/seed-sample-data.ts --db <path> --key <path> --clear');
}

function clear(db: ReturnType<typeof openDatabase>): void {
  const run = db.transaction(() => {
    const studentIds = (db.prepare(`SELECT id FROM students WHERE admission_number LIKE ?`).all(`${SAMPLE_ADMISSION_PREFIX}%`) as { id: string }[]).map((r) => r.id);

    // financial_transactions has no FK/CASCADE back to payments (see
    // financeRepository.ts's header comment — reference_id is a soft link),
    // so its rows must be found and removed *before* the payments they
    // reference are deleted below, not after.
    for (const id of studentIds) {
      const paymentIds = (db.prepare('SELECT id FROM payments WHERE student_id = ?').all(id) as { id: string }[]).map((r) => r.id);
      for (const paymentId of paymentIds) {
        db.prepare('DELETE FROM financial_transactions WHERE reference_id = ?').run(paymentId);
      }
      db.prepare('DELETE FROM payments WHERE student_id = ?').run(id);
      db.prepare('DELETE FROM report_cards WHERE student_id = ?').run(id);
      db.prepare('DELETE FROM exam_marks WHERE student_id = ?').run(id);
      db.prepare('DELETE FROM cats WHERE student_id = ?').run(id);
      db.prepare('DELETE FROM attendance_records WHERE student_id = ?').run(id);
    }
    db.prepare(`DELETE FROM students WHERE admission_number LIKE ?`).run(`${SAMPLE_ADMISSION_PREFIX}%`);
    db.prepare(`DELETE FROM fee_templates WHERE name LIKE '%(Sample)'`).run();

    const streamIds = (db.prepare(`SELECT cs.id FROM class_streams cs JOIN classes c ON c.id = cs.class_id WHERE c.name = ?`).all(SAMPLE_CLASS_NAME) as { id: string }[]).map((r) => r.id);
    for (const streamId of streamIds) {
      db.prepare('DELETE FROM class_subject_teacher WHERE class_stream_id = ?').run(streamId);
    }
    db.prepare(`DELETE FROM class_streams WHERE class_id IN (SELECT id FROM classes WHERE name = ?)`).run(SAMPLE_CLASS_NAME);
    db.prepare(`DELETE FROM classes WHERE name = ?`).run(SAMPLE_CLASS_NAME);

    db.prepare(`DELETE FROM subjects WHERE code IN (${SAMPLE_SUBJECT_CODES.map(() => '?').join(',')})`).run(...SAMPLE_SUBJECT_CODES);
    db.prepare(`DELETE FROM users WHERE email_or_username = ?`).run(SAMPLE_TEACHER_USERNAME);
    db.prepare(`DELETE FROM teachers WHERE teacher_number LIKE ?`).run(`${SAMPLE_TEACHER_NUMBER_PREFIX}%`);
    db.prepare(`DELETE FROM notices WHERE title LIKE '%(Sample)'`).run();
  });
  run();
  console.log('Sample data removed.');
}

async function main(): Promise<void> {
  const { dbPath, keyFilePath, clear: shouldClear } = parseArgs(process.argv.slice(2));
  const migrationsDir = path.join(__dirname, '..', 'src', 'db', 'migrations');
  const db = openDatabase({ dbPath, keyFilePath, migrationsDir });
  try {
    if (shouldClear) {
      clear(db);
    } else {
      await seed(db);
    }
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error((err as Error).message);
  process.exitCode = 1;
});
