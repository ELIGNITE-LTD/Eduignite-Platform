import type Database from 'better-sqlite3-multiple-ciphers';
import { newId, nowIso } from '../shared/ids';
import type { FeeTemplate, FinancialTransaction, Payment } from '../shared/types';
import {
  buildCollectionsReport,
  calculateStudentBalance,
  generateReceiptNumber,
  summarizeCollectionsByClass,
  type CollectionsReportRow,
  type StudentBalance,
} from '../domain/finance';
import { enqueueChange } from './syncQueueRepository';

// Financial Management (spec module 9): fee templates, payments/receipts,
// balances, transaction log, and collections reporting. domain/finance.ts
// owns the pure balance/receipt-number math; this module fetches rows and
// persists payments + the append-only financial_transactions ledger.
//
// Known simplification (documented for the audit/QA agent): a payment not
// tied to a specific fee_template_id (a lump-sum payment) is treated as
// applying to every term/year balance query for that student, since the
// schema does not carry a separate term/academic_year on `payments`. A
// template-linked payment only offsets that template's own charge.

export type FeeTemplateInput = Omit<FeeTemplate, 'id' | 'created_at' | 'updated_at'>;

export function listFeeTemplates(
  db: Database.Database,
  schoolId: string,
  filters: { classId?: string; term?: string; academicYear?: string } = {}
): FeeTemplate[] {
  const clauses = ['school_id = @schoolId'];
  const params: Record<string, unknown> = { schoolId };
  if (filters.classId) {
    clauses.push('(class_id = @classId OR class_id IS NULL)');
    params.classId = filters.classId;
  }
  if (filters.term) {
    clauses.push('term = @term');
    params.term = filters.term;
  }
  if (filters.academicYear) {
    clauses.push('academic_year = @academicYear');
    params.academicYear = filters.academicYear;
  }
  return db
    .prepare(`SELECT * FROM fee_templates WHERE ${clauses.join(' AND ')} ORDER BY name`)
    .all(params) as FeeTemplate[];
}

export function createFeeTemplate(db: Database.Database, input: FeeTemplateInput): FeeTemplate {
  const id = newId();
  const now = nowIso();
  db.prepare(
    `INSERT INTO fee_templates (
      id, school_id, class_id, name, term, academic_year, amount, currency, due_date, is_mandatory,
      created_at, updated_at
    ) VALUES (@id, @school_id, @class_id, @name, @term, @academic_year, @amount, @currency, @due_date,
      @is_mandatory, @created_at, @updated_at)`
  ).run({ id, ...input, created_at: now, updated_at: now });
  const created = db.prepare('SELECT * FROM fee_templates WHERE id = ?').get(id) as FeeTemplate;
  enqueueChange(db, 'fee_templates', id, 'insert', created);
  return created;
}

export interface RecordPaymentInput {
  schoolId: string;
  studentId: string;
  feeTemplateId?: string | null;
  amount: number;
  currency: string;
  paymentMethod: string;
  referenceNumber?: string;
  paymentDate: string;
  notes?: string;
  schoolShortCode: string;
}

/** Records a payment, generates its receipt number, and logs a matching financial_transactions row. */
export function recordPayment(db: Database.Database, input: RecordPaymentInput): Payment {
  const id = newId();
  const now = nowIso();

  const countRow = db
    .prepare('SELECT COUNT(*) as n FROM payments WHERE school_id = ?')
    .get(input.schoolId) as { n: number };
  const receiptNumber = generateReceiptNumber(input.schoolShortCode, countRow.n + 1, new Date(input.paymentDate));

  const runInTransaction = db.transaction(() => {
    db.prepare(
      `INSERT INTO payments (
        id, school_id, student_id, fee_template_id, amount, currency, payment_method, reference_number,
        receipt_number, payment_date, notes, created_at, updated_at
      ) VALUES (@id, @school_id, @student_id, @fee_template_id, @amount, @currency, @payment_method,
        @reference_number, @receipt_number, @payment_date, @notes, @created_at, @updated_at)`
    ).run({
      id,
      school_id: input.schoolId,
      student_id: input.studentId,
      fee_template_id: input.feeTemplateId ?? null,
      amount: input.amount,
      currency: input.currency,
      payment_method: input.paymentMethod,
      reference_number: input.referenceNumber ?? '',
      receipt_number: receiptNumber,
      payment_date: input.paymentDate,
      notes: input.notes ?? '',
      created_at: now,
      updated_at: now,
    });

    const transactionId = newId();
    db.prepare(
      `INSERT INTO financial_transactions (
        id, school_id, transaction_type, reference_id, amount, currency, description, transaction_date, created_at
      ) VALUES (@id, @school_id, 'payment', @reference_id, @amount, @currency, @description, @transaction_date, @created_at)`
    ).run({
      id: transactionId,
      school_id: input.schoolId,
      reference_id: id,
      amount: input.amount,
      currency: input.currency,
      description: `Payment received (receipt ${receiptNumber})`,
      transaction_date: input.paymentDate,
      created_at: now,
    });
  });
  runInTransaction();

  const saved = db.prepare('SELECT * FROM payments WHERE id = ?').get(id) as Payment;
  enqueueChange(db, 'payments', id, 'insert', saved);
  return saved;
}

