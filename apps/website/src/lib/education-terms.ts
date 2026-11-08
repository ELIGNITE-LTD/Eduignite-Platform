import type { EducationCategory } from '@/lib/cameroon-education-system';

/**
 * One place for the wording that differs between nursery/primary ("basic")
 * schools and everyone else. Secondary/higher keep their existing wording
 * exactly; only the basic column is new.
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
};

export function getEducationTerms(category: EducationCategory): EducationTerms {
  return category === 'basic' ? BASIC : SECONDARY;
}

/** Backend SchoolClass.cycle for a new class of a basic school. */
export function basicCycleForClassName(name: string): 'nursery' | 'primary' {
  const n = name.trim().toLowerCase();
  if (/^(nursery|maternelle|petite|moyenne|grande|ps\b|ms\b|gs\b|kg|kinder|creche|pre)/.test(n)) return 'nursery';
  return 'primary';
}
