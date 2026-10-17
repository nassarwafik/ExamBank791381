import { describe, it, expect } from "vitest";
import { assignment, user, NOW } from "./fixtures/analytics-school.js";
import { deriveTeacherToday } from "../src/functions/teacher-today.js";

// Phase 21H.3 — three more things the teacher acts on, derived from the documents the hub already reads:
//   dueSoon            open assignments whose deadline falls within 48 hours (with how many members have not submitted);
//   resultsUnreleased  «manual» results-release assignments (the 21G.5 authority) with submissions not yet published;
//   openingSoon        published assignments opening within the next 24 hours.
const NOW_MS = Date.parse(NOW), H = 3600e3, iso = ms => new Date(ms).toISOString();
const done = { attemptNumber: 1, submittedAt: iso(NOW_MS - H), score: 5, totalMarks: 10, percentage: 50, finalized: true };
function derive(assignments, subs = {}) {
  return deriveTeacherToday({
    assignments,
    classes: [{ classId: "c1", name: "صف 1", status: "active" }],
    users: ["s01", "s02", "s03"].map(id => user(id, "c1")),
    submissionsByAssignment: new Map(assignments.map(a => [a.assignmentId, new Map(Object.entries(subs[a.assignmentId] || {}).map(([sid, attempts]) => [sid, { assignmentId: a.assignmentId, studentId: sid, attempts, activeAttempt: null }]))])),
    nowMs: NOW_MS
  });
}
const A = (id, extra) => assignment(id, "c1", "published", NOW, { openAt: iso(NOW_MS - 24 * H), ...extra });

describe("21H.3 teacher-today — due soon, results to publish, opening soon", () => {
  it("dueSoon: deadline within 48 h and still open, nearest first, with the not-submitted count; later or past deadlines are not listed", () => {
    const d = derive([A("D1", { dueAt: iso(NOW_MS + 40 * H) }), A("D2", { dueAt: iso(NOW_MS + 5 * H) }), A("D3", { dueAt: iso(NOW_MS + 49 * H) }), A("D4", { dueAt: iso(NOW_MS - H) }), A("D5", { dueAt: iso(NOW_MS + 48 * H) })], { D2: { s01: [done] } });
    expect(d.attention.dueSoon.items.map(i => [i.assignmentId, i.notSubmitted, i.expected])).toEqual([["D2", 2, 3], ["D1", 3, 3], ["D5", 3, 3]]);
    expect(d.attention.dueSoon.count).toBe(3);
    expect(d.attention.openingSoon.count).toBe(0);                                        // all of them opened yesterday
  });

  it("resultsUnreleased: manual + not yet released + at least one submission; released, afterDue, immediate or empty ones are not", () => {
    const d = derive([
      A("R1", { dueAt: iso(NOW_MS + 99 * H), resultsRelease: "manual" }),
      A("R2", { dueAt: iso(NOW_MS + 99 * H), resultsRelease: "manual", resultsReleasedAt: iso(NOW_MS - H) }),
      A("R3", { dueAt: iso(NOW_MS + 99 * H), resultsRelease: "afterDue" }),
      A("R4", { dueAt: iso(NOW_MS + 99 * H) }),
      A("R5", { dueAt: iso(NOW_MS + 99 * H), resultsRelease: "manual" })
    ], { R1: { s01: [done], s02: [done] }, R2: { s01: [done] }, R3: { s01: [done] }, R4: { s01: [done] } });
    expect(d.attention.resultsUnreleased.items.map(i => [i.assignmentId, i.submitted])).toEqual([["R1", 2]]);
    expect(d.attention.resultsUnreleased.count).toBe(1);
  });

  it("an unreadable release mode is not «the teacher's step»: only «manual» is listed (the 21G.5 authority already withholds such results)", () => {
    const d = derive([A("X1", { dueAt: iso(NOW_MS + 99 * H), resultsRelease: "weird" })], { X1: { s01: [done] } });
    expect(d.attention.resultsUnreleased.count).toBe(0);                                   // only «manual» is the teacher's step
  });

  it("openingSoon: opens within 24 h (not already open, not later); nobody counts as not-started before it opens", () => {
    const d = derive([assignment("O1", "c1", "published", NOW, { openAt: iso(NOW_MS + 3 * H), dueAt: iso(NOW_MS + 99 * H) }), assignment("O2", "c1", "published", NOW, { openAt: iso(NOW_MS + 30 * H), dueAt: iso(NOW_MS + 99 * H) })]);
    expect(d.attention.openingSoon.items.map(i => [i.assignmentId, i.openAt, i.expected])).toEqual([["O1", iso(NOW_MS + 3 * H), 3]]);
    expect(d.attention.notStarted.count).toBe(0);
    expect(d.attention.dueSoon.count).toBe(0);
  });
});
