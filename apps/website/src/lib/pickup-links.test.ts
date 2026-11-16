import assert from "node:assert/strict";
import test from "node:test";
import { phoneDigits, telHref, whatsappHref } from "./pickup-links";

test("digits only", () => {
  assert.equal(phoneDigits("+237 650-123 456"), "237650123456");
  assert.equal(phoneDigits(null), "");
});

test("tel link", () => {
  assert.equal(telHref("237650123456"), "tel:+237650123456");
  assert.equal(telHref(""), "");
});

test("whatsapp link needs a usable number and encodes the text", () => {
  assert.equal(whatsappHref("237650123456"), "https://wa.me/237650123456");
  assert.equal(whatsappHref("237650123456", "Hello, you can collect Ada"), "https://wa.me/237650123456?text=Hello%2C%20you%20can%20collect%20Ada");
  assert.equal(whatsappHref("123"), "");
});
