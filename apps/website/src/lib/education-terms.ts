import type { EducationCategory } from '@/lib/cameroon-education-system';

/**
 * One place for the wording that differs between nursery/primary ("basic")
 * schools, secondary schools and higher-education institutions. Higher
 * education never reuses secondary wording (no Form, Class, Pupil, Sequence,
 * Term, Principal, Discipline Master or Class Master).
 */
export interface EducationTerms {
  learner: string;
  learners: string;
  classTeacher: string;
  head: string;
  classExample: string;
  classSplitExample: string;
  classLevelPlaceholder: string;
  bulkBatchExample: string;
  defaultClassLevel: string;
  classSuggestions: string[];
  /** The organisation itself: "School" or "Institution". */
  institution: string;
  /** Title of the person who runs the organisation. */
  adminTitle: string;
  teacher: string;
  teachers: string;
  /** What a learner enrols in: "Class" or "Programme". */
  programme: string;
  programmes: string;
  department: string;
  departments: string;
  /** What is taught: "Subject" or "Course unit". */
  courseUnit: string;
  courseUnits: string;
  /** Weighting of a taught unit: "Coefficient" or "Credits". */
  credits: string;
  academicYear: string;
  /** One slice of the year: "Term" or "Semester". */
  period: string;
  periods: string;
  /** Who keeps official records: "Registrar" in higher education. */
  recordsOfficer: string;
}

const SECONDARY: EducationTerms = {
  learner: 'Student',
  learners: 'Students',
  classTeacher: 'Class Master',
  head: 'Principal',
  classExample: 'e.g. Form 5 Science A',
  classSplitExample: 'Form 1 A',
  classLevelPlaceholder: 'Form 1, 6eme, Lower Sixth...',
  bulkBatchExample: 'Form 1 A - 2026 Intake',
  defaultClassLevel: 'Form 1',
  classSuggestions: [],
  institution: 'School',
  adminTitle: 'Principal',
  teacher: 'Teacher',
  teachers: 'Teachers',
  programme: 'Class',
  programmes: 'Classes',
  department: 'Department',
  departments: 'Departments',
  courseUnit: 'Subject',
  courseUnits: 'Subjects',
  credits: 'Coefficient',
  academicYear: 'Academic year',
  period: 'Term',
  periods: 'Terms',
  recordsOfficer: 'Records office',
};

const BASIC: EducationTerms = {
  learner: 'Pupil',
  learners: 'Pupils',
  classTeacher: 'Class teacher',
  head: 'Head teacher',
  classExample: 'e.g. Class 3 A',
  classSplitExample: 'Class 3 A',
  classLevelPlaceholder: 'Class 1, CP, Nursery 2...',
  bulkBatchExample: 'Class 3 A - 2026 Intake',
  defaultClassLevel: 'Class 1',
  classSuggestions: [
    'Nursery 1', 'Nursery 2', 'Nursery 3',
    'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6',
  ],
  institution: 'School',
  adminTitle: 'Head teacher',
  teacher: 'Teacher',
  teachers: 'Teachers',
  programme: 'Class',
  programmes: 'Classes',
  department: 'Department',
  departments: 'Departments',
  courseUnit: 'Subject',
  courseUnits: 'Subjects',
  credits: 'Coefficient',
  academicYear: 'Academic year',
  period: 'Term',
  periods: 'Terms',
  recordsOfficer: 'Records office',
};

const HIGHER: EducationTerms = {
  learner: 'Student',
  learners: 'Students',
  classTeacher: 'Lecturer',
  head: 'Institution Administrator',
  classExample: 'e.g. Year One, Computer Science',
  classSplitExample: 'Year One, Computer Science',
  classLevelPlaceholder: 'Year One, Year Two, Master One...',
  bulkBatchExample: 'Year One - 2026 Intake',
  defaultClassLevel: 'Year One',
  classSuggestions: ['Year One', 'Year Two', 'Year Three', 'Year Four', 'Year Five'],
  institution: 'Institution',
  adminTitle: 'Institution Administrator',
  teacher: 'Lecturer',
  teachers: 'Lecturers',
  programme: 'Programme',
  programmes: 'Programmes',
  department: 'Department',
  departments: 'Departments',
  courseUnit: 'Course unit',
  courseUnits: 'Course units',
  credits: 'Credits',
  academicYear: 'Academic year',
  period: 'Semester',
  periods: 'Semesters',
  recordsOfficer: 'Registrar',
};

export function getEducationTerms(category: EducationCategory): EducationTerms {
  if (category === 'basic') return BASIC;
  if (category === 'higher') return HIGHER;
  return SECONDARY;
}

/** Backend SchoolClass.cycle for a new class of a basic school. */
export function basicCycleForClassName(name: string): 'nursery' | 'primary' {
  const n = name.trim().toLowerCase();
  if (/^(nursery|maternelle|petite|moyenne|grande|ps\b|ms\b|gs\b|kg|kinder|creche|pre)/.test(n)) return 'nursery';
  return 'primary';
}
