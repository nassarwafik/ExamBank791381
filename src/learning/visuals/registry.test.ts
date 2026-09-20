// SVG visual-enrichment REGISTRY — exact-allowlist resolution and pilot scope.
import { describe, it, expect } from "vitest";
import { resolveVisual, REGISTERED_VISUAL_IDS } from "./registry";

describe("visuals registry", () => {
  it("enumerates exactly the Chapter 1 pilot visuals (stable, namespaced ids)", () => {
    expect(REGISTERED_VISUAL_IDS).toEqual([
      "791381/ch1/network-connected-devices",
      "791381/ch1/network-uses-map",
      "791381/ch1/shared-printer",
      "791381/ch1/network-building-blocks",
      "791381/ch1/network-management-cycle",
    ]);
    expect(REGISTERED_VISUAL_IDS.length).toBe(5);
  });

  it("every id is course/chapter namespaced (reusable pattern for later chapters)", () => {
    for (const id of REGISTERED_VISUAL_IDS) expect(id).toMatch(/^791381\/ch1\/[a-z0-9-]+$/);
  });

  it("resolves each registered id to a component with a motion flag", () => {
    for (const id of REGISTERED_VISUAL_IDS) {
      const entry = resolveVisual(id);
      expect(entry).not.toBeNull();
      expect(typeof entry!.component).toBe("function");
      expect(typeof entry!.motion).toBe("boolean");
    }
  });

  it("returns null (never throws, never guesses) for an unknown or non-string key", () => {
    expect(resolveVisual("791381/ch1/does-not-exist")).toBeNull();
    expect(resolveVisual("")).toBeNull();
    expect(resolveVisual(undefined as unknown as string)).toBeNull();
    expect(resolveVisual({ toString: () => "791381/ch1/shared-printer" } as unknown as string)).toBeNull();
  });

  it("has no duplicate ids", () => {
    expect(new Set(REGISTERED_VISUAL_IDS).size).toBe(REGISTERED_VISUAL_IDS.length);
  });
});
