import assert from "node:assert/strict";
import test from "node:test";
import { headTitleFor, ONBOARD_LEVELS, onboardConfig, onboardingProblem, normalizeOnboardLevel, payloadForLevel } from "./onboarding-form";

const full = { name: "Univ", shortName: "UB", principal: "Prof. A", email: "a@b.cm", cityVillage: "Buea" };

test("the four levels are offered, higher last", () => {
  assert.deepEqual(ONBOARD_LEVELS.map((l) => l.value), ["nursery", "primary", "secondary", "higher"]);
});

test("a higher institution is never asked for a Principal or a school type", () => {
  const c = onboardConfig("higher");
  assert.match(c.headLabel, /Rector/);
  assert.doesNotMatch(c.headLabel, /Principal/i);
  assert.equal(c.showSchoolType, false);
  assert.equal(headTitleFor("higher"), "Head of Institution");
});

test("secondary keeps Principal and the school type; basic has a Head Teacher", () => {
  assert.equal(onboardConfig("secondary").headLabel, "Principal Name");
  assert.equal(onboardConfig("secondary").showSchoolType, true);
  assert.equal(headTitleFor("primary"), "Head Teacher");
  assert.equal(headTitleFor("nursery"), "Head Teacher");
  assert.equal(headTitleFor("basic"), "Head Teacher");
  assert.equal(onboardConfig("primary").showSchoolType, false);
  assert.equal(onboardConfig("nursery").showSchoolType, false);
  assert.equal(onboardConfig("nursery").nameLabel, "Full Nursery School Name");
  assert.equal(onboardConfig("nursery").headLabel, "Head Teacher / Directrice");
  assert.equal(onboardConfig("primary").nameLabel, "Full Primary School Name");
});

test("higher institutions get no made-up motto or description", () => {
  assert.equal(onboardConfig("higher").defaults.motto, "");
  assert.equal(onboardConfig("higher").defaults.description, "");
  assert.notEqual(onboardConfig("secondary").defaults.description, "");
});

test("unknown levels fall back to secondary", () => {
  assert.equal(normalizeOnboardLevel("nonsense"), "secondary");
  assert.equal(headTitleFor(undefined), "Principal");
});

test("required fields are checked with the level's own wording", () => {
  assert.equal(onboardingProblem("higher", full), null);
  assert.match(onboardingProblem("higher", { ...full, principal: " " }) ?? "", /head of institution/);
  assert.match(onboardingProblem("secondary", { ...full, principal: "" }) ?? "", /principal/);
  assert.match(onboardingProblem("basic", { ...full, email: "" }) ?? "", /head teacher/);
  assert.match(onboardingProblem("higher", { ...full, cityVillage: " " }) ?? "", /city\/town/);
});

test("levels map to the API payload", () => {
  assert.deepEqual(payloadForLevel("nursery"), { education_category: "basic", basic_section: "nursery" });
  assert.deepEqual(payloadForLevel("primary"), { education_category: "basic", basic_section: "primary" });
  assert.deepEqual(payloadForLevel("secondary"), { education_category: "secondary" });
  assert.deepEqual(payloadForLevel("higher"), { education_category: "higher" });
  assert.deepEqual(payloadForLevel("garbage"), { education_category: "secondary" });
});
