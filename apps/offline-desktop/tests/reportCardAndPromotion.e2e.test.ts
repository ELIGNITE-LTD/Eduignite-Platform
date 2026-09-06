import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDbHandle } from './testDb';
import { upsertSchool } from '../src/repositories/schoolRepository';
import { createClass, createStream } from '../src/repositories/classRepository';
import { assignSubjectToStream, createSubject } from '../src/repositories/subjectRepository';
import { createStudent, getStudent, promoteClassStream } from '../src/repositories/studentRepository';
import { recordCat, recordExam } from '../src/repositories/academicsRepository';
import { compileReportCardsForStream, listReportCards } from '../src/repositories/reportCardRepository';

// End-to-end-ish test: seeds a school, a class with two streams, students,
// and CAT/exam marks entirely through the repository layer (the same layer
// the IPC handlers call), then exercises the two "flagship" workflows the
// product spec calls out — compiling report cards and promoting a class —
// and asserts the resulting rows, not just return values.

const TERM = 'TERM_1';
const YEAR = '2025-2026';

describe('report card compilation + class promotion (e2e)', () => {
  let handle: TestDbHandle;

  beforeEach(() => {
    handle = createTestDb();
  });

  afterEach(() => {
    handle.close();
  });

  it('compiles term report cards with correct ranks, then promotes only students who meet the average', () => {
    const { db } = handle;

    const school = upsertSchool(db, {
      name: 'Test Academy',
      short_name: 'TST',
      principal: 'Mrs. Principal',
      motto: '',
      location: 'Testville',
      division: '',
      sub_division: '',
      city_village: '',
      address: '',
      postal_code: null,
      academic_year: YEAR,
      active_term: TERM,
      locale: 'en',
      subscription_currency: 'XAF',
    });

    const schoolClass = createClass(db, { school_id: school.id, name: 'Form 1', cycle: 'FIRST', display_order: 0 });
    const nextClass = createClass(db, { school_id: school.id, name: 'Form 2', cycle: 'FIRST', display_order: 1 });

    const sourceStream = createStream(db, {
      class_id: schoolClass.id,
      name: 'Form 1 A',
      academic_year: YEAR,
      class_teacher_id: null,
      capacity: null,
    });
    const targetStream = createStream(db, {
      class_id: nextClass.id,
      name: 'Form 2 A',
      academic_year: YEAR,
      class_teacher_id: null,
      capacity: null,
    });

    const maths = createSubject(db, { school_id: school.id, name: 'Maths', code: 'MTH' });
    const english = createSubject(db, { school_id: school.id, name: 'English', code: 'ENG' });

    assignSubjectToStream(db, {
      class_stream_id: sourceStream.id,
      subject_id: maths.id,
      teacher_id: null,
      academic_year: YEAR,
      coefficient: 4,
      is_compulsory: 1,
    });
    assignSubjectToStream(db, {
      class_stream_id: sourceStream.id,
      subject_id: english.id,
      teacher_id: null,
      academic_year: YEAR,
      coefficient: 3,
      is_compulsory: 1,
    });

    const alice = createStudent(db, {
      school_id: school.id,
      class_stream_id: sourceStream.id,
      admission_number: 'A001',
      first_name: 'Alice',
      last_name: 'Achiever',
      date_of_birth: null,
      place_of_birth: '',
      gender: 'female',
      guardian_name: '',
      guardian_phone: '',
      guardian_whatsapp: null,
      admission_date: null,
    });
    const bob = createStudent(db, {
      school_id: school.id,
      class_stream_id: sourceStream.id,
      admission_number: 'A002',
      first_name: 'Bob',
      last_name: 'Behind',
      date_of_birth: null,
      place_of_birth: '',
      gender: 'male',
      guardian_name: '',
      guardian_phone: '',
      guardian_whatsapp: null,
      admission_date: null,
    });
    const carol = createStudent(db, {
      school_id: school.id,
      class_stream_id: sourceStream.id,
      admission_number: 'A003',
      first_name: 'Carol',
      last_name: 'Ungraded',
      date_of_birth: null,
      place_of_birth: '',
      gender: 'female',
      guardian_name: '',
      guardian_phone: '',
      guardian_whatsapp: null,
      admission_date: null,
    });
    // Carol intentionally receives no marks at all.

    // Alice: strong in both subjects.
    recordCat(db, { studentId: alice.id, subjectId: maths.id, classStreamId: sourceStream.id, term: TERM, academicYear: YEAR, catNumber: 1, score: 18 });
    recordExam(db, { studentId: alice.id, subjectId: maths.id, classStreamId: sourceStream.id, term: TERM, academicYear: YEAR, score: 18 });
    recordCat(db, { studentId: alice.id, subjectId: english.id, classStreamId: sourceStream.id, term: TERM, academicYear: YEAR, catNumber: 1, score: 16 });
    recordExam(db, { studentId: alice.id, subjectId: english.id, classStreamId: sourceStream.id, term: TERM, academicYear: YEAR, score: 16 });

    // Bob: weak in both subjects.
    recordCat(db, { studentId: bob.id, subjectId: maths.id, classStreamId: sourceStream.id, term: TERM, academicYear: YEAR, catNumber: 1, score: 5 });
    recordExam(db, { studentId: bob.id, subjectId: maths.id, classStreamId: sourceStream.id, term: TERM, academicYear: YEAR, score: 5 });
    recordCat(db, { studentId: bob.id, subjectId: english.id, classStreamId: sourceStream.id, term: TERM, academicYear: YEAR, catNumber: 1, score: 6 });
    recordExam(db, { studentId: bob.id, subjectId: english.id, classStreamId: sourceStream.id, term: TERM, academicYear: YEAR, score: 6 });

    // --- Compile report cards for the whole stream ---
    const compiled = compileReportCardsForStream(db, sourceStream.id, TERM, YEAR);
    expect(compiled).toHaveLength(3);

    const byStudent = Object.fromEntries(compiled.map((c) => [c.student_id, c]));
    expect(byStudent[alice.id].average_score).toBeCloseTo((18 * 4 + 16 * 3) / 7, 5);
    expect(byStudent[alice.id].grade_range).toBe('Excellent');
    expect(byStudent[alice.id].promotional_eligible).toBe(1);
    expect(byStudent[bob.id].average_score).toBeCloseTo((5 * 4 + 6 * 3) / 7, 5);
    expect(byStudent[bob.id].grade_range).toBe('Weak');
    expect(byStudent[bob.id].promotional_eligible).toBe(0);
    // Carol has zero marks on every assigned subject -> average defaults to 0.
    expect(byStudent[carol.id].average_score).toBe(0);
    expect(byStudent[carol.id].promotional_eligible).toBe(0);

    // Ranks: Alice (1st) > Bob (2nd) > Carol (3rd), class_size 3 for everyone.
    expect(byStudent[alice.id].class_rank).toBe(1);
    expect(byStudent[bob.id].class_rank).toBe(2);
    expect(byStudent[carol.id].class_rank).toBe(3);
    expect(byStudent[alice.id].class_size).toBe(3);

    // Persisted rows agree with the return value (not just the in-memory result).
    const persisted = listReportCards(db, { classStreamId: sourceStream.id, term: TERM, academicYear: YEAR });
    expect(persisted).toHaveLength(3);
    expect(persisted.find((r) => r.student_id === alice.id)?.class_rank).toBe(1);

    // compileReportCard also updates the student row's annual_average/is_on_honour_roll.
    const aliceRow = getStudent(db, alice.id)!;
    expect(aliceRow.annual_average).toBeCloseTo((18 * 4 + 16 * 3) / 7, 5);
    expect(aliceRow.is_on_honour_roll).toBe(1);
    const bobRow = getStudent(db, bob.id)!;
    expect(bobRow.is_on_honour_roll).toBe(0);

    // --- Promote the class using those freshly-compiled averages ---
    const promotion = promoteClassStream(db, {
      fromClassStreamId: sourceStream.id,
      toClassStreamId: targetStream.id,
      academicYear: YEAR,
    });

    expect(promotion.total).toBe(3);
    expect(promotion.promotedCount).toBe(1);
    expect(promotion.repeatedCount).toBe(2);

    const decisionFor = (id: string) => promotion.decisions.find((d) => d.studentId === id)!;
    expect(decisionFor(alice.id).outcome).toBe('promoted');
    expect(decisionFor(bob.id).outcome).toBe('repeated');
    expect(decisionFor(carol.id).outcome).toBe('repeated');

    // Final DB state: Alice moved to the target stream; Bob and Carol stayed put.
    const aliceAfter = getStudent(db, alice.id)!;
    const bobAfter = getStudent(db, bob.id)!;
    const carolAfter = getStudent(db, carol.id)!;
    expect(aliceAfter.class_stream_id).toBe(targetStream.id);
    expect(bobAfter.class_stream_id).toBe(sourceStream.id);
    expect(carolAfter.class_stream_id).toBe(sourceStream.id);

    const promotionRows = db
      .prepare('SELECT * FROM student_promotions WHERE academic_year = ? ORDER BY average_score DESC')
      .all(YEAR) as { student_id: string; status: string; to_class_stream_id: string }[];
    expect(promotionRows).toHaveLength(3);
    expect(promotionRows[0]).toMatchObject({
      student_id: alice.id,
      status: 'promoted',
      to_class_stream_id: targetStream.id,
    });
    expect(promotionRows.find((r) => r.student_id === bob.id)).toMatchObject({
      status: 'repeated',
      to_class_stream_id: sourceStream.id,
    });
  });
});
