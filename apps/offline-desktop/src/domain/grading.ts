// Pure, framework-agnostic grading logic for Academic Records + Report Cards.
// No database or Electron imports here on purpose — this file is unit
// tested directly (see tests/grading.test.ts) and is also imported by the
// report-card repository when compiling a term report.
//
// Grading model (documented assumption — the spec calls for "automated
// calculation of averages, totals, grade ranges, and promotional eligibility"
// but does not prescribe an exact formula, so this mirrors a common /20
// scale used across the EduIgnite ecosystem, matching the cloud's
// SubjectGrade score/max_score default of 20):
//   1. Every CAT and exam score is normalized to a /20 scale.
//   2. A subject's CAT average is the mean of its normalized CAT scores.
//   3. A subject's overall average is the mean of its CAT average and its
//      exam score (equal weight) when both exist; otherwise whichever exists.
//   4. A subject's weighted score is `subject_average * coefficient`.
//   5. The term average is `sum(weighted_score) / sum(coefficient)` across
//      every subject that has at least one mark.

export const DEFAULT_MAX_SCORE = 20;
export const DEFAULT_PROMOTION_AVERAGE = 10; // out of 20 — matches cloud default (Decimal('10.00'))

export interface RawScore {
  score: number;
  max_score: number;
}

/** Normalizes a raw score to a /20 scale. */
export function normalizeScore(raw: RawScore, targetScale: number = DEFAULT_MAX_SCORE): number {
  if (raw.max_score <= 0) {
    throw new Error(`Invalid max_score (${raw.max_score}); it must be greater than zero.`);
  }
  return (raw.score / raw.max_score) * targetScale;
}

/** Mean of a set of CAT scores, normalized to /20. Returns null if there are no CATs. */
export function calculateCatAverage(cats: RawScore[]): number | null {
  if (cats.length === 0) return null;
  const total = cats.reduce((sum, cat) => sum + normalizeScore(cat), 0);
  return total / cats.length;
}

export interface SubjectMarks {
  subjectId: string;
  subjectName: string;
  coefficient: number;
  cats: RawScore[];
  exam: RawScore | null;
}

export interface SubjectResult {
  subjectId: string;
  subjectName: string;
  coefficient: number;
  catAverage: number | null;
  examScore: number | null;
  subjectAverage: number | null;
  weightedScore: number | null;
}

/**
 * Combines a subject's CAT average and exam score into one subject average.
 * Equal-weighted mean of whichever of the two are present; null if neither
 * exists (no marks recorded yet for this subject).
 */
export function calculateSubjectAverage(catAverage: number | null, examScore: number | null): number | null {
  if (catAverage === null && examScore === null) return null;
  if (catAverage === null) return examScore;
  if (examScore === null) return catAverage;
  return (catAverage + examScore) / 2;
}

export function calculateSubjectResult(marks: SubjectMarks): SubjectResult {
  const catAverage = calculateCatAverage(marks.cats);
  const examScore = marks.exam ? normalizeScore(marks.exam) : null;
  const subjectAverage = calculateSubjectAverage(catAverage, examScore);
  const weightedScore = subjectAverage === null ? null : subjectAverage * marks.coefficient;

  return {
    subjectId: marks.subjectId,
    subjectName: marks.subjectName,
    coefficient: marks.coefficient,
    catAverage,
    examScore,
    subjectAverage,
    weightedScore,
  };
}

export interface TermResult {
  subjects: SubjectResult[];
  totalScore: number;
  totalCoefficient: number;
  averageScore: number;
  gradeRange: string;
  promotionalEligible: boolean;
}

/** Grade-range buckets on a /20 scale. Ordered highest to lowest. */
export const GRADE_RANGES: { min: number; label: string }[] = [
  { min: 16, label: 'Excellent' },
  { min: 14, label: 'Very Good' },
  { min: 12, label: 'Good' },
  { min: 10, label: 'Average' },
  { min: 0, label: 'Weak' },
];

export function calculateGradeRange(average: number): string {
  for (const range of GRADE_RANGES) {
    if (average >= range.min) return range.label;
  }
  return GRADE_RANGES[GRADE_RANGES.length - 1].label;
}

/**
 * Compiles a full term result (used by Report Cards) from every subject's
 * marks. Subjects with no marks at all are excluded from the coefficient sum
 * (a student cannot be penalized for a subject nobody has graded yet), but
 * are still returned in `subjects` so the report card can show "—" for them.
 */
export function calculateTermResult(
  subjectMarks: SubjectMarks[],
  promotionAverage: number = DEFAULT_PROMOTION_AVERAGE
): TermResult {
  const subjects = subjectMarks.map(calculateSubjectResult);

  const graded = subjects.filter((s) => s.weightedScore !== null && s.coefficient > 0);
  const totalScore = graded.reduce((sum, s) => sum + (s.weightedScore as number), 0);
  const totalCoefficient = graded.reduce((sum, s) => sum + s.coefficient, 0);
  const averageScore = totalCoefficient > 0 ? totalScore / totalCoefficient : 0;

  return {
    subjects,
    totalScore,
    totalCoefficient,
    averageScore,
    gradeRange: calculateGradeRange(averageScore),
    promotionalEligible: totalCoefficient > 0 && averageScore >= promotionAverage,
  };
}
