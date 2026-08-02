/**
 * Dynamic marks ledger for student and parent follow-up tables.
 *
 * Pivots the raw teacher-saved grades into one row per subject with a column
 * for EVERY sequence that already has marks — numbered globally across the
 * year (Term 1 → Seq 1/2, Term 2 → Seq 3/4, Term 3 → Seq 5/6) — regardless of
 * which term is currently active. The same builder powers the student and the
 * parent tables so both accounts see identical, real, live figures.
 */

export type LedgerColumn = { id: string; label: string };

export type LedgerRow = {
  subject: string;
  teacher: string;
  coef: number;
  scores: Record<string, number | null>;
  average: number;
  total: number;
};

export type SequenceLedger = { columns: LedgerColumn[]; rows: LedgerRow[] };

const num = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function buildSequenceLedger(grades: any[] = []): SequenceLedger {
  const list = (grades || []).filter(Boolean);

  // 1. Discover every sequence present in the marks.
  const seqMap = new Map<string, { id: string; name: string; term: number }>();
  for (const grade of list) {
    const id = String(grade.sequence?.id ?? grade.sequence ?? grade.sequence_id ?? "");
    if (!id || seqMap.has(id)) continue;
    seqMap.set(id, {
      id,
      name: String(grade.sequence?.name ?? grade.sequence_name ?? ""),
      term: num(grade.sequence?.term ?? grade.sequence_term, 0),
    });
  }

  // 2. Order sequences by (term, name) and number them globally across the year.
  const ordered = Array.from(seqMap.values()).sort(
    (a, b) => (a.term - b.term) || a.name.localeCompare(b.name, undefined, { numeric: true }),
  );
  const perTerm: Record<number, number> = {};
  const columns: LedgerColumn[] = ordered.map((seq, index) => {
    let label: string;
    if (seq.term >= 1 && seq.term <= 3) {
      perTerm[seq.term] = (perTerm[seq.term] || 0) + 1;
      label = `Seq ${(seq.term - 1) * 2 + perTerm[seq.term]}`;
    } else {
      label = seq.name || `Seq ${index + 1}`;
    }
    return { id: seq.id, label };
  });

  // 3. One row per subject, scores placed in their true sequence column.
  const rowMap = new Map<string, LedgerRow>();
  for (const grade of list) {
    const subject = String(grade.subject?.name ?? grade.subject_name ?? "Unknown Subject");
    const seqId = String(grade.sequence?.id ?? grade.sequence ?? grade.sequence_id ?? "");
    let row = rowMap.get(subject);
    if (!row) {
      row = {
        subject,
        teacher: String(grade.teacher_name ?? grade.teacher?.name ?? ""),
        coef: num(grade.subject?.coefficient ?? grade.coefficient, 1),
        scores: {},
        average: 0,
        total: 0,
      };
      rowMap.set(subject, row);
    }
    if (seqId) row.scores[seqId] = num(grade.score);
    if (grade.teacher_name) row.teacher = String(grade.teacher_name);
  }

  const rows = Array.from(rowMap.values())
    .map((row) => {
      const present = columns
        .map((col) => row.scores[col.id])
        .filter((v): v is number => v !== null && v !== undefined);
      const average = present.length ? present.reduce((s, v) => s + v, 0) / present.length : 0;
      return { ...row, average, total: average * row.coef };
    })
    .sort((a, b) => a.subject.localeCompare(b.subject));

  return { columns, rows };
}

export default buildSequenceLedger;
