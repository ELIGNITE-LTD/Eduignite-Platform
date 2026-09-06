import { describe, expect, it } from 'vitest';
import { decidePromotionOutcome, planClassPromotion, summarizePromotionPlan } from '../src/domain/promotion';

describe('decidePromotionOutcome', () => {
  it('promotes at or above the threshold', () => {
    expect(decidePromotionOutcome(10, 10)).toBe('promoted');
    expect(decidePromotionOutcome(15, 10)).toBe('promoted');
  });

  it('holds back below the threshold', () => {
    expect(decidePromotionOutcome(9.99, 10)).toBe('repeated');
  });

  it('conservatively holds back a student with no recorded average', () => {
    expect(decidePromotionOutcome(null, 10)).toBe('repeated');
  });
});

describe('planClassPromotion', () => {
  it('produces one decision per candidate with a human-readable reason', () => {
    const decisions = planClassPromotion(
      [
        { studentId: 'a', averageScore: 14 },
        { studentId: 'b', averageScore: 8 },
        { studentId: 'c', averageScore: null },
      ],
      10
    );

    expect(decisions).toHaveLength(3);
    expect(decisions[0]).toMatchObject({ studentId: 'a', outcome: 'promoted' });
    expect(decisions[1]).toMatchObject({ studentId: 'b', outcome: 'repeated' });
    expect(decisions[2]).toMatchObject({ studentId: 'c', outcome: 'repeated' });
    expect(decisions[2].reason).toMatch(/no academic average/i);
  });
});

describe('summarizePromotionPlan', () => {
  it('counts promoted vs repeated', () => {
    const decisions = planClassPromotion(
      [
        { studentId: 'a', averageScore: 14 },
        { studentId: 'b', averageScore: 8 },
        { studentId: 'c', averageScore: 12 },
      ],
      10
    );
    const summary = summarizePromotionPlan(decisions);
    expect(summary).toEqual({ promotedCount: 2, repeatedCount: 1, total: 3 });
  });
});
