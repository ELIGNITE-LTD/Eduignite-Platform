// Authoritative platform-subscription helpers shared by the fee tabs.
//
// The real subscription fee lives in /platform/fees/ (the same source the backend
// reads first in apps/platform/access.py), NOT the merged DEFAULT_FEES carried in
// platform settings — those defaults (e.g. STUDENT "5000") would otherwise mask a
// founder-set value of 0. A student is only *restricted* (blocked from activities
// or fee recording) when the fee is > 0 AND unpaid AND the founders' payment
// deadline has passed. This mirrors the backend and lib/license.ts exactly.

export function normalizeFeeList(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

export function resolveStudentSubscriptionFee(
  platformFeesData: any,
  platformSettings: any,
): { amount: number; known: boolean } {
  const row = normalizeFeeList(platformFeesData).find((f: any) => String(f?.role).toUpperCase() === "STUDENT");
  if (row !== undefined && row !== null) {
    return { amount: Number(row.amount || 0), known: true };
  }
  const fees = (platformSettings?.fees ?? {}) as Record<string, any>;
  const raw = fees.STUDENT ?? fees.student;
  if (raw !== undefined && raw !== null && raw !== "") {
    return { amount: Number(raw) || 0, known: true };
  }
  return { amount: 0, known: false };
}

export function subscriptionDeadlinePassed(platformSettings: any): boolean {
  const raw = platformSettings?.paymentDeadline || platformSettings?.payment_deadline;
  if (!raw) return false;
  const deadline = new Date(raw);
  if (Number.isNaN(deadline.getTime())) return false;
  deadline.setHours(23, 59, 59, 999);
  return new Date() > deadline;
}

// True only when the student must settle the subscription before other activity:
// a fee is set (> 0), the student hasn't paid, and the deadline has passed.
export function studentSubscriptionBlocks(
  student: any,
  platformFeesData: any,
  platformSettings: any,
): boolean {
  if (!student) return false;
  const { amount } = resolveStudentSubscriptionFee(platformFeesData, platformSettings);
  if (amount <= 0) return false;
  if (Boolean(student.is_license_paid)) return false;
  return subscriptionDeadlinePassed(platformSettings);
}
