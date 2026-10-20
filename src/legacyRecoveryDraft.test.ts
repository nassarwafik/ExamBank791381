// @vitest-environment happy-dom
// Batch 4 (D2) — legacyRecoveryDraft: per-teacher keys, no access without a teacher, storage failures never throw.
import { describe, it, expect } from "vitest";
import { recoveryDraftKey, readRecoveryDraft, writeRecoveryDraft, removeRecoveryDraft, hasRecoveryDraft } from "./legacyRecoveryDraft";

describe("D2 — legacyRecoveryDraft", () => {
  it("keys are per teacher; nothing is read or written without a teacher; storage failures never throw", () => {
    expect(recoveryDraftKey("a")).not.toBe(recoveryDraftKey("b"));
    expect(recoveryDraftKey("")).toBe("");
    expect(writeRecoveryDraft("", "x")).toBe(false);
    expect(readRecoveryDraft(null)).toBeNull();
    expect(writeRecoveryDraft("a", "x")).toBe(true);
    expect(hasRecoveryDraft("a")).toBe(true);
    expect(hasRecoveryDraft("b")).toBe(false);
    removeRecoveryDraft("a");
    expect(hasRecoveryDraft("a")).toBe(false);
    const real = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", { configurable: true, get: () => { throw new Error("blocked"); } });
    try {
      expect(writeRecoveryDraft("a", "x")).toBe(false);
      expect(readRecoveryDraft("a")).toBeNull();
      expect(() => removeRecoveryDraft("a")).not.toThrow();
    } finally { if (real) Object.defineProperty(window, "localStorage", real); }
  });
});
