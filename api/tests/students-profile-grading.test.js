import { describe, it, expect } from "vitest";
import { buildStudentProfile } from "../src/functions/manage-students.js";

// Grading-authority consistency (teacher student-profile) — the per-student profile the teacher opens must
// carry the canonical `gradingStatus` on both the current-class `assignments` history and the cross-class
// `submittedAssignments`, and must echo the RAW `finalized` (omitted when a legacy attempt lacked it)
// rather than fabricating false. Read-time only; stored submissions are never mutated.
const U = "platform/users/", C = "platform/classes/", A = "platform/assignments/", S = "platform/submissions/";

// A fake blob container compatible with manage-students' local downloadJsonOrNull / listJson.
function fakeContainer(store) {
  return {
    getBlobClient(name) {
      return {
        async download() {
          if (!store.has(name)) { const e = new Error("BlobNotFound"); e.statusCode = 404; throw e; }
          return { readableStreamBody: [Buffer.from(JSON.stringify(store.get(name)), "utf8")] };
        }
      };
    },
    async *listBlobsFlat({ prefix }) {
      for (const name of store.keys()) if (name.startsWith(prefix)) yield { name };
    }
  };
}
const attempt = (over = {}) => ({ attemptNumber: 1, submittedAt: "2026-03-01T10:00:00.000Z", score: 80, totalMarks: 100, percentage: 80, manualReviewMarks: 0, ...over });
function storeWith(latest) {
  const store = new Map();
  store.set(U + "u1.json", { userId: "u1", role: "student", classId: "c1", displayName: "علي", code: "S1", active: true });
  store.set(C + "c1.json", { classId: "c1", name: "الحادي عشر", grade: "11", schoolYear: "2026" });
  store.set(A + "a1.json", { assignmentId: "a1", classId: "c1", status: "published", title: "واجب", dueAt: "", totalMarks: 100, maxAttempts: 3, createdAt: "2026-02-01T00:00:00.000Z" });
  store.set(S + "a1/u1.json", { assignmentId: "a1", studentId: "u1", classId: "c1", attempts: [latest] });
  return store;
}

describe("teacher student-profile grading authority", () => {
  it("legacy final (finalized ABSENT, manual 0) => gradingStatus final on both shapes, finalized NOT fabricated, submission unchanged", async () => {
    const store = storeWith(attempt());                                  // no `finalized` key
    const before = JSON.parse(JSON.stringify(store.get(S + "a1/u1.json")));
    const p = await buildStudentProfile(fakeContainer(store), "u1");
    expect(p.assignments[0].gradingStatus).toBe("final");
    expect(p.assignments[0].finalized).toBeUndefined();                  // not fabricated to false
    expect(p.submittedAssignments[0].gradingStatus).toBe("final");
    expect(p.submittedAssignments[0].finalized).toBeUndefined();
    expect(store.get(S + "a1/u1.json")).toEqual(before);                 // read-time only
    expect(store.get(S + "a1/u1.json").attempts[0]).not.toHaveProperty("finalized");
  });

  it("finalized:false stored => gradingStatus pendingReview, finalized echoed false", async () => {
    const p = await buildStudentProfile(fakeContainer(storeWith(attempt({ finalized: false, manualReviewMarks: 6 }))), "u1");
    expect(p.assignments[0].gradingStatus).toBe("pendingReview");
    expect(p.assignments[0].finalized).toBe(false);
    expect(p.submittedAssignments[0].gradingStatus).toBe("pendingReview");
  });

  it("finalized:true, manual 0 => final, finalized echoed true", async () => {
    const p = await buildStudentProfile(fakeContainer(storeWith(attempt({ finalized: true }))), "u1");
    expect(p.assignments[0].gradingStatus).toBe("final");
    expect(p.assignments[0].finalized).toBe(true);
  });

  it("manualReviewMarks > 0 even with finalized true => pendingReview (manual marks take precedence)", async () => {
    const p = await buildStudentProfile(fakeContainer(storeWith(attempt({ finalized: true, manualReviewMarks: 4 }))), "u1");
    expect(p.assignments[0].gradingStatus).toBe("pendingReview");
    expect(p.submittedAssignments[0].gradingStatus).toBe("pendingReview");
  });
});
