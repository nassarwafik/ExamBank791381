import { describe, it, expect, beforeEach } from "vitest";
import { handler } from "../src/functions/manage-assignments.js";
import { gradeExam } from "../src/lib/assignment-grading.js";

// Regression tests for the authoritative-total-marks fix, driven through the handler's
// dependency-injection seam (no module mocking). They prove that when an assignment is created, a
// stale/imported top-level exam.totalMarks can NEVER override the value derived from the current
// exam STRUCTURE — for assignment.totalMarks AND the stored examSnapshot.totalMarks — and that the
// stored total equals what gradeExam() will use.

function makeDeps() {
  const store = new Map();
  const uploads = [];
  return {
    store, uploads,
    deps: {
      requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }),
      getContainer: () => ({}),
      downloadJsonOrNull: async (_c, key) => (store.has(key) ? structuredClone(store.get(key)) : null),
      uploadJson: async (_c, key, value) => { store.set(key, value); uploads.push({ key, value }); },
      listJson: async () => [],
      mutateJsonWithRetry: async () => { throw new Error("not used"); },
      recordAuditEvent: async () => {}
    }
  };
}

const createReq = body => ({ method: "POST", url: "http://x/assignments", params: {}, json: async () => ({ action: "create", ...body }) });

let ctx;
beforeEach(() => {
  ctx = makeDeps();
  ctx.store.set("platform/classes/c1.json", { classId: "c1", name: "الصف الأول", active: true });
});

describe("manage-assignments create: structure is the single source of truth for total marks", () => {
  it("stale exam.totalMarks=100 is ignored; assignment + snapshot use the structural total (80)", async () => {
    const examSnapshot = {
      title: "امتحان",
      totalMarks: 100, // STALE
      sections: [{ id: "s1", gradingPolicy: "all", questions: [{ marks: 20 }, { marks: 20 }, { marks: 20 }, { marks: 20 }] }]
    };
    const r = await handler(createReq({ classId: "c1", title: "واجب", examSnapshot, publish: true }), ctx.deps);
    expect(r.status).toBe(200);
    expect(r.jsonBody.assignment.totalMarks).toBe(80);   // NOT 100
    expect(r.jsonBody.assignment.questionCount).toBe(4);

    const stored = ctx.uploads[0].value;
    expect(stored.totalMarks).toBe(80);
    expect(stored.examSnapshot.totalMarks).toBe(80);     // snapshot normalized too — no contradiction
    // Agrees with the grader.
    expect(gradeExam(stored.examSnapshot, {}).totalMarks).toBe(80);
  });

  it("stale section cap on an 'all' section is ignored (structure 80, not the stale cap 60)", async () => {
    const examSnapshot = { totalMarks: 60, sections: [{ id: "s1", gradingPolicy: "all", maxMarks: 60, questions: [{ marks: 20 }, { marks: 20 }, { marks: 20 }, { marks: 20 }] }] };
    const r = await handler(createReq({ classId: "c1", title: "واجب", examSnapshot }), ctx.deps);
    expect(r.jsonBody.assignment.totalMarks).toBe(80);
    expect(ctx.uploads[0].value.examSnapshot.totalMarks).toBe(80);
  });

  it("capScore cap is honored (raw 63 -> 60); assignment == grader", async () => {
    const examSnapshot = { totalMarks: 999, sections: [{ id: "s1", gradingPolicy: "capScore", maxMarks: 60, questions: Array.from({ length: 21 }, () => ({ marks: 3 })) }] };
    const r = await handler(createReq({ classId: "c1", title: "واجب", examSnapshot }), ctx.deps);
    expect(r.jsonBody.assignment.totalMarks).toBe(60);
    expect(gradeExam(ctx.uploads[0].value.examSnapshot, {}).totalMarks).toBe(60);
  });

  it("compound explicit parts (3+3+2=8) beat the stale question marks (10) and stale total", async () => {
    const examSnapshot = { totalMarks: 50, sections: [{ id: "s1", gradingPolicy: "all", questions: [{ marks: 10, parts: [{ marks: 3 }, { marks: 3 }, { marks: 2 }] }] }] };
    const r = await handler(createReq({ classId: "c1", title: "واجب", examSnapshot }), ctx.deps);
    expect(r.jsonBody.assignment.totalMarks).toBe(8);
    expect(ctx.uploads[0].value.examSnapshot.totalMarks).toBe(8);
  });

  it("legacy flat exam: structure (15) wins over stale totalMarks (999)", async () => {
    const examSnapshot = { totalMarks: 999, questions: [{ marks: 5 }, { marks: 5 }, { marks: 5 }] };
    const r = await handler(createReq({ classId: "c1", title: "واجب", examSnapshot }), ctx.deps);
    expect(r.jsonBody.assignment.totalMarks).toBe(15);
    expect(r.jsonBody.assignment.questionCount).toBe(3);
  });

  it("does NOT mutate the caller's source exam object (only the cleaned snapshot is normalized)", async () => {
    const examSnapshot = { totalMarks: 100, sections: [{ id: "s1", gradingPolicy: "all", questions: [{ marks: 20 }, { marks: 20 }, { marks: 20 }, { marks: 20 }] }] };
    await handler(createReq({ classId: "c1", title: "واجب", examSnapshot }), ctx.deps);
    // The request body's exam is untouched; only the deep-cloned stored snapshot was normalized.
    expect(examSnapshot.totalMarks).toBe(100);
    expect(ctx.uploads[0].value.examSnapshot.totalMarks).toBe(80);
  });

  it("empty exam (no questions) is rejected before any upload", async () => {
    const r = await handler(createReq({ classId: "c1", title: "واجب", examSnapshot: { totalMarks: 100, sections: [] } }), ctx.deps);
    expect(r.status).toBe(400);
    expect(ctx.uploads).toHaveLength(0);
  });
});
