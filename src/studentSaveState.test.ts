import { describe, it, expect } from "vitest";
import { deriveSaveState, saveStateLabel, saveStateHint, canManualRetry, formatLastSaved, shouldWarnBeforeUnload } from "./studentSaveState";

// Roadmap #10/#11 — pure save-state model. Exhaustive, deterministic unit coverage of the derivation,
// precedence, server-time formatting, and the beforeunload predicate.
const base = { localRevision: 0, savedRevision: 0, saving: false, retrying: false, errorExhausted: false, online: true };

describe("deriveSaveState", () => {
  it("SAVED when the latest local revision is server-confirmed (never merely because online/data exists)", () => {
    expect(deriveSaveState({ ...base, localRevision: 3, savedRevision: 3 })).toBe("saved");
    expect(deriveSaveState({ ...base, localRevision: 2, savedRevision: 5 })).toBe("saved");
    // even with a stale saving/retrying flag, a confirmed revision reads as saved
    expect(deriveSaveState({ ...base, localRevision: 1, savedRevision: 1, saving: true, retrying: true })).toBe("saved");
  });
  it("PENDING when dirty and online with no save in flight", () => {
    expect(deriveSaveState({ ...base, localRevision: 4, savedRevision: 3 })).toBe("pending");
  });
  it("SAVING wins over offline/error/retrying while dirty", () => {
    expect(deriveSaveState({ ...base, localRevision: 4, savedRevision: 3, saving: true, online: false, errorExhausted: true, retrying: true })).toBe("saving");
  });
  it("OFFLINE when dirty and not online (and not actively saving)", () => {
    expect(deriveSaveState({ ...base, localRevision: 4, savedRevision: 3, online: false })).toBe("offline");
    // offline beats a hard error and a scheduled retry
    expect(deriveSaveState({ ...base, localRevision: 4, savedRevision: 3, online: false, errorExhausted: true, retrying: true })).toBe("offline");
  });
  it("ERROR when dirty, online, retries exhausted", () => {
    expect(deriveSaveState({ ...base, localRevision: 4, savedRevision: 3, errorExhausted: true })).toBe("error");
  });
  it("RETRYING when dirty, online, retry scheduled (not yet exhausted)", () => {
    expect(deriveSaveState({ ...base, localRevision: 4, savedRevision: 3, retrying: true })).toBe("retrying");
  });
});

describe("labels / hints / manual-retry", () => {
  it("has a distinct Arabic label per state", () => {
    const kinds = ["saved", "pending", "saving", "retrying", "offline", "error"] as const;
    const labels = kinds.map(saveStateLabel);
    expect(new Set(labels).size).toBe(kinds.length);
    expect(saveStateLabel("saved")).toContain("تم الحفظ");
    expect(saveStateLabel("offline")).toContain("غير متصل");
  });
  it("offers a manual retry only for error/offline", () => {
    expect(canManualRetry("error")).toBe(true);
    expect(canManualRetry("offline")).toBe(true);
    for (const k of ["saved", "pending", "saving", "retrying"] as const) expect(canManualRetry(k)).toBe(false);
  });
  it("shows a keep-page-open hint only for offline/error", () => {
    expect(saveStateHint("offline")).toContain("أبقِ الصفحة مفتوحة");
    expect(saveStateHint("error")).toContain("أبقِ الصفحة مفتوحة");
    expect(saveStateHint("saved")).toBe("");
    expect(saveStateHint("pending")).toBe("");
  });
});

describe("formatLastSaved", () => {
  it("formats a valid ISO time as HH:mm:ss (ASCII, 24h)", () => {
    expect(formatLastSaved("2026-01-01T09:07:05.000Z")).toMatch(/^\d\d:\d\d:\d\d$/);
  });
  it("returns empty for missing/invalid input (never invents a time)", () => {
    expect(formatLastSaved("")).toBe("");
    expect(formatLastSaved(null)).toBe("");
    expect(formatLastSaved(undefined)).toBe("");
    expect(formatLastSaved("not-a-date")).toBe("");
  });
});

describe("shouldWarnBeforeUnload", () => {
  it("warns iff the newest local revision is not yet server-confirmed", () => {
    expect(shouldWarnBeforeUnload(5, 4)).toBe(true);
    expect(shouldWarnBeforeUnload(4, 4)).toBe(false);
    expect(shouldWarnBeforeUnload(3, 4)).toBe(false);
  });
});
