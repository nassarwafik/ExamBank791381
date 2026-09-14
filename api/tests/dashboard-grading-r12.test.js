import { describe, it, expect } from "vitest";
import { handler as dashboardHandler } from "../src/functions/student-dashboard.js";

// Roadmap #12 — student dashboard authoritative result summary + dashboardState + stats. All derived from
// the SAME single submission read per assignment (no extra reads).
const NOW = Date.parse("2026-03-01T12:00:00.000Z");
const iso = ms => new Date(ms).toISOString();
const AP = "platform/assignments/", SP = "platform/submissions/";
const student = { userId: "u1", classId: "c1", code: "S1", displayName: "علي", active: true, shareAchievements: true };

function makeDeps(store, counter) {
  return {
    requireActiveStudentSession: async () => ({ ok: true, container: {}, student }),
    downloadJsonOrNull: async (_c, key) => { if (counter && key.startsWith(SP)) counter.sub = (counter.sub || 0) + 1; return store.has(key) ? structuredClone(store.get(key)) : null; },
    listJson: async (_c, prefix) => [...store.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => structuredClone(v))
  };
}
function assignment(id, extra = {}) { return { assignmentId: id, classId: "c1", status: "published", title: id, instructions: "", maxAttempts: 3, durationMinutes: 0, attemptModelVersion: 2, questionCount: 1, totalMarks: 100, openAt: "", dueAt: "", ...extra }; }
const pendingAttempt = { attemptNumber: 1, submittedAt: iso(NOW - 3600000), score: 62, totalMarks: 100, percentage: 62, manualReviewMarks: 18, finalized: false, teacherFeedback: "" };
const finalAttempt = { attemptNumber: 1, submittedAt: iso(NOW - 3600000), score: 84, totalMarks: 100, percentage: 84, manualReviewMarks: 0, finalized: true, teacherFeedback: "ممتاز" };
const req = () => ({ method: "GET", url: "http://x/student-dashboard", headers: { get: () => null } });
const findAsg = (body, id) => body.assignments.find(a => a.assignmentId === id);

describe("R12 dashboard grading/state/stats", () => {
  it("G: a pending result => gradingStatus pendingReview, dashboardState awaitingReview, pendingReview stat, NOT in averageFinalized", async () => {
    const store = new Map();
    store.set(AP + "a1.json", assignment("a1"));
    store.set(SP + "a1/u1.json", { assignmentId: "a1", studentId: "u1", classId: "c1", attempts: [pendingAttempt], activeAttempt: null });
    const r = await dashboardHandler(req(), makeDeps(store));
    expect(r.status).toBe(200);
    const a = findAsg(r.jsonBody, "a1");
    expect(a.latestResult.gradingStatus).toBe("pendingReview");
    expect(a.gradingStatus).toBe("pendingReview");
    expect(a.dashboardState).toBe("awaitingReview");
    expect(r.jsonBody.stats.pendingReview).toBe(1);
    expect(r.jsonBody.stats.finalized).toBe(0);
    expect(r.jsonBody.stats.averageFinalized).toBeNull();               // provisional grade excluded
  });

  it("H: a final result => gradingStatus final, dashboardState completed, finalized stat, included in averageFinalized", async () => {
    const store = new Map();
    store.set(AP + "a1.json", assignment("a1"));
    store.set(SP + "a1/u1.json", { assignmentId: "a1", studentId: "u1", classId: "c1", attempts: [finalAttempt], activeAttempt: null });
    const r = await dashboardHandler(req(), makeDeps(store));
    const a = findAsg(r.jsonBody, "a1");
    expect(a.latestResult.gradingStatus).toBe("final");
    expect(a.dashboardState).toBe("completed");
    expect(r.jsonBody.stats.finalized).toBe(1);
    expect(r.jsonBody.stats.averageFinalized).toBe(84);
  });

  it("I: an active attempt with a previous FINAL result => dashboardState inProgress; previous result stays final", async () => {
    const store = new Map();
    store.set(AP + "a1.json", assignment("a1"));
    store.set(SP + "a1/u1.json", { assignmentId: "a1", studentId: "u1", classId: "c1", attempts: [finalAttempt], activeAttempt: { attemptNumber: 2, startedAt: iso(NOW - 60000), endsAt: "", status: "started" } });
    const r = await dashboardHandler(req(), makeDeps(store));
    const a = findAsg(r.jsonBody, "a1");
    expect(a.dashboardState).toBe("inProgress");
    expect(a.gradingStatus).toBe("final");                               // grading independent of the active attempt
    expect(a.latestResult.gradingStatus).toBe("final");
    expect(r.jsonBody.stats.inProgress).toBe(1);
  });

  it("J: scheduled with no result => dashboardState scheduled", async () => {
    const store = new Map();
    store.set(AP + "a1.json", assignment("a1", { openAt: iso(Date.now() + 86400000) }));  // opens tomorrow (real now)
    const r = await dashboardHandler(req(), makeDeps(store));
    const a = findAsg(r.jsonBody, "a1");
    expect(a.dashboardState).toBe("scheduled");
    expect(a.gradingStatus).toBe("notSubmitted");
    expect(r.jsonBody.stats.scheduled).toBe(1);
  });

  it("K: closed with no result => dashboardState closedUnsubmitted", async () => {
    const store = new Map();
    store.set(AP + "a1.json", assignment("a1", { dueAt: iso(Date.now() - 86400000) }));   // closed yesterday (real now)
    const r = await dashboardHandler(req(), makeDeps(store));
    const a = findAsg(r.jsonBody, "a1");
    expect(a.dashboardState).toBe("closedUnsubmitted");
    expect(r.jsonBody.stats.closedUnsubmitted).toBe(1);
  });

  it("L: exactly ONE submission read per assignment (no extra reads introduced)", async () => {
    const store = new Map();
    store.set(AP + "a1.json", assignment("a1"));
    store.set(AP + "a2.json", assignment("a2"));
    store.set(SP + "a1/u1.json", { assignmentId: "a1", studentId: "u1", classId: "c1", attempts: [finalAttempt], activeAttempt: null });
    const counter = {};
    await dashboardHandler(req(), makeDeps(store, counter));
    expect(counter.sub).toBe(2);                                         // one read per assignment, no more
  });

  it("legacy stats (assigned/completed/average) remain for backward compatibility", async () => {
    const store = new Map();
    store.set(AP + "a1.json", assignment("a1"));
    store.set(SP + "a1/u1.json", { assignmentId: "a1", studentId: "u1", classId: "c1", attempts: [finalAttempt], activeAttempt: null });
    const r = await dashboardHandler(req(), makeDeps(store));
    expect(r.jsonBody.stats.assigned).toBe(1);
    expect(r.jsonBody.stats.completed).toBe(1);
    expect(r.jsonBody.stats.average).toBe(84);
    expect(r.jsonBody.stats.submitted).toBe(1);
  });
});
