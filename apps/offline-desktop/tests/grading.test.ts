import { describe, expect, it } from 'vitest';
import {
  calculateCatAverage,
  calculateGradeRange,
  calculateSubjectAverage,
  calculateSubjectResult,
  calculateTermResult,
  normalizeScore,
} from '../src/domain/grading';

describe('normalizeScore', () => {
  it('scales a raw score to /20', () => {
    expect(normalizeScore({ score: 8, max_score: 10 })).toBe(16);
    expect(normalizeScore({ score: 50, max_score: 100 })).toBe(10);
  });

  it('throws on a non-positive max_score', () => {
    expect(() => normalizeScore({ score: 5, max_score: 0 })).toThrow();
  });
});

describe('calculateCatAverage', () => {
  it('returns null when there are no CATs', () => {
    expect(calculateCatAverage([])).toBeNull();
  });

  it('averages normalized CAT scores', () => {
    // 16/20 and 10/20 -> average 13
    expect(calculateCatAverage([{ score: 16, max_score: 20 }, { score: 10, max_score: 20 }])).toBe(13);
  });
});

describe('calculateSubjectAverage', () => {
  it('is null when neither CAT nor exam exist', () => {
    expect(calculateSubjectAverage(null, null)).toBeNull();
  });
  it('falls back to whichever value exists', () => {
    expect(calculateSubjectAverage(14, null)).toBe(14);
    expect(calculateSubjectAverage(null, 12)).toBe(12);
  });
  it('averages CAT and exam equally when both exist', () => {
    expect(calculateSubjectAverage(10, 16)).toBe(13);
  });
});

describe('calculateSubjectResult', () => {
  it('computes weighted score as subjectAverage * coefficient', () => {
    const result = calculateSubjectResult({
      subjectId: 's1',
      subjectName: 'Maths',
      coefficient: 4,
      cats: [{ score: 16, max_score: 20 }],
      exam: { score: 12, max_score: 20 },
    });
    expect(result.catAverage).toBe(16);
    expect(result.examScore).toBe(12);
    expect(result.subjectAverage).toBe(14);
    expect(result.weightedScore).toBe(56);
  });

  it('leaves weightedScore null for an ungraded subject', () => {
    const result = calculateSubjectResult({
      subjectId: 's2',
      subjectName: 'Art',
      coefficient: 1,
      cats: [],
      exam: null,
    });
    expect(result.subjectAverage).toBeNull();
    expect(result.weightedScore).toBeNull();
  });
});

describe('calculateGradeRange', () => {
  it.each([
    [18, 'Excellent'],
    [16, 'Excellent'],
    [15, 'Very Good'],
    [14, 'Very Good'],
    [13, 'Good'],
    [12, 'Good'],
    [11, 'Average'],
    [10, 'Average'],
    [9, 'Weak'],
    [0, 'Weak'],
  ])('maps average %d to %s', (average, expected) => {
    expect(calculateGradeRange(average)).toBe(expected);
  });
});

describe('calculateTermResult', () => {
  it('computes totals/average/gradeRange/promotionalEligible across subjects, excluding ungraded ones', () => {
    const result = calculateTermResult([
      {
        subjectId: 's1',
        subjectName: 'Maths',
        coefficient: 4,
        cats: [{ score: 16, max_score: 20 }],
        exam: { score: 16, max_score: 20 },
      },
      {
        subjectId: 's2',
        subjectName: 'English',
        coefficient: 3,
        cats: [{ score: 12, max_score: 20 }],
        exam: { score: 12, max_score: 20 },
      },
      // Ungraded subject — must not count toward totalCoefficient.
      { subjectId: 's3', subjectName: 'Music', coefficient: 1, cats: [], exam: null },
    ]);

    // Maths: avg 16 * coef 4 = 64; English: avg 12 * coef 3 = 36; total = 100, coef = 7
    expect(result.totalScore).toBe(100);
    expect(result.totalCoefficient).toBe(7);
    expect(result.averageScore).toBeCloseTo(100 / 7, 5);
    expect(result.gradeRange).toBe('Very Good');
    expect(result.promotionalEligible).toBe(true);
    expect(result.subjects).toHaveLength(3);
  });

  it('is not promotion-eligible when average is below the threshold, and zero-coefficient subjects still exclude', () => {
    const result = calculateTermResult(
      [
        {
          subjectId: 's1',
          subjectName: 'Maths',
          coefficient: 4,
          cats: [{ score: 8, max_score: 20 }],
          exam: { score: 6, max_score: 20 },
        },
      ],
      10
    );
    expect(result.averageScore).toBe(7);
    expect(result.promotionalEligible).toBe(false);
    expect(result.gradeRange).toBe('Weak');
  });

  it('returns a zero average and is not eligible when no subject has any marks', () => {
    const result = calculateTermResult([
      { subjectId: 's1', subjectName: 'Maths', coefficient: 4, cats: [], exam: null },
    ]);
    expect(result.totalCoefficient).toBe(0);
    expect(result.averageScore).toBe(0);
    expect(result.promotionalEligible).toBe(false);
  });
});
