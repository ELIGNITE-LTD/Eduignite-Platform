import { describe, expect, it } from "vitest";
import { checkForUpdate, resolveUpdateStatus, APP_KEY } from "../check-for-update";
import type { AppVersionInfo } from "../types";

const info = (overrides: Partial<AppVersionInfo> = {}): AppVersionInfo => ({
  latestVersion: "2.0.0",
  minSupportedVersion: "1.0.0",
  downloadUrl: "https://eduignite.online/downloads/eduignite-companion.apk",
  releaseNotes: "Bug fixes.",
  ...overrides,
});

describe("resolveUpdateStatus", () => {
  it("blocks when current version is below the minimum supported version", () => {
    const result = resolveUpdateStatus("0.9.0", info());
    expect(result.status).toBe("blocked");
  });

  it("offers a dismissible update when current is between min and latest", () => {
    const result = resolveUpdateStatus("1.5.0", info());
    expect(result.status).toBe("update-available");
    expect(result.latestVersion).toBe("2.0.0");
  });

  it("shows no UI when current version is already the latest", () => {
    expect(resolveUpdateStatus("2.0.0", info()).status).toBe("up-to-date");
  });

  it("shows no UI when current version is newer than latest (e.g. a dev build)", () => {
    expect(resolveUpdateStatus("3.0.0", info()).status).toBe("up-to-date");
  });

  it("is boundary-inclusive at exactly the minimum supported version", () => {
    expect(resolveUpdateStatus("1.0.0", info()).status).toBe("update-available");
  });

  it("returns 'unknown' when the app_key is missing (never an error)", () => {
    expect(resolveUpdateStatus("1.0.0", undefined).status).toBe("unknown");
  });

  it("returns 'unknown' on a malformed info object", () => {
    expect(resolveUpdateStatus("1.0.0", {} as AppVersionInfo).status).toBe("unknown");
  });
});

describe("checkForUpdate", () => {
  it("resolves the offline_companion key from the fetched table", async () => {
    const result = await checkForUpdate("1.5.0", async () => ({
      mobile: info({ latestVersion: "9.9.9" }),
      [APP_KEY]: info({ latestVersion: "2.0.0" }),
    }));
    expect(result.status).toBe("update-available");
    expect(result.latestVersion).toBe("2.0.0");
  });

  it("never throws and resolves 'unknown' when the fetch fails", async () => {
    const result = await checkForUpdate("1.5.0", async () => {
      throw new Error("Network Error");
    });
    expect(result.status).toBe("unknown");
    expect(result.currentVersion).toBe("1.5.0");
  });

  it("resolves 'unknown' when the response has no rows at all", async () => {
    const result = await checkForUpdate("1.5.0", async () => ({}));
    expect(result.status).toBe("unknown");
  });
});
