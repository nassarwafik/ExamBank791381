import { describe, it, expect } from "vitest";
import { medalTier } from "./medals";

describe("medalTier", () => {
  it("awards gold at 90% and above", () => {
    expect(medalTier(90)).toBe("gold");
    expect(medalTier(100)).toBe("gold");
  });

  it("awards silver from 80% up to (not including) 90%", () => {
    expect(medalTier(80)).toBe("silver");
    expect(medalTier(89.9)).toBe("silver");
  });

  it("awards bronze from 70% up to (not including) 80%", () => {
    expect(medalTier(70)).toBe("bronze");
    expect(medalTier(79.9)).toBe("bronze");
  });

  it("awards no medal below 70%", () => {
    expect(medalTier(69.9)).toBeNull();
    expect(medalTier(0)).toBeNull();
  });
});
