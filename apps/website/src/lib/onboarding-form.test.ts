import assert from "node:assert/strict";
import test from "node:test";
import { headTitleFor, ONBOARD_LEVELS, onboardConfig, onboardingProblem, normalizeOnboardLevel } from "./onboarding-form";

const full = { name: "Univ", shortName: "UB", principal: "Prof. A", email: "a@b.cm", cityVillage: "Buea" };

test("the three levels are offered, higher last", () => {
  assert.deepEqual(ONBOARD_LEVELS.map((l) => l.value), ["basic", "secondary", "higher"]);
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
  assert.equal(headTitleFor("basic"), "Head Teacher");
  assert.equal(onboardConfig("basic").showSchoolType, false);
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
