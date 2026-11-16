/** Month-level dates for the leadership list ("March 2024"): the form uses <input type="month">. Pure. */

const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2024-03" -> "2024-03-01" (start of the month), or null when empty/invalid. */
export function monthToStartDate(month: string): string | null {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? `${month}-01` : null;
}

/** "2024-06" -> "2024-06-30" (last day of the month), or null when empty/invalid. */
export function monthToEndDate(month: string): string | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(last).padStart(2, "0")}`;
}

/** "2024-03-15" -> "2024-03" for the month input; "" when empty. */
export function dateToMonth(date: string | null | undefined): string {
  return date && /^\d{4}-\d{2}/.test(date) ? date.slice(0, 7) : "";
}

/** "2024-03-15" -> "March 2024"; "" when empty. */
export function formatMonthYear(date: string | null | undefined): string {
  const month = dateToMonth(date);
  if (!month) return "";
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS_EN[m - 1]} ${y}`;
}

/** "March 2024 – present", "March 2023 – June 2024", or a plain note when dates are not recorded. */
export function describePeriod(entry: { is_current: boolean; start_date: string | null; end_date: string | null }): string {
  const start = formatMonthYear(entry.start_date);
  const end = formatMonthYear(entry.end_date);
  if (entry.is_current) return start ? `${start} – present` : "Current (start not recorded)";
  if (start && end) return `${start} – ${end}`;
  if (start) return `From ${start} (end not recorded)`;
  if (end) return `Until ${end} (start not recorded)`;
  return "Dates not recorded";
}
