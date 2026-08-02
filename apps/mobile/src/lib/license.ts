import type { PlatformSettings, User } from "@/lib/api/types";

const EXECUTIVE_ROLES = new Set(["SUPER_ADMIN", "CEO", "CTO", "COO", "INV", "DESIGNER"]);

function parseFee(value: unknown): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function parseDeadline(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(23, 59, 59, 999);
  return date;
}

export function getRoleFee(settings: Partial<PlatformSettings> | undefined, role?: string | null): number {
  if (!role) return 0;
  return parseFee(settings?.fees?.[role] ?? 0);
}

export function getLicenseAccessState(
  user: Pick<User, "role" | "isLicensePaid" | "is_license_paid"> | null | undefined,
  settings?: Partial<PlatformSettings>
) {
  const role = user?.role ?? null;
  const feeAmount = getRoleFee(settings, role);
  const deadline = parseDeadline(settings?.paymentDeadline ?? settings?.payment_deadline);
  const isPaid = Boolean(user?.isLicensePaid ?? user?.is_license_paid);
  const isExecutive = role ? EXECUTIVE_ROLES.has(role) : false;
  const now = new Date();
  const beforeDeadline = deadline ? now <= deadline : true;
  const restrictionApplies = !isExecutive && feeAmount > 0 && !isPaid && !beforeDeadline;

  return {
    feeAmount,
    deadline,
    isPaid,
    isExecutive,
    beforeDeadline,
    restrictionApplies,
    statusLabel:
      feeAmount <= 0 ? "Not Required" : isPaid ? "Paid" : beforeDeadline ? "Pending" : "Overdue",
  };
}
