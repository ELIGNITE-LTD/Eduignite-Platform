import assert from "node:assert/strict";
import test from "node:test";
import { dateToMonth, describePeriod, formatMonthYear, monthToEndDate, monthToStartDate } from "./leadership-dates";

test("month input to dates", () => {
  assert.equal(monthToStartDate("2024-03"), "2024-03-01");
  assert.equal(monthToEndDate("2024-06"), "2024-06-30");
  assert.equal(monthToEndDate("2024-02"), "2024-02-29");
  assert.equal(monthToEndDate("2023-02"), "2023-02-28");
  assert.equal(monthToStartDate(""), null);
  assert.equal(monthToEndDate("2024-13"), null);
});

test("dates back to the month input and to words", () => {
  assert.equal(dateToMonth("2024-03-15"), "2024-03");
  assert.equal(dateToMonth(null), "");
  assert.equal(formatMonthYear("2023-03-01"), "March 2023");
  assert.equal(formatMonthYear(undefined), "");
});

test("periods read like the AI answers", () => {
  assert.equal(describePeriod({ is_current: true, start_date: "2024-03-01", end_date: null }), "March 2024 – present");
  assert.equal(describePeriod({ is_current: false, start_date: "2023-03-01", end_date: "2024-06-30" }), "March 2023 – June 2024");
  assert.equal(describePeriod({ is_current: false, start_date: null, end_date: null }), "Dates not recorded");
  assert.equal(describePeriod({ is_current: true, start_date: null, end_date: null }), "Current (start not recorded)");
});
