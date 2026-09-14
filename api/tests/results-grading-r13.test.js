import { describe, it, expect } from "vitest";
import { handler as resultsHandler } from "../src/functions/assignment-results.js";

// Roadmap #13 — teacher results (assignment-results GET) additive gradingStatus + stats.
const NOW = Date.parse("2026-03-01T12:00:00.000Z");
const iso = ms => new Date(ms).toISOString();
const AP = "platform/assignments/", SP = "platform/submissions/", UP = "platform/users/";
function deps(store) {
  return {
    requireBuilderAuth: () => ({ ok: true, user: { sub: "t1" } }),
    getContainer: () => ({}),
    downloadJsonOrNull: async (_c, key) => store.has(key) ? structuredClone(store.get(key)) : null,
    listJson: async (_c, prefix) => [...store.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => structuredClone(v))
  };
}
const pending = { attemptNumber: 1, submittedAt: iso(NOW), score: 62, totalMarks: 100, percentage: 62, manualReviewMarks: 18, finalized: false };
const final1 = { attemptNumber: 1, submittedAt: iso(NOW), score: 84, totalMarks: 100, percentage: 84, manualReviewMarks: 0, finalized: true };
function seed({ status = "published" } = {}) {
  const store = new Map();
  store.set(AP + "a1.json", { assignmentId: "a1", classId: "c1", status, title: "واجب", dueAt: "", durationMinutes: 0, maxAttempts: 3, totalMarks: 100, attemptModelVersion: 2 });
  store.set(UP + "s1.json", { userId: "s1", classId: "c1", active: true, displayName: "أ", code: "S1" });
  store.set(UP + "s2.json", { userId: "s2", classId: "c1", active: true, displayName: "ب", code: "S2" });
  store.set(UP + "s3.json", { userId: "s3", classId: "c1", active: true, displayName: "ج", code: "S3" });
  store.set(UP + "s4.json", { userId: "s4", classId: "c1", active: true, displayName: "د", code: "S4" });
  store.set(SP + "a1/s1.json", { assignmentId: "a1", studentId: "s1", classId: "c1", attempts: [pending], activeAttempt: null });
  store.set(SP + "a1/s2.json", { assignmentId: "a1", studentId: "s2", classId: "c1", attempts: [final1], activeAttempt: null });
  // s3 has NO submission (notSubmitted). s4 has a final previous attempt AND a live active attempt.
  store.set(SP + "a1/s4.json", { assignmentId: "a1", studentId: "s4", classId: "c1", attempts: [final1], activeAttempt: { attemptNumber: 2, startedAt: iso(NOW - 60000), endsAt: "", status: "started" } });
  return store;
}
const get = store => resultsHandler({ method: "GET", url: "http://x/assignment-results?assignmentId=a1", json: async () => ({}) }, deps(store));
const rowOf = (body, id) => body.students.find(s => s.studentId === id);

describe("R13 results gradingStatus + stats", () => {
  it("M: pending / final / not-submitted rows each receive the correct gradingStatus", async () => {
    const r = await get(seed());
    expect(r.status).toBe(200);
    expect(rowOf(r.jsonBody, "s1").gradingStatus).toBe("pendingReview");
    expect(rowOf(r.jsonBody, "s1").latestResult.gradingStatus).toBe("pendingReview");
    expect(rowOf(r.jsonBody, "s2").gradingStatus).toBe("final");
    expect(rowOf(r.jsonBody, "s3").gradingStatus).toBe("notSubmitted");
    expect(rowOf(r.jsonBody, "s3").latestResult).toBeNull();
    // per-attempt summaries also carry gradingStatus
    expect(rowOf(r.jsonBody, "s2").attempts[0].gradingStatus).toBe("final");
  });

  it("N: active count is INDEPENDENT of grading status (s4: final latest + live active attempt)", async () => {
    const r = await get(seed());
    const s4 = rowOf(r.jsonBody, "s4");
    expect(s4.gradingStatus).toBe("final");         // latest result stays final
    expect(!!s4.activeAttempt).toBe(true);          // and it is simultaneously active
    expect(r.jsonBody.stats.active).toBe(1);
  });

  it("O: stats pendingReview / finalized / notSubmitted are correct and not mutually exclusive with active", async () => {
    const r = await get(seed());
    const st = r.jsonBody.stats;
    expect(st.students).toBe(4);
    expect(st.submitted).toBe(3);                   // s1,s2,s4 have completed attempts
    expect(st.pendingReview).toBe(1);               // s1
    expect(st.finalized).toBe(2);                   // s2, s4 (latest final)
    expect(st.notSubmitted).toBe(1);                // s3
    expect(st.active).toBe(1);                       // s4 — counted despite being finalized
  });

  it("P: an ARCHIVED assignment's GET results remain readable (with gradingStatus)", async () => {
    const r = await get(seed({ status: "archived" }));
    expect(r.status).toBe(200);
    expect(r.jsonBody.students.length).toBe(4);
    expect(rowOf(r.jsonBody, "s2").gradingStatus).toBe("final");
  });
});
