// Pure fee-balance and collections-report calculation logic (Financial
// Management module). No DB/IO here — repositories/financeRepository.ts
// fetches the rows and hands them to these functions.

export interface FeeCharge {
  feeTemplateId: string;
  amount: number;
}

export interface FeePaymentRecord {
  amount: number;
  feeTemplateId: string | null;
}

export interface StudentBalance {
  totalCharged: number;
  totalPaid: number;
  balance: number;
}

/**
 * A student's running balance for a given term/year = sum of applicable fee
 * templates minus sum of payments recorded against them. Payments not tied
 * to a specific fee template (fee_template_id null — e.g. a lump-sum
 * payment) are still subtracted from the total owed.
 */
export function calculateStudentBalance(charges: FeeCharge[], payments: FeePaymentRecord[]): StudentBalance {
  const totalCharged = charges.reduce((sum, c) => sum + c.amount, 0);
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  return {
    totalCharged,
    totalPaid,
    balance: totalCharged - totalPaid,
  };
}

export interface CollectionsReportRow {
  classId: string | null;
  totalCharged: number;
  totalCollected: number;
  outstandingBalance: number;
  studentCount: number;
}

export interface CollectionsReportInput {
  classId: string | null;
  charges: FeeCharge[];
  payments: FeePaymentRecord[];
}

export function buildCollectionsReport(rows: CollectionsReportInput[]): CollectionsReportRow[] {
  return rows.map((row) => {
    const balance = calculateStudentBalance(row.charges, row.payments);
    return {
      classId: row.classId,
      totalCharged: balance.totalCharged,
      totalCollected: balance.totalPaid,
      outstandingBalance: balance.balance,
      studentCount: 1,
    };
  });
}

/** Aggregates per-student collections rows into one summary per class. */
export function summarizeCollectionsByClass(rows: CollectionsReportRow[]): CollectionsReportRow[] {
  const byClass = new Map<string, CollectionsReportRow>();
  for (const row of rows) {
    const key = row.classId ?? '__unassigned__';
    const existing = byClass.get(key);
    if (existing) {
      existing.totalCharged += row.totalCharged;
      existing.totalCollected += row.totalCollected;
      existing.outstandingBalance += row.outstandingBalance;
      existing.studentCount += row.studentCount;
    } else {
      byClass.set(key, { ...row });
    }
  }
  return Array.from(byClass.values());
}

/** Generates a receipt number that is unique-per-school and human-legible. */
export function generateReceiptNumber(schoolShortCode: string, sequence: number, date: Date = new Date()): string {
  const year = date.getFullYear();
  const paddedSeq = String(sequence).padStart(5, '0');
  return `RCT-${schoolShortCode.toUpperCase()}-${year}-${paddedSeq}`;
}
