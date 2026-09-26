/**
 * The word that goes beside a mark.
 *
 * Remarks used to be whatever a teacher typed, which meant most students had
 * none at all and a marks sheet printed a column of blanks. They are derived
 * from the mark now, so every student has one and two teachers marking the
 * same score never describe it differently.
 *
 * The thresholds are the ones the platform already uses on report cards
 * (`get_remark` in backend/apps/grades/utils.py). They are repeated here
 * rather than fetched because the marks sheet is built in the browser, often
 * with no connection - but they must not drift: a student described as "Good"
 * on the marks sheet and "Average" on their report card is the kind of thing
 * a parent brings to the principal.
 */

/** Marks are out of 20 throughout the platform. */
export const MARK_TOTAL = 20;

const SCALE: Array<{ from: number; remark: string }> = [
  { from: 16, remark: "Excellent" },
  { from: 14, remark: "Very Good" },
  { from: 12, remark: "Good" },
  { from: 10, remark: "Average" },
  { from: 8, remark: "Poor" },
  { from: 0, remark: "Very Poor" },
];

/**
 * The remark for a mark out of 20, or an empty string when there is no mark.
 *
 * A student who was not marked gets nothing rather than "Very Poor": an
 * absence is not a failure, and printing one as the other would be unfair on
 * the student and wrong in front of a parent.
 */
export function remarkForMark(mark: unknown): string {
  if (mark === null || mark === undefined || mark === "" || mark === "-") return "";

  const score = Number(mark);
  if (!Number.isFinite(score)) return "";

  const band = SCALE.find((entry) => score >= entry.from);
  return band ? band.remark : "";
}

/** The remark, falling back to whatever a teacher wrote if there is no mark. */
export function remarkOrComment(mark: unknown, comment?: unknown): string {
  const remark = remarkForMark(mark);
  if (remark) return remark;
  return String(comment ?? "").trim();
}