export function getPayment(db: Database.Database, id: string): Payment | null {
  const row = db.prepare('SELECT * FROM payments WHERE id = ?').get(id) as Payment | undefined;
  return row ?? null;
}

export function listPaymentsForStudent(db: Database.Database, studentId: string): Payment[] {
  return db
    .prepare('SELECT * FROM payments WHERE student_id = ? ORDER BY payment_date DESC')
    .all(studentId) as Payment[];
}

export interface GetBalanceInput {
  studentId: string;
  classId: string | null;
  term: string;
  academicYear: string;
}

export function getStudentBalance(db: Database.Database, input: GetBalanceInput): StudentBalance {
  const charges = db
    .prepare(
      `SELECT id, amount FROM fee_templates
       WHERE (class_id = @classId OR class_id IS NULL) AND term = @term AND academic_year = @academicYear`
    )
    .all({ classId: input.classId, term: input.term, academicYear: input.academicYear }) as {
    id: string;
    amount: number;
  }[];

  const payments = db
    .prepare('SELECT amount, fee_template_id FROM payments WHERE student_id = ?')
    .all(input.studentId) as { amount: number; fee_template_id: string | null }[];

  return calculateStudentBalance(
    charges.map((c) => ({ feeTemplateId: c.id, amount: c.amount })),
    payments.map((p) => ({ amount: p.amount, feeTemplateId: p.fee_template_id }))
  );
}

export interface TransactionFilters {
  schoolId: string;
  dateFrom?: string;
  dateTo?: string;
}

export function listTransactions(db: Database.Database, filters: TransactionFilters): FinancialTransaction[] {
  const clauses = ['school_id = @schoolId'];
  const params: Record<string, unknown> = { schoolId: filters.schoolId };
  if (filters.dateFrom) {
    clauses.push('transaction_date >= @dateFrom');
    params.dateFrom = filters.dateFrom;
  }
  if (filters.dateTo) {
    clauses.push('transaction_date <= @dateTo');
    params.dateTo = filters.dateTo;
  }
  return db
    .prepare(`SELECT * FROM financial_transactions WHERE ${clauses.join(' AND ')} ORDER BY transaction_date DESC`)
    .all(params) as FinancialTransaction[];
}

/** Per-class collections report (charged vs collected vs outstanding) for a term/year. */
export function collectionsReport(
  db: Database.Database,
  schoolId: string,
  term: string,
  academicYear: string
): CollectionsReportRow[] {
  const students = db
    .prepare(
      `SELECT s.id as student_id, cs.class_id as class_id
       FROM students s
       LEFT JOIN class_streams cs ON cs.id = s.class_stream_id
       WHERE s.school_id = ? AND s.status = 'active'`
    )
    .all(schoolId) as { student_id: string; class_id: string | null }[];

  const rows = students.map((student) => {
    const balance = getStudentBalance(db, {
      studentId: student.student_id,
      classId: student.class_id,
      term,
      academicYear,
    });
    return {
      classId: student.class_id,
      charges: [{ feeTemplateId: '_', amount: balance.totalCharged }],
      payments: [{ amount: balance.totalPaid, feeTemplateId: null }],
    };
  });

  return summarizeCollectionsByClass(buildCollectionsReport(rows));
}
