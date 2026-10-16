import { describe, it, expect } from "vitest";
import { assignment, user, NOW } from "./fixtures/analytics-school.js";
import { deriveTeacherToday, LIVE_WINDOW_MS } from "../src/functions/teacher-today.js";

// Phase 21H.0 — «محاولات نشطة الآن» means a student is working NOW: an open attempt whose last activity (its last autosave,
// else its start) is within LIVE_WINDOW_MS. An open attempt left for longer, or one the teacher paused, is reported
// separately as stale — it is still open (nothing is closed or graded here), it is just not «now».
const NOW_MS = Date.parse(NOW), MIN = 60e3, W = 15 * MIN, iso = ms => new Date(ms).toISOString();
const live = (startedMs, extra = {}) => ({ attemptNumber: 1, startedAt: iso(startedMs), endsAt: "", status: "started", ...extra });
function derive(subs) {
  return deriveTeacherToday({
    assignments: [assignment("A1", "c1", "published", NOW, { dueAt: "2026-03-20T10:00:00.000Z" })],
    classes: [{ classId: "c1", name: "صف 1", status: "active" }],
    users: ["s01", "s02", "s03", "s04", "s05"].map(id => user(id, "c1")),
    submissionsByAssignment: new Map([["A1", new Map(Object.entries(subs).map(([sid, act]) => [sid, { assignmentId: "A1", studentId: sid, attempts: [], activeAttempt: act }]))]]),
    nowMs: NOW_MS
  });
}

describe("21H.0 teacher-today — active now vs stale attempts", () => {
  it("splits open attempts by their last activity; the window boundary is inclusive", () => {
    const d = derive({
      s01: live(NOW_MS - 5 * MIN),                                                                   // started 5 min ago → now
      s02: live(NOW_MS - 3 * 864e5, { status: "draft", lastSavedAt: iso(NOW_MS - 2 * MIN) }),          // old start, saved 2 min ago → now
      s03: live(NOW_MS - 6 * 864e5, { status: "draft", lastSavedAt: iso(NOW_MS - 6 * 864e5 + 10 * MIN) }), // left 6 days ago → stale
      s04: live(NOW_MS - W),                                                           // exactly at the window → now
      s05: live(NOW_MS - W - 1000)                                                     // just past → stale
    });
    expect(LIVE_WINDOW_MS).toBe(W);
    expect(d.attention.activeAttempts.items.map(i => i.studentId)).toEqual(["s02", "s01", "s04"]);   // most recent activity first
    expect(d.attention.activeAttempts.count).toBe(3);
    expect(d.attention.staleAttempts.items.map(i => i.studentId)).toEqual(["s05", "s03"]);
    expect(d.attention.staleAttempts.count).toBe(2);
    expect(d.attention.staleAttempts.items[1]).toMatchObject({ lastActivityAt: iso(NOW_MS - 6 * 864e5 + 10 * MIN), status: "draft" });
  });

  it("a paused attempt is stale even when it was active a minute ago; an unreadable start is stale, never «now»", () => {
    const d = derive({
      s01: live(NOW_MS - MIN, { status: "paused", pausedAt: iso(NOW_MS - 30 * 1000) }),
      s02: { attemptNumber: 1, startedAt: "garbage", endsAt: "", status: "started" }
    });
    expect(d.attention.activeAttempts.count).toBe(0);
    expect(d.attention.staleAttempts.items.map(i => [i.studentId, i.status])).toEqual([["s01", "paused"], ["s02", "started"]]);
    expect(d.attention.staleAttempts.items[1].lastActivityAt).toBe("");
  });

  it("stale attempts never count as not-started and never change the pending-review figure", () => {
    const d = derive({ s01: live(NOW_MS - 9 * 864e5) });
    expect(d.attention.staleAttempts.count).toBe(1);
    expect(d.attention.notStarted.items[0]).toMatchObject({ notStarted: 4, expected: 5 });
    expect(d.attention.pendingReview.count).toBe(0);
  });
});
