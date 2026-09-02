import { describe, it, expect } from "vitest";
import { resolveSectionFromTopic, isValidBankSection } from "../src/lib/section-resolver.js";

describe("isValidBankSection", () => {
  it("accepts BASIC", () => {
    expect(isValidBankSection("BASIC")).toBe(true);
  });

  it("accepts INFRASTRUCTURE", () => {
    expect(isValidBankSection("INFRASTRUCTURE")).toBe(true);
  });

  it("rejects LEGACY", () => {
    expect(isValidBankSection("LEGACY")).toBe(false);
  });

  it("rejects null", () => {
    expect(isValidBankSection(null)).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isValidBankSection(undefined)).toBe(false);
  });

  it("rejects an arbitrary/random value", () => {
    expect(isValidBankSection("SOMETHING_ELSE")).toBe(false);
    expect(isValidBankSection("")).toBe(false);
    expect(isValidBankSection(123)).toBe(false);
  });
});

describe("resolveSectionFromTopic", () => {
  it("resolves a high-confidence topic to its majority section", () => {
    expect(resolveSectionFromTopic("OSPF")).toMatchObject({ section: "INFRASTRUCTURE" });
    expect(resolveSectionFromTopic("NUMBER_SYSTEMS")).toMatchObject({ section: "BASIC" });
  });

  it("returns null section for a topic that is genuinely mixed below the confidence threshold", () => {
    // DHCP is real bank data: 67 BASIC vs 48 INFRASTRUCTURE (~58% majority) - too close to guess.
    const result = resolveSectionFromTopic("DHCP");
    expect(result.section).toBeNull();
    expect(result.reason).toBe("low-confidence");
  });

  it("returns null section for an unknown topic", () => {
    const result = resolveSectionFromTopic("SOME_MADE_UP_TOPIC");
    expect(result.section).toBeNull();
    expect(result.reason).toBe("unknown-topic");
  });

  it("returns null section for a null/empty topic", () => {
    expect(resolveSectionFromTopic(null).section).toBeNull();
    expect(resolveSectionFromTopic("").section).toBeNull();
  });
});
