import { describe, it, expect } from "vitest";
import { shouldUpgradeSnapshot } from "./service.js";
import { getSnapshotUpgradePolicy } from "./registry.js";

describe("shouldUpgradeSnapshot (794589 version-aware upgrade decision)", () => {
  const CUR = 2;
  it("old snapshot + active + NO meaningful progress -> upgrade", () => {
    expect(shouldUpgradeSnapshot({ templateVersion: 1 }, true, CUR, false)).toBe(true);
  });
  it("old snapshot + meaningful progress -> untouched", () => {
    expect(shouldUpgradeSnapshot({ templateVersion: 1 }, true, CUR, true)).toBe(false);
  });
  it("archived (not active) old snapshot -> untouched", () => {
    expect(shouldUpgradeSnapshot({ templateVersion: 1 }, false, CUR, false)).toBe(false);
  });
  it("already-current snapshot -> untouched", () => {
    expect(shouldUpgradeSnapshot({ templateVersion: 2 }, true, CUR, false)).toBe(false);
    expect(shouldUpgradeSnapshot({ templateVersion: 3 }, true, CUR, false)).toBe(false);
  });
  it("no existing snapshot -> not an upgrade (handled by the create path)", () => {
    expect(shouldUpgradeSnapshot(null, true, CUR, false)).toBe(false);
  });
});

describe("getSnapshotUpgradePolicy", () => {
  it("794589 declares an upgrade policy at the current template version", () => {
    const p = getSnapshotUpgradePolicy("794589");
    expect(p).toBeTruthy();
    expect(p.currentVersion).toBe(2);
    expect(typeof p.buildUpgraded).toBe("function");
  });
  it("899373 and 883589 declare NO policy (no migration)", () => {
    expect(getSnapshotUpgradePolicy("899373")).toBe(null);
    expect(getSnapshotUpgradePolicy("883589")).toBe(null);
  });
});
