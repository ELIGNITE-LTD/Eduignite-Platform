import assert from "node:assert/strict";
import test from "node:test";
import { deriveBasicKind } from "./basic-kind";
import { arrangeBasicMenu, basicMenuFor, hiddenForKind } from "./basic-menu";

test("deriveBasicKind reads category and sections", () => {
  assert.equal(deriveBasicKind("secondary", ["nursery"]), null);
  assert.equal(deriveBasicKind("higher", []), null);
  assert.equal(deriveBasicKind("basic", ["nursery"]), "nursery");
  assert.equal(deriveBasicKind("basic", ["primary"]), "primary");
  assert.equal(deriveBasicKind("basic", ["nursery", "primary"]), "basic");
  assert.equal(deriveBasicKind("basic", []), "basic");
  assert.equal(deriveBasicKind("basic", undefined), "basic");
  assert.equal(deriveBasicKind("basic", ["junk"]), "basic");
});

const all = [
  "/dashboard", "/dashboard/students", "/dashboard/hierarchy", "/dashboard/attendance", "/dashboard/grades",
  "/dashboard/grades/nursery", "/dashboard/class-marks", "/dashboard/conduct", "/dashboard/academics/promotions",
  "/dashboard/certificates", "/dashboard/health-records", "/dashboard/fees", "/dashboard/chat", "/dashboard/staff",
  "/dashboard/id-cards", "/dashboard/school-website", "/dashboard/settings", "/dashboard/profile", "/dashboard/announcements",
].map((href) => ({ href, label: href }));

test("nursery admin gets the simple menu without marks", () => {
  const hrefs = arrangeBasicMenu(all, "SCHOOL_ADMIN", "nursery", "en").map((r) => r.href);
  for (const gone of ["/dashboard/grades", "/dashboard/class-marks", "/dashboard/conduct", "/dashboard/academics/promotions", "/dashboard/certificates"]) {
    assert.ok(!hrefs.includes(gone), gone);
  }
  for (const kept of ["/dashboard/students", "/dashboard/grades/nursery", "/dashboard/health-records", "/dashboard/id-cards", "/dashboard/fees"]) {
    assert.ok(hrefs.includes(kept), kept);
  }
  assert.equal(arrangeBasicMenu(all, "SUB_ADMIN", "nursery", "en").find((r) => r.href === "/dashboard/students")?.label, "Children");
  assert.equal(arrangeBasicMenu(all, "SCHOOL_ADMIN", "nursery", "fr").find((r) => r.href === "/dashboard/students")?.label, "Enfants");
});

test("nursery teacher gets five tabs plus profile", () => {
  const hrefs = arrangeBasicMenu(all, "TEACHER", "nursery", "en").map((r) => r.href);
  assert.deepEqual(hrefs, ["/dashboard", "/dashboard/attendance", "/dashboard/grades/nursery", "/dashboard/health-records", "/dashboard/chat", "/dashboard/profile"]);
});

test("primary hides nursery ratings, legacy keeps today's menu", () => {
  assert.equal(hiddenForKind("/dashboard/grades/nursery", "primary"), true);
  assert.equal(hiddenForKind("/dashboard/grades/nursery", "basic"), false);
  assert.equal(hiddenForKind("/dashboard/grades/nursery", "nursery"), false);
  assert.ok(basicMenuFor("basic", "SCHOOL_ADMIN")?.some(([h]) => h === "/dashboard/grades"));
  assert.equal(basicMenuFor("basic", "TEACHER"), null);
  assert.equal(basicMenuFor(null, "SCHOOL_ADMIN"), null);
});
