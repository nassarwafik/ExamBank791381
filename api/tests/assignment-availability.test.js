import { describe, it, expect } from "vitest";
import { getAssignmentAvailability, effectiveDueAt, attemptState, actionRejection } from "../src/lib/assignment-availability.js";

const NOW = 1_700_000_000_000;
const iso = ms => new Date(ms).toISOString();
const pub = (extra = {}) => ({ status: "published", maxAttempts: 1, ...extra });

describe("getAssignmentAvailability — boundary semantics (deterministic nowMs)", () => {
  it("A: no openAt, no dueAt => open", () => {
    expect(getAssignmentAvailability(pub(), null, NOW).availability).toBe("open");
  });
  it("B: now < openAt => scheduled", () => {
    expect(getAssignmentAvailability(pub({ openAt: iso(NOW + 1000) }), null, NOW).availability).toBe("scheduled");
  });
  it("C: now === openAt => open (boundary is open)", () => {
    expect(getAssignmentAvailability(pub({ openAt: iso(NOW) }), null, NOW).availability).toBe("open");
  });
  it("D: openAt < now < dueAt => open", () => {
    expect(getAssignmentAvailability(pub({ openAt: iso(NOW - 1000), dueAt: iso(NOW + 1000) }), null, NOW).availability).toBe("open");
  });
  it("E: now === dueAt => open (preserve current semantics)", () => {
    expect(getAssignmentAvailability(pub({ dueAt: iso(NOW) }), null, NOW).availability).toBe("open");
  });
  it("F: now > dueAt => closed", () => {
    expect(getAssignmentAvailability(pub({ dueAt: iso(NOW - 1000) }), null, NOW).availability).toBe("closed");
  });
  it("G: dueAtOverride EXTENDS a past due date => open until the override expires", () => {
    const a = pub({ dueAt: iso(NOW - 1000) }); // would be closed
    const s = { dueAtOverride: iso(NOW + 1000) };
    expect(getAssignmentAvailability(a, s, NOW).availability).toBe("open");
    expect(getAssignmentAvailability(a, s, NOW + 2000).availability).toBe("closed"); // override expired
    expect(effectiveDueAt(a, s)).toBe(iso(NOW + 1000));
  });
  it("H: dueAtOverride SHORTENS a future due date => closed per override", () => {
    const a = pub({ dueAt: iso(NOW + 1000) }); // would be open
    const s = { dueAtOverride: iso(NOW - 1000) };
    expect(getAssignmentAvailability(a, s, NOW).availability).toBe("closed");
  });
  it("I: invalid / missing optional dates do not crash and default to open", () => {
    expect(getAssignmentAvailability(pub({ openAt: "not-a-date", dueAt: "" }), null, NOW).availability).toBe("open");
    expect(getAssignmentAvailability(pub({ openAt: null, dueAt: undefined }), undefined, NOW).availability).toBe("open");
    expect(getAssignmentAvailability({}, null, NOW).availability).toBe("open"); // no status/dates at all
  });
});

describe("actionRejection — authoritative write gate", () => {
  const open = pub({ openAt: iso(NOW - 1000), dueAt: iso(NOW + 1000) });
  it("open + attempts remaining => allowed (null) for saveDraft and submit", () => {
    expect(actionRejection(open, null, "saveDraft", NOW)).toBeNull();
    expect(actionRejection(open, null, "submit", NOW)).toBeNull();
  });
  it("scheduled => 403 الواجب لم يُفتح بعد. (both actions)", () => {
    const a = pub({ openAt: iso(NOW + 1000) });
    expect(actionRejection(a, null, "saveDraft", NOW)).toEqual({ status: 403, error: "الواجب لم يُفتح بعد." });
    expect(actionRejection(a, null, "submit", NOW)).toEqual({ status: 403, error: "الواجب لم يُفتح بعد." });
  });
  it("closed => 409 انتهى موعد التسليم.", () => {
    const a = pub({ dueAt: iso(NOW - 1000) });
    expect(actionRejection(a, null, "submit", NOW)).toEqual({ status: 409, error: "انتهى موعد التسليم." });
  });
  it("unpublished => 403 الواجب غير متاح.", () => {
    expect(actionRejection({ status: "draft", maxAttempts: 1 }, null, "submit", NOW)).toEqual({ status: 403, error: "الواجب غير متاح." });
  });
  it("attempts exhausted => 409 with action-specific message", () => {
    const s = { attempts: [{ attemptNumber: 1 }] }; // maxAttempts 1
    expect(actionRejection(open, s, "submit", NOW)).toEqual({ status: 409, error: "لا توجد محاولة إضافية متاحة." });
    expect(actionRejection(open, s, "saveDraft", NOW)).toEqual({ status: 409, error: "لا توجد محاولة متاحة للحفظ." });
  });
});

describe("dashboard / submission availability agree (same helper, same inputs)", () => {
  it("scheduled / open / closed match for the same assignment+override", () => {
    for (const [a, s] of [
      [pub({ openAt: iso(NOW + 1000) }), null],
      [pub({ openAt: iso(NOW - 1000), dueAt: iso(NOW + 1000) }), null],
      [pub({ dueAt: iso(NOW - 1000) }), null],
      [pub({ dueAt: iso(NOW - 1000) }), { dueAtOverride: iso(NOW + 1000) }] // override → open on both
    ]) {
      const dashboard = attemptState(a, s, NOW);          // dashboard path
      const submission = attemptState(a, s, NOW);          // submission path (same helper)
      expect(submission.availability).toBe(dashboard.availability);
      expect(submission.effectiveDueAt).toBe(dashboard.effectiveDueAt);
      expect(submission.canAttempt).toBe(dashboard.canAttempt);
    }
  });
});
