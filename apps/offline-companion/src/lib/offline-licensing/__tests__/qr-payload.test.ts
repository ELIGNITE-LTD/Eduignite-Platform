import { describe, expect, it } from "vitest";
import {
  checkChallengeSchoolMatch,
  isChallengeExpired,
  parseChallengeQrPayload,
  validateChallengeShape,
} from "../qr-payload";
import type { OfflineLicensingChallenge } from "../types";

function validChallenge(overrides: Partial<OfflineLicensingChallenge> = {}): OfflineLicensingChallenge {
  return {
    challengeId: "11111111-1111-1111-1111-111111111111",
    schoolId: "SCH-00125",
    deviceId: "HW-F398-84D2",
    purpose: "activation",
    nonce: "abcdef0123456789",
    createdAt: "2026-09-01T00:00:00Z",
    expiresAt: "2026-09-01T00:05:00Z",
    ...overrides,
  };
}

describe("parseChallengeQrPayload", () => {
  it("parses a valid activation challenge", () => {
    const result = parseChallengeQrPayload(JSON.stringify(validChallenge()));
    expect(result.ok).toBe(true);
  });

  it("rejects non-JSON input without throwing", () => {
    const result = parseChallengeQrPayload("not json at all");
    expect(result.ok).toBe(false);
  });

  it("rejects empty input", () => {
    expect(parseChallengeQrPayload("").ok).toBe(false);
  });

  it("rejects a payload missing required fields", () => {
    const { challengeId, ...rest } = validChallenge();
    const result = parseChallengeQrPayload(JSON.stringify(rest));
    expect(result.ok).toBe(false);
  });

  it("rejects an unrecognized purpose", () => {
    const result = parseChallengeQrPayload(JSON.stringify(validChallenge({ purpose: "hack" as never })));
    expect(result.ok).toBe(false);
  });

  it("requires previousDeviceId for device_replacement", () => {
    const result = parseChallengeQrPayload(
      JSON.stringify(validChallenge({ purpose: "device_replacement" }))
    );
    expect(result.ok).toBe(false);
  });

  it("accepts device_replacement when previousDeviceId is present", () => {
    const result = parseChallengeQrPayload(
      JSON.stringify(validChallenge({ purpose: "device_replacement", previousDeviceId: "HW-OLD1-2222" }))
    );
    expect(result.ok).toBe(true);
  });

  it("rejects invalid date fields", () => {
    const result = parseChallengeQrPayload(JSON.stringify(validChallenge({ expiresAt: "not-a-date" })));
    expect(result.ok).toBe(false);
  });
});

describe("validateChallengeShape", () => {
  it("rejects non-object input", () => {
    expect(validateChallengeShape("a string").ok).toBe(false);
    expect(validateChallengeShape(null).ok).toBe(false);
    expect(validateChallengeShape([1, 2, 3]).ok).toBe(false);
  });
});

describe("isChallengeExpired", () => {
  it("is false before expiry", () => {
    const challenge = validChallenge({ expiresAt: "2026-09-01T00:05:00Z" });
    expect(isChallengeExpired(challenge, new Date("2026-09-01T00:01:00Z"))).toBe(false);
  });

  it("is true after expiry", () => {
    const challenge = validChallenge({ expiresAt: "2026-09-01T00:05:00Z" });
    expect(isChallengeExpired(challenge, new Date("2026-09-01T00:06:00Z"))).toBe(true);
  });

  it("treats an unparsable expiry as already expired", () => {
    const challenge = validChallenge({ expiresAt: "garbage" });
    expect(isChallengeExpired(challenge)).toBe(true);
  });
});

describe("checkChallengeSchoolMatch", () => {
  it("matches when the technician's school equals the challenge's school", () => {
    const result = checkChallengeSchoolMatch(validChallenge({ schoolId: "SCH-1" }), "SCH-1");
    expect(result.matches).toBe(true);
  });

  it("does not match a different school", () => {
    const result = checkChallengeSchoolMatch(validChallenge({ schoolId: "SCH-1" }), "SCH-2");
    expect(result.matches).toBe(false);
  });

  it("does not match when the technician has no school on their account", () => {
    const result = checkChallengeSchoolMatch(validChallenge({ schoolId: "SCH-1" }), null);
    expect(result.matches).toBe(false);
  });
});
