import { describe, it, expect, beforeEach } from "vitest";
import { handler as createHandler } from "../src/functions/manage-assignments.js";
import { handler as assignmentHandler } from "../src/functions/student-assignment.js";

// Covers the assignment-creation duration schema/validation AND the pre-start question-security
// requirement, both through the endpoints' dependency-injection seams.

const ASG = "platform/assignments/asg1.json";
const SUB = "platform/submissions/asg1/stu-1.json";

// ── manage-assignments: durationMinutes validation ──────────────────────────
function builderDeps() {
  const store = new Map(); const uploads = [];
  store.set("platform/classes/c1.json", { classId: "c1", name: "الصف", active: true });
  return {
    store, uploads,
    deps: {
      requireBuilderAuth: () => ({ ok: true, user: { sub: "t1" } }),
      getContainer: () => ({}),
      downloadJsonOrNull: async (_c, k) => (store.has(k) ? structuredClone(store.get(k)) : null),
      uploadJson: async (_c, k, v) => { store.set(k, v); uploads.push(v); },
      listJson: async () => [], mutateJsonWithRetry: async () => { throw new Error("nu"); }, recordAuditEvent: async () => {}
    }
  };
}
const createReq = body => ({ method: "POST", url: "http://x/assignments", params: {}, json: async () => ({ action: "create", classId: "c1", title: "واجب", examSnapshot: { sections: [{ id: "s1", gradingPolicy: "all", questions: [{ marks: 10 }] }] }, ...body }) });

describe("manage-assignments create: durationMinutes schema", () => {
  it("missing/null/empty/0 => untimed (durationMinutes 0)", async () => {
    for (const v of [undefined, null, "", 0]) {
      const ctx = builderDeps();
      const body = v === undefined ? {} : { durationMinutes: v };
      const r = await createHandler(createReq(body), ctx.deps);
      expect(r.status).toBe(200);
      expect(r.jsonBody.assignment.durationMinutes).toBe(0);
      expect(ctx.uploads[0].durationMinutes).toBe(0);
    }
  });
  it("valid positive integers 1..1440 are stored", async () => {
    for (const v of [1, 60, 90, 1440]) {
      const ctx = builderDeps();
      const r = await createHandler(createReq({ durationMinutes: v }), ctx.deps);
      expect(r.status).toBe(200);
      expect(r.jsonBody.assignment.durationMinutes).toBe(v);
    }
  });
  it("invalid values => 400 (never silently clamped)", async () => {
    for (const v of [-5, 0.5, 1441, 5000, "abc", NaN]) {
      const ctx = builderDeps();
      const r = await createHandler(createReq({ durationMinutes: v }), ctx.deps);
      expect(r.status).toBe(400);
      expect(ctx.uploads).toHaveLength(0);
    }
  });
});

// ── student-assignment: question security before/after start ────────────────
function studentDeps() {
  const store = new Map();
  store.set("platform/users/stu-1.json", { userId: "stu-1", active: true, classId: "c1", displayName: "أحمد", code: "S1" });
  store.set("platform/classes/c1.json", { classId: "c1", status: "active" });
  return {
    store,
    deps: {
      requireStudentAuth: () => ({ ok: true, user: { sub: "stu-1" } }),
      getContainer: () => ({}),
      downloadJsonOrNull: async (_c, k) => (store.has(k) ? structuredClone(store.get(k)) : null)
    }
  };
}
function seedTimedAssignment(store, extra = {}) {
  store.set(ASG, {
    assignmentId: "asg1", classId: "c1", status: "published", maxAttempts: 1, durationMinutes: 60,
    title: "امتحان", questionCount: 1, totalMarks: 10,
    dueAt: new Date(Date.now() + 3600_000).toISOString(),
    examSnapshot: { title: "امتحان", presentationTheme: "classic", coverPage: { enabled: true, showDuration: true },
      sections: [{ id: "s1", title: "القسم", gradingPolicy: "all", questions: [{ examQuestionId: "q1", presentationType: "multipleChoice", text: "ما هو؟", options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 }, marks: 10 }] }] },
    ...extra
  });
}
const getReq = { method: "GET", params: { assignmentId: "asg1" }, json: async () => ({}) };

describe("REQUIRED (#36) question security for timed assignments", () => {
  it("timed + NO active attempt: response carries NO question content, but safe metadata + duration", async () => {
    const ctx = studentDeps(); seedTimedAssignment(ctx.store);
    const r = await assignmentHandler(getReq, ctx.deps);
    expect(r.status).toBe(200);
    const asg = r.jsonBody.assignment;
    expect(asg.requiresStart).toBe(true);
    expect(asg.durationMinutes).toBe(60);
    // No answerable body at all.
    expect(asg.exam.questions).toBeUndefined();
    expect(asg.exam.sections).toBeUndefined();
    const blob = JSON.stringify(r.jsonBody);
    expect(blob).not.toContain("ما هو؟");        // question text absent
    expect(blob).not.toContain("correctOptionIndex"); // answer key absent
    // Safe cover/marks metadata IS present.
    expect(asg.exam.coverPage).toBeTruthy();
    expect(asg.marksDistribution.total).toBe(10);
  });

  it("timed + ACTIVE attempt: full student-sanitized exam IS returned, answer keys still stripped", async () => {
    const ctx = studentDeps(); seedTimedAssignment(ctx.store);
    const now = Date.now();
    ctx.store.set(SUB, { assignmentId: "asg1", studentId: "stu-1", classId: "c1", attempts: [], draftAnswers: {},
      activeAttempt: { attemptNumber: 1, startedAt: new Date(now).toISOString(), endsAt: new Date(now + 60 * 60000).toISOString() } });
    const r = await assignmentHandler(getReq, ctx.deps);
    expect(r.status).toBe(200);
    const asg = r.jsonBody.assignment;
    expect(asg.requiresStart).toBeUndefined();
    const sections = asg.exam.sections;
    expect(Array.isArray(sections)).toBe(true);
    expect(sections[0].questions[0].text).toBe("ما هو؟"); // questions now delivered
    // Answer key still stripped by the sanitizer.
    expect(JSON.stringify(r.jsonBody)).not.toContain("correctOptionIndex");
  });

  it("REQUIRED (#38) untimed assignment always returns the exam (no start gate)", async () => {
    const ctx = studentDeps(); seedTimedAssignment(ctx.store, { durationMinutes: 0 });
    const r = await assignmentHandler(getReq, ctx.deps);
    expect(r.status).toBe(200);
    expect(r.jsonBody.assignment.requiresStart).toBeUndefined();
    expect(r.jsonBody.assignment.exam.sections[0].questions[0].text).toBe("ما هو؟");
  });
});
