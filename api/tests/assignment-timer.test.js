import { describe, it, expect } from "vitest";
import {
  normalizeDurationMinutes, isTimedAssignment, timerState, startRejection, writeRejection
} from "../src/lib/assignment-availability.js";

const NOW = 1_700_000_000_000;
const iso = ms => new Date(ms).toISOString();
const MIN = 60_000;
const timed = (extra = {}) => ({ status: "published", maxAttempts: 1, durationMinutes: 60, ...extra });
// An active attempt started at `startMs`, duration 60 min => endsAt = startMs + 60min.
const activeSub = (startMs, extra = {}) => ({ activeAttempt: { attemptNumber: 1, startedAt: iso(startMs), endsAt: iso(startMs + 60 * MIN) }, attempts: [], draftAnswers: {}, ...extra });

describe("normalizeDurationMinutes / isTimedAssignment", () => {
  it("null/0/invalid/<1 => 0 (untimed); positive integer => itself", () => {
    for (const v of [null, undefined, 0, "", -5, 0.5, NaN, "abc"]) expect(normalizeDurationMinutes(v)).toBe(0);
    expect(normalizeDurationMinutes(60)).toBe(60);
    expect(normalizeDurationMinutes("90")).toBe(90);
    expect(normalizeDurationMinutes(90.9)).toBe(90); // floored
    expect(isTimedAssignment({ durationMinutes: 60 })).toBe(true);
    expect(isTimedAssignment({ durationMinutes: 0 })).toBe(false);
    expect(isTimedAssignment({})).toBe(false);
  });
});

describe("timerState — effective end, boundary, expiry", () => {
  it("no due date: effective end = duration deadline; boundary now===end is valid, after is expired", () => {
    const a = timed({ dueAt: "" });
    const s = activeSub(NOW);
    const endMs = NOW + 60 * MIN;
    expect(timerState(a, s, NOW).effectiveAttemptEndsAt).toBe(iso(endMs));
    expect(timerState(a, s, NOW).attemptExpired).toBe(false);
    expect(timerState(a, s, endMs).attemptExpired).toBe(false);       // now === end => still valid
    expect(timerState(a, s, endMs).canWrite).toBe(true);
    expect(timerState(a, s, endMs + 1).attemptExpired).toBe(true);    // strictly after => expired
    expect(timerState(a, s, endMs + 1).canWrite).toBe(false);
  });

  it("REQUIRED (#33) DUE CLIPS DURATION: start 10:00 dur 60, due 10:30 => effective end 10:30", () => {
    const a = timed({ dueAt: iso(NOW + 30 * MIN) });   // due before duration deadline
    const s = activeSub(NOW);                            // duration deadline NOW+60
    expect(timerState(a, s, NOW).effectiveAttemptEndsAt).toBe(iso(NOW + 30 * MIN));
    expect(timerState(a, s, NOW + 30 * MIN + 1).attemptExpired).toBe(true);
  });

  it("REQUIRED (#34) DUE OVERRIDE never beyond duration: dur 60, due 10:30, override 11:30 => 11:00", () => {
    const a = timed({ dueAt: iso(NOW + 30 * MIN) });
    const s = activeSub(NOW, { dueAtOverride: iso(NOW + 90 * MIN) }); // override extends past duration
    // min(duration deadline NOW+60, override NOW+90) = NOW+60 (the duration deadline), NOT NOW+90.
    expect(timerState(a, s, NOW).effectiveAttemptEndsAt).toBe(iso(NOW + 60 * MIN));
  });

  it("no active attempt (timed): canStartAttempt true, canWrite false, attemptExpired false", () => {
    const a = timed({ dueAt: iso(NOW + 10 * 60 * MIN) });
    const st = timerState(a, { attempts: [], draftAnswers: {} }, NOW);
    expect(st.timed).toBe(true);
    expect(st.activeAttempt).toBeNull();
    expect(st.canStartAttempt).toBe(true);
    expect(st.canWrite).toBe(false);
    expect(st.attemptExpired).toBe(false);
  });

  it("untimed assignment: canWrite === canAttempt, no active-attempt requirement", () => {
    const a = { status: "published", maxAttempts: 1, dueAt: iso(NOW + 10 * 60 * MIN) };
    const st = timerState(a, { attempts: [], draftAnswers: {} }, NOW);
    expect(st.timed).toBe(false);
    expect(st.canWrite).toBe(true);
    expect(st.canStartAttempt).toBe(false);
  });
});

