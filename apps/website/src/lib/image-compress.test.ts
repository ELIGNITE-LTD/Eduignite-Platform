import assert from "node:assert/strict";
import test from "node:test";
import { targetSize } from "./image-compress";

test("a small picture is left alone", () => {
  assert.deepEqual(targetSize(400, 300), { width: 400, height: 300, scaled: false });
});

test("a big picture is scaled so the longest edge is 800", () => {
  assert.deepEqual(targetSize(4000, 2000), { width: 800, height: 400, scaled: true });
  assert.deepEqual(targetSize(1000, 3000), { width: 267, height: 800, scaled: true });
});

test("a custom limit and a zero size are handled", () => {
  assert.deepEqual(targetSize(1600, 900, 1200), { width: 1200, height: 675, scaled: true });
  assert.equal(targetSize(0, 0).scaled, false);
});
