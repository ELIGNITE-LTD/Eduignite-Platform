// Pure promotion-decision logic for the Student Management "promote class to
// next class" bulk workflow. Kept free of database/IO concerns so it is
// trivial to unit test (see tests/promotion.test.ts); the studentRepository
// applies the plan this module produces to the actual database rows.

import { DEFAULT_PROMOTION_AVERAGE } from './grading';

export type PromotionOutcome = 'promoted' | 'repeated';

export interface PromotionCandidate {
  studentId: string;
  /** Term/annual average on a /20 scale, or null if no marks exist yet. */
  averageScore: number | null;
}

export interface PromotionDecision {
  studentId: string;
  averageScore: number | null;
  outcome: PromotionOutcome;
  reason: string;
}

/**
 * A student with no recorded average cannot be judged eligible, so they are
 * conservatively held back (repeated) rather than silently promoted — this
 * favors "never lose/misstate a record" over convenience, per the spec's
 * data-safety directive.
 */
export function decidePromotionOutcome(
  averageScore: number | null,
  promotionAverage: number = DEFAULT_PROMOTION_AVERAGE
): PromotionDecision['outcome'] {
  if (averageScore === null) return 'repeated';
  return averageScore >= promotionAverage ? 'promoted' : 'repeated';
}

/**
 * Builds a promotion plan for an entire class stream. Pure function: given
 * each student's average, returns what should happen to them. The caller
 * (studentRepository.promoteClassStream) is responsible for actually moving
 * "promoted" students to the target class stream and recording the decision.
 */
export function planClassPromotion(
  candidates: PromotionCandidate[],
  promotionAverage: number = DEFAULT_PROMOTION_AVERAGE
): PromotionDecision[] {
  return candidates.map((candidate) => {
    const outcome = decidePromotionOutcome(candidate.averageScore, promotionAverage);
    const reason =
      candidate.averageScore === null
        ? 'No academic average on record for this term/year — held back pending marks.'
        : outcome === 'promoted'
          ? `Average ${candidate.averageScore.toFixed(2)} meets the promotion threshold of ${promotionAverage}.`
          : `Average ${candidate.averageScore.toFixed(2)} is below the promotion threshold of ${promotionAverage}.`;

    return {
      studentId: candidate.studentId,
      averageScore: candidate.averageScore,
      outcome,
      reason,
    };
  });
}

export function summarizePromotionPlan(decisions: PromotionDecision[]): {
  promotedCount: number;
  repeatedCount: number;
  total: number;
} {
  const promotedCount = decisions.filter((d) => d.outcome === 'promoted').length;
  return {
    promotedCount,
    repeatedCount: decisions.length - promotedCount,
    total: decisions.length,
  };
}