describe("startRejection", () => {
  const openFar = { dueAt: iso(NOW + 10 * 60 * MIN) };
  it("untimed LEGACY (no attemptModelVersion) => 400 (start not applicable)", () => {
    expect(startRejection({ status: "published", maxAttempts: 1, ...openFar }, null, NOW)).toEqual({ status: 400, error: "لا يتطلب هذا الواجب بدء محاولة." });
  });
  it("timed, open, attempts remain, no active => null (allowed)", () => {
    expect(startRejection(timed(openFar), { attempts: [] }, NOW)).toBeNull();
  });
  it("REQUIRED (#32 helper) live active attempt => null (idempotent, no restart)", () => {
    expect(startRejection(timed(openFar), activeSub(NOW), NOW + 20 * MIN)).toBeNull();
  });
  it("expired active attempt => 409 (must finalize first)", () => {
    expect(startRejection(timed({ dueAt: iso(NOW + 10 * 60 * MIN) }), activeSub(NOW), NOW + 61 * MIN)).toEqual({ status: 409, error: "انتهى وقت المحاولة." });
  });
  it("attempts exhausted, no active => 409", () => {
    const s = { attempts: [{ attemptNumber: 1 }] }; // maxAttempts 1
    expect(startRejection(timed(openFar), s, NOW)).toEqual({ status: 409, error: "لا توجد محاولة إضافية متاحة." });
  });
  it("scheduled => 403; closed => 409", () => {
    expect(startRejection(timed({ openAt: iso(NOW + MIN), dueAt: iso(NOW + 10 * 60 * MIN) }), null, NOW)).toEqual({ status: 403, error: "الواجب لم يُفتح بعد." });
    expect(startRejection(timed({ dueAt: iso(NOW - MIN) }), null, NOW)).toEqual({ status: 409, error: "انتهى موعد التسليم." });
  });
});

describe("writeRejection", () => {
  const openFar = { dueAt: iso(NOW + 10 * 60 * MIN) };
  it("REQUIRED (#35) timed with no active attempt => 409 ابدأ المحاولة أولاً.", () => {
    expect(writeRejection(timed(openFar), { attempts: [] }, "saveDraft", NOW)).toEqual({ status: 409, error: "ابدأ المحاولة أولاً." });
    expect(writeRejection(timed(openFar), { attempts: [] }, "submit", NOW)).toEqual({ status: 409, error: "ابدأ المحاولة أولاً." });
  });
  it("timed with a live active attempt => null (writable)", () => {
    expect(writeRejection(timed(openFar), activeSub(NOW), "saveDraft", NOW + 10 * MIN)).toBeNull();
  });
  it("timed expired active attempt => 409 انتهى وقت المحاولة.", () => {
    expect(writeRejection(timed(openFar), activeSub(NOW), "submit", NOW + 61 * MIN)).toEqual({ status: 409, error: "انتهى وقت المحاولة." });
  });
  it("untimed preserves actionRejection (attempts exhausted => 409)", () => {
    const a = { status: "published", maxAttempts: 1, ...openFar };
    expect(writeRejection(a, { attempts: [{ attemptNumber: 1 }] }, "submit", NOW)).toEqual({ status: 409, error: "لا توجد محاولة إضافية متاحة." });
    expect(writeRejection(a, { attempts: [] }, "saveDraft", NOW)).toBeNull();
  });
});
