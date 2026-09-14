import { describe, it, expect } from "vitest";
import { handler as dashboardHandler } from "../src/functions/student-dashboard.js";

// Grading-authority consistency pass — the dashboard latestResult must expose gradingStatus as the
// normalized authority while echoing `finalized` as the historical RAW value: a legacy result whose stored
// `finalized` field is ABSENT normalizes to gradingStatus "final" but must NOT have finalized fabricated to
// false. The stored submission is never mutated (read-time only).
const AP = "platform/assignments/", SP = "platform/submissions/";
const student = { userId: "u1", classId: "c1", code: "S1", displayName: "علي", active: true, shareAchievements: true };
function makeDeps(store) {
  return {
    requireActiveStudentSession: async () => ({ ok: true, container: {}, student }),
    downloadJsonOrNull: async (_c, key) => (store.has(key) ? structuredClone(store.get(key)) : null),
    listJson: async (_c, prefix) => [...store.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => structuredClone(v))
  };
}
const assignment = (id, extra = {}) => ({ assignmentId: id, classId: "c1", status: "published", title: id, instructions: "", maxAttempts: 3, durationMinutes: 0, attemptModelVersion: 2, questionCount: 1, totalMarks: 100, openAt: "", dueAt: "", ...extra });
const req = () => ({ method: "GET", url: "http://x/student-dashboard", headers: { get: () => null } });
const findAsg = (body, id) => body.assignments.find(a => a.assignmentId === id);

describe("D: dashboard legacy finalized preservation", () => {
  it("legacy result (finalized ABSENT, manualReviewMarks 0) => gradingStatus final, finalized NOT fabricated false, submission unchanged", async () => {
    const store = new Map();
    store.set(AP + "a1.json", assignment("a1"));
    // A legacy stored attempt: no `finalized` field at all, no manual review marks outstanding.
    const legacyAttempt = { attemptNumber: 1, submittedAt: "2026-03-01T10:00:00.000Z", score: 84, totalMarks: 100, percentage: 84, manualReviewMarks: 0, teacherFeedback: "" };
    const stored = { assignmentId: "a1", studentId: "u1", classId: "c1", attempts: [legacyAttempt], activeAttempt: null };
    store.set(SP + "a1/u1.json", stored);
    const before = structuredClone(stored);

    const r = await dashboardHandler(req(), makeDeps(store));
    expect(r.status).toBe(200);
    const a = findAsg(r.jsonBody, "a1");
    expect(a.latestResult.gradingStatus).toBe("final");                 // normalized authority
    expect(a.gradingStatus).toBe("final");
    expect(a.latestResult.finalized).toBeUndefined();                   // NOT fabricated to false
    expect(a.latestResult).not.toHaveProperty("finalized", false);

    // Read-time only: the stored submission is untouched.
    expect(store.get(SP + "a1/u1.json")).toEqual(before);
    expect(store.get(SP + "a1/u1.json").attempts[0]).not.toHaveProperty("finalized");
  });

  it("a stored finalized:true is echoed as true; a stored finalized:false is echoed as false", async () => {
    const store = new Map();
    store.set(AP + "aT.json", assignment("aT"));
    store.set(AP + "aF.json", assignment("aF"));
    store.set(SP + "aT/u1.json", { assignmentId: "aT", studentId: "u1", classId: "c1", attempts: [{ attemptNumber: 1, submittedAt: "2026-03-01T10:00:00.000Z", score: 90, totalMarks: 100, percentage: 90, manualReviewMarks: 0, finalized: true, teacherFeedback: "" }], activeAttempt: null });
    store.set(SP + "aF/u1.json", { assignmentId: "aF", studentId: "u1", classId: "c1", attempts: [{ attemptNumber: 1, submittedAt: "2026-03-01T10:00:00.000Z", score: 50, totalMarks: 100, percentage: 50, manualReviewMarks: 0, finalized: false, teacherFeedback: "" }], activeAttempt: null });
    const r = await dashboardHandler(req(), makeDeps(store));
    expect(findAsg(r.jsonBody, "aT").latestResult.finalized).toBe(true);
    expect(findAsg(r.jsonBody, "aT").latestResult.gradingStatus).toBe("final");
    expect(findAsg(r.jsonBody, "aF").latestResult.finalized).toBe(false);
    expect(findAsg(r.jsonBody, "aF").latestResult.gradingStatus).toBe("pendingReview"); // finalized:false => pending
  });
});
