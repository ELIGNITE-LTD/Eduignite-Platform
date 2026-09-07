import { describe, expect, it } from "vitest";
import { compareSemver } from "../compare-semver";

describe("compareSemver", () => {
  it("treats equal versions as equal", () => {
    expect(compareSemver("1.2.3", "1.2.3")).toBe(0);
  });

  it("compares numerically, not lexically", () => {
    // The classic string-comparison bug: "1.0.9" < "1.0.10" as strings is
    // false, but numerically 9 < 10 is true.
    expect(compareSemver("1.0.9", "1.0.10")).toBe(-1);
    expect(compareSemver("1.0.10", "1.0.9")).toBe(1);
    expect(compareSemver("1.9.0", "1.10.0")).toBe(-1);
    expect(compareSemver("2.0.0", "10.0.0")).toBe(-1);
  });

  it("compares major, then minor, then patch in order", () => {
    expect(compareSemver("2.0.0", "1.9.9")).toBe(1);
    expect(compareSemver("1.3.0", "1.2.9")).toBe(1);
    expect(compareSemver("1.2.4", "1.2.3")).toBe(1);
  });

  it("tolerates a leading 'v'", () => {
    expect(compareSemver("v1.2.3", "1.2.3")).toBe(0);
  });

  it("defaults missing segments to 0", () => {
    expect(compareSemver("1.2", "1.2.0")).toBe(0);
    expect(compareSemver("1", "1.0.0")).toBe(0);
    expect(compareSemver("1.3", "1.2.9")).toBe(1);
  });

  it("gives a pre-release version lower precedence than the plain release", () => {
    expect(compareSemver("1.2.0-beta", "1.2.0")).toBe(-1);
    expect(compareSemver("1.2.0", "1.2.0-beta")).toBe(1);
  });

  it("compares pre-release identifiers per semver precedence rules", () => {
    expect(compareSemver("1.2.0-alpha", "1.2.0-beta")).toBe(-1);
    expect(compareSemver("1.2.0-alpha.1", "1.2.0-alpha.2")).toBe(-1);
    expect(compareSemver("1.2.0-alpha.2", "1.2.0-alpha.10")).toBe(-1);
    expect(compareSemver("1.2.0-alpha", "1.2.0-alpha.1")).toBe(-1);
  });

  it("never throws on malformed input", () => {
    expect(() => compareSemver("", "")).not.toThrow();
    expect(() => compareSemver("not-a-version", "1.2.3")).not.toThrow();
    expect(compareSemver("", "")).toBe(0);
  });
});
