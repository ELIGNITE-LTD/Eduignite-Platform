import { describe, expect, it } from 'vitest';
import {
  buildCollectionsReport,
  calculateStudentBalance,
  generateReceiptNumber,
  summarizeCollectionsByClass,
} from '../src/domain/finance';

describe('calculateStudentBalance', () => {
  it('is the sum of charges minus the sum of payments', () => {
    const balance = calculateStudentBalance(
      [
        { feeTemplateId: 'f1', amount: 50000 },
        { feeTemplateId: 'f2', amount: 15000 },
      ],
      [
        { amount: 20000, feeTemplateId: 'f1' },
        { amount: 10000, feeTemplateId: null },
      ]
    );
    expect(balance).toEqual({ totalCharged: 65000, totalPaid: 30000, balance: 35000 });
  });

  it('goes negative (credit) when payments exceed charges', () => {
    const balance = calculateStudentBalance([{ feeTemplateId: 'f1', amount: 10000 }], [{ amount: 15000, feeTemplateId: 'f1' }]);
    expect(balance.balance).toBe(-5000);
  });

  it('handles no charges and no payments', () => {
    expect(calculateStudentBalance([], [])).toEqual({ totalCharged: 0, totalPaid: 0, balance: 0 });
  });
});

describe('buildCollectionsReport / summarizeCollectionsByClass', () => {
  it('aggregates per-student rows into one row per class', () => {
    const rows = buildCollectionsReport([
      { classId: 'c1', charges: [{ feeTemplateId: 'f1', amount: 10000 }], payments: [{ amount: 10000, feeTemplateId: 'f1' }] },
      { classId: 'c1', charges: [{ feeTemplateId: 'f1', amount: 10000 }], payments: [{ amount: 4000, feeTemplateId: 'f1' }] },
      { classId: 'c2', charges: [{ feeTemplateId: 'f2', amount: 5000 }], payments: [] },
    ]);
    const summary = summarizeCollectionsByClass(rows);

    const c1 = summary.find((r) => r.classId === 'c1')!;
    expect(c1.studentCount).toBe(2);
    expect(c1.totalCharged).toBe(20000);
    expect(c1.totalCollected).toBe(14000);
    expect(c1.outstandingBalance).toBe(6000);

    const c2 = summary.find((r) => r.classId === 'c2')!;
    expect(c2.studentCount).toBe(1);
    expect(c2.outstandingBalance).toBe(5000);
  });

  it('groups a null classId under one bucket', () => {
    const rows = buildCollectionsReport([
      { classId: null, charges: [{ feeTemplateId: 'f1', amount: 1000 }], payments: [] },
      { classId: null, charges: [{ feeTemplateId: 'f1', amount: 2000 }], payments: [] },
    ]);
    const summary = summarizeCollectionsByClass(rows);
    expect(summary).toHaveLength(1);
    expect(summary[0].studentCount).toBe(2);
  });
});

describe('generateReceiptNumber', () => {
  it('formats school code, year and zero-padded sequence', () => {
    expect(generateReceiptNumber('sch', 7, new Date('2026-03-01T00:00:00Z'))).toBe('RCT-SCH-2026-00007');
  });

  it('pads up to 5 digits and uppercases the school code', () => {
    expect(generateReceiptNumber('abc', 123456, new Date('2027-06-15T00:00:00Z'))).toBe('RCT-ABC-2027-123456');
  });
});
