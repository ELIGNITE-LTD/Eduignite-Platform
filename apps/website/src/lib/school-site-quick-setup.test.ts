import test from "node:test";
import assert from "node:assert/strict";
import {
  THEME_PRESETS, buildChecklist, contrastRatio, contrastReport, isPlausibleEmail, matchPreset, missingCount, normalizeHex,
} from "./school-site-quick-setup";

test("contrastRatio: black on white is 21, same colour is 1", () => {
  assert.equal(Math.round(contrastRatio("#000000", "#ffffff")), 21);
  assert.equal(contrastRatio("#336699", "#336699"), 1);
});

test("normalizeHex accepts 3 and 6 digit colours, rejects junk", () => {
  assert.equal(normalizeHex("#ABC"), "#aabbcc");
  assert.equal(normalizeHex(" #1E3A8A "), "#1e3a8a");
  assert.equal(normalizeHex("red"), null);
  assert.equal(normalizeHex("#12345"), null);
});

test("every preset gives a readable hero and is recognised", () => {
  assert.equal(THEME_PRESETS.length, 4);
  for (const p of THEME_PRESETS) {
    const report = contrastReport(p.hex);
    assert.ok(report.level === "great" || report.level === "adjusted", p.key);
    assert.ok(contrastRatio(report.palette!.via, "#ffffff") >= 7, p.key);
    assert.equal(matchPreset(p.hex)?.key, p.key);
  }
});

test("near-white is never reported as great; invalid input is flagged", () => {
  assert.notEqual(contrastReport("#fafafa").level, "great");
  assert.equal(contrastReport("#zzz").level, "invalid");
});

test("buildChecklist mirrors backend publish_errors keys", () => {
  assert.equal(missingCount(buildChecklist({})), 0);
  const items = buildChecklist({ description: "x", contact: "y", future_rule: "Do the thing" });
  assert.equal(missingCount(items), 3);
  assert.equal(items.find((i) => i.key === "description")?.fixStep, 0);
  assert.equal(items.find((i) => i.key === "future_rule")?.done, false);
  assert.equal(items.find((i) => i.key === "name")?.done, true);
});

test("isPlausibleEmail", () => {
  assert.ok(isPlausibleEmail(""));
  assert.ok(isPlausibleEmail("a@b.cm"));
  assert.ok(!isPlausibleEmail("a@b"));
});
