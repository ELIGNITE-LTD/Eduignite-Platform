import type Database from 'better-sqlite3-multiple-ciphers';
import { getSchool } from '../repositories/schoolRepository';
import { createTeacher } from '../repositories/teacherRepository';
import { createUser } from '../repositories/userRepository';
import { createClass, createStream } from '../repositories/classRepository';
import { createSubject, assignSubjectToStream } from '../repositories/subjectRepository';
import { createStudent } from '../repositories/studentRepository';
import { recordDay } from '../repositories/attendanceRepository';
import { recordCat, recordExam } from '../repositories/academicsRepository';
import { compileReportCardsForStream } from '../repositories/reportCardRepository';
import { createFeeTemplate, recordPayment } from '../repositories/financeRepository';
import { createNotice, setNoticePublished } from '../repositories/noticeRepository';

/**
 * Populates the current installation with a small, coherent set of real
 * sample records -- one class/stream, two teachers (one with a real login),
 * five students, a few days of attendance, CAT/exam marks, compiled report
 * cards, a fee template + payment, and a published notice -- using the exact
 * same repository functions (createTeacher, createStudent, recordDay, ...)
 * every real screen in the app calls. Nothing here is mocked and nothing is
 * tracked in a special table: this is ordinary data in the ordinary tables,
 * editable and deletable through the app's own screens exactly like anything
 * a real school typed in.
 *
 * Every seeded row is given a recognisable, grep-able name/number so it's
 * obvious at a glance which records are samples (admission numbers like
 * `SAMPLE-001`, teacher numbers like `SAMPLE-TCH-001`, class name
 * "Form 1 (Sample)", etc.) and so `clearSampleData` can find them again by
 * exactly the same values a human would use to find and delete them by hand.
 *
 * Shared by two callers: the `npm run seed:sample` CLI script (for a
 * developer/support technician poking at a raw db file) and the
 * `sampleData:seed`/`sampleData:clear` IPC channels (the in-app "Seed sample
 * data" button an admin sees right after finishing setup) -- see
 * scripts/seed-sample-data.ts and src/ipc/handlers.ts.
 */

export const SAMPLE_TEACHER_USERNAME = 'sample.teacher';
export const SAMPLE_TEACHER_PASSWORD = 'Sample@1234';
const SAMPLE_ADMISSION_PREFIX = 'SAMPLE-';
const SAMPLE_TEACHER_NUMBER_PREFIX = 'SAMPLE-TCH-';
const SAMPLE_CLASS_NAME = 'Form 1 (Sample)';
const SAMPLE_SUBJECT_CODES = ['MATH-S', 'ENG-S', 'PHY-S'];

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

export interface SampleDataSummary {
  studentsCreated: number;
  className: string;
  teacherLoginUsername: string;
  teacherLoginPassword: string;
}

/** True if a previous seed's rows are still present (checked via the same SAMPLE- marker used to create/remove them). */
export function hasSampleData(db: Database.Database): boolean {
  const row = db.prepare('SELECT id FROM students WHERE admission_number LIKE ? LIMIT 1').get(`${SAMPLE_ADMISSION_PREFIX}%`);
  return !!row;
}

export async function seedSampleData(db: Database.Database): Promise<SampleDataSummary> {
  const school = getSchool(db);
  if (!school) {
    throw new Error("No school found — finish the app's setup wizard once before seeding sample data.");
  }
  if (hasSampleData(db)) {
    throw new Error('Sample data already looks present. Remove it first if you want to reseed.');
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
  // function the setup wizard and Staff Settings page use -- not a special
  // demo mechanism, just the app's real staff-account creation path.
  await createUser(db, {
    school_id: school.id,
    teacher_id: teacherGrace.id,
    matricule: null,
    full_name: 'Grace Mbeki',
    email_or_username: SAMPLE_TEACHER_USERNAME,
    password: SAMPLE_TEACHER_PASSWORD,
    role: 'TEACHER',
  });

  const demoClass = createClass(db, {
    school_id: school.id,
    name: SAMPLE_CLASS_NAME,
    cycle: 'FIRST',
    display_order: 999,
  });
  const stream = createStream(db, {
    class_id: demoClass.id,
    name: 'A',
    academic_year: academicYear,
    class_teacher_id: teacherGrace.id,
    capacity: 40,
  });

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

  const teacherUserRow = db.prepare('SELECT id FROM users WHERE email_or_username = ?').get(SAMPLE_TEACHER_USERNAME) as
    | { id: string }
    | undefined;
  const notice = createNotice(db, {
    school_id: school.id,
    title: 'Welcome to the new term! (Sample)',
    body: 'This is a sample notice. Delete it from Manage Notices whenever you like, or use "Remove sample data" to clear everything at once.',
    published_by: teacherUserRow?.id ?? null,
  });
  setNoticePublished(db, notice.id, true);

  return {
    studentsCreated: students.length,
    className: `${SAMPLE_CLASS_NAME} A`,
    teacherLoginUsername: SAMPLE_TEACHER_USERNAME,
    teacherLoginPassword: SAMPLE_TEACHER_PASSWORD,
  };
}

export function clearSampleData(db: Database.Database): void {
  const run = db.transaction(() => {
    const studentIds = (db.prepare('SELECT id FROM students WHERE admission_number LIKE ?').all(`${SAMPLE_ADMISSION_PREFIX}%`) as { id: string }[]).map(
      (r) => r.id
    );

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
    db.prepare('DELETE FROM students WHERE admission_number LIKE ?').run(`${SAMPLE_ADMISSION_PREFIX}%`);
    db.prepare("DELETE FROM fee_templates WHERE name LIKE '%(Sample)'").run();

    const streamIds = (db
      .prepare('SELECT cs.id FROM class_streams cs JOIN classes c ON c.id = cs.class_id WHERE c.name = ?')
      .all(SAMPLE_CLASS_NAME) as { id: string }[]).map((r) => r.id);
    for (const streamId of streamIds) {
      db.prepare('DELETE FROM class_subject_teacher WHERE class_stream_id = ?').run(streamId);
    }
    db.prepare('DELETE FROM class_streams WHERE class_id IN (SELECT id FROM classes WHERE name = ?)').run(SAMPLE_CLASS_NAME);
    db.prepare('DELETE FROM classes WHERE name = ?').run(SAMPLE_CLASS_NAME);

    db.prepare(`DELETE FROM subjects WHERE code IN (${SAMPLE_SUBJECT_CODES.map(() => '?').join(',')})`).run(...SAMPLE_SUBJECT_CODES);
    db.prepare('DELETE FROM users WHERE email_or_username = ?').run(SAMPLE_TEACHER_USERNAME);
    db.prepare('DELETE FROM teachers WHERE teacher_number LIKE ?').run(`${SAMPLE_TEACHER_NUMBER_PREFIX}%`);
    db.prepare("DELETE FROM notices WHERE title LIKE '%(Sample)'").run();
  });
  run();
}
