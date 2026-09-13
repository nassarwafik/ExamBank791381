import { describe, it, expect, beforeEach } from "vitest";
import { handler } from "../src/functions/student-submission.js";

// These tests drive the real handler through its dependency-injection seam (`deps`), so no module
// mocking is needed — vitest cannot intercept the SUT's internal CommonJS `require`, so we pass the
// storage/auth/grading collaborators explicitly. The assertions prove the ACTUAL vulnerability fix:
// a save/submit before openAt (or after due, or past the attempt limit) is rejected server-side with
// NO grading and NO storage mutation, and the atomic mutation collaborators are never even reached.

const iso = ms => new Date(ms).toISOString();
const NOW = () => Date.now();
const ASG = "platform/assignments/asg1.json";
const SUB = "platform/submissions/asg1/stu-1.json";

class StorageConflictError extends Error {}

// Builds a fresh set of injectable deps backed by an in-memory store plus call counters.
function makeDeps() {
  const store = new Map();
  const writes = [];
  const counts = { grade: 0, achievement: 0 };
  return {
    store, writes, counts,
    deps: {
      requireStudentAuth: () => ({ ok: true, user: { sub: "stu-1" } }),
      getContainer: () => ({}),
      downloadJsonOrNull: async (_c, key) => (store.has(key) ? structuredClone(store.get(key)) : null),
      mutateJsonWithRetry: async (_c, key, fn) => {
        const cur = store.has(key) ? structuredClone(store.get(key)) : null;
        const next = await fn(cur);
        store.set(key, next); writes.push(key);
        return next;
      },
      StorageConflictError,
      gradeExam: () => {
        counts.grade++;
        return { score: 10, totalMarks: 10, percentage: 100, manualReviewMarks: 0, finalized: true, questions: [], sections: [] };
      },
      recordAchievementIfEligible: async () => { counts.achievement++; }
    }
  };
}

function seed(store, extra = {}) {
  store.set("platform/users/stu-1.json", { userId: "stu-1", active: true, classId: "c1", displayName: "أحمد", code: "S1" });
  store.set("platform/classes/c1.json", { classId: "c1", status: "active" });
  store.set(ASG, { assignmentId: "asg1", classId: "c1", status: "published", maxAttempts: 1, title: "واجب", examSnapshot: { questions: [] }, ...extra });
}

const req = (method, action, answers = {}) => ({ method, params: { assignmentId: "asg1" }, json: async () => ({ action, answers }) });

let ctx;
beforeEach(() => { ctx = makeDeps(); });

describe("student-submission: scheduled (before openAt) is blocked server-side", () => {
  it("saveDraft before openAt => 403, message, NO mutation", async () => {
    seed(ctx.store, { openAt: iso(NOW() + 3600_000) });
    const r = await handler(req("POST", "saveDraft", { q1: { kind: "text", value: "x" } }), ctx.deps);
    expect(r.status).toBe(403);
    expect(r.jsonBody.error).toBe("الواجب لم يُفتح بعد.");
    expect(ctx.writes).toHaveLength(0);          // no submission mutation
    expect(ctx.store.has(SUB)).toBe(false);      // no submission document created
  });

  it("submit before openAt => 403, NO grade, NO attempt, NO achievement, NO mutation", async () => {
    seed(ctx.store, { openAt: iso(NOW() + 3600_000) });
    const r = await handler(req("POST", "submit", { q1: { kind: "text", value: "x" } }), ctx.deps);
    expect(r.status).toBe(403);
    expect(r.jsonBody.error).toBe("الواجب لم يُفتح بعد.");
    expect(ctx.counts.grade).toBe(0);            // gradeExam never called
    expect(ctx.counts.achievement).toBe(0);
    expect(ctx.writes).toHaveLength(0);
    expect(ctx.store.has(SUB)).toBe(false);
  });
});

describe("student-submission: open assignment still works", () => {
  it("saveDraft persists the draft", async () => {
    seed(ctx.store, { openAt: iso(NOW() - 1000), dueAt: iso(NOW() + 3600_000) });
    const r = await handler(req("POST", "saveDraft", { q1: { kind: "text", value: "hello" } }), ctx.deps);
    expect(r.status).toBe(200);
    expect(r.jsonBody.ok).toBe(true);
    expect(ctx.writes).toContain(SUB);
    expect(ctx.store.get(SUB).draftAnswers).toEqual({ q1: { kind: "text", value: "hello" } });
  });

  it("submit grades and records an attempt", async () => {
    seed(ctx.store, { openAt: iso(NOW() - 1000), dueAt: iso(NOW() + 3600_000) });
    const r = await handler(req("POST", "submit", { q1: { kind: "text", value: "hello" } }), ctx.deps);
    expect(r.status).toBe(200);
    expect(r.jsonBody.result.attemptNumber).toBe(1);
    expect(ctx.counts.grade).toBe(1);
    expect(ctx.store.get(SUB).attempts).toHaveLength(1);
    expect(ctx.counts.achievement).toBe(1); // finalized+100% → eligible
  });
});

describe("student-submission: closed assignment is blocked", () => {
  it("saveDraft after due => 409 انتهى موعد التسليم., no mutation", async () => {
    seed(ctx.store, { openAt: iso(NOW() - 3600_000), dueAt: iso(NOW() - 1000) });
    const r = await handler(req("POST", "saveDraft", { q1: { kind: "text", value: "x" } }), ctx.deps);
    expect(r.status).toBe(409);
    expect(r.jsonBody.error).toBe("انتهى موعد التسليم.");
    expect(ctx.writes).toHaveLength(0);
  });
  it("submit after due => 409, no grade, no mutation", async () => {
    seed(ctx.store, { openAt: iso(NOW() - 3600_000), dueAt: iso(NOW() - 1000) });
    const r = await handler(req("POST", "submit", { q1: { kind: "text", value: "x" } }), ctx.deps);
    expect(r.status).toBe(409);
    expect(r.jsonBody.error).toBe("انتهى موعد التسليم.");
    expect(ctx.counts.grade).toBe(0);
    expect(ctx.writes).toHaveLength(0);
  });
  it("dueAtOverride keeps a past-due assignment OPEN (submit succeeds)", async () => {
    seed(ctx.store, { openAt: iso(NOW() - 3600_000), dueAt: iso(NOW() - 1000) });
    ctx.store.set(SUB, { assignmentId: "asg1", studentId: "stu-1", classId: "c1", attempts: [], draftAnswers: {}, dueAtOverride: iso(NOW() + 3600_000) });
    const r = await handler(req("POST", "submit", {}), ctx.deps);
    expect(r.status).toBe(200);
    expect(ctx.counts.grade).toBe(1);
  });
});

describe("student-submission: attempt limit preserved", () => {
  it("submit when attempts exhausted => 409 لا توجد محاولة إضافية متاحة.", async () => {
    seed(ctx.store, { openAt: iso(NOW() - 1000), dueAt: iso(NOW() + 3600_000), maxAttempts: 1 });
    ctx.store.set(SUB, { assignmentId: "asg1", studentId: "stu-1", classId: "c1", attempts: [{ attemptNumber: 1, submittedAt: iso(NOW() - 500) }], draftAnswers: {} });
    const r = await handler(req("POST", "submit", {}), ctx.deps);
    expect(r.status).toBe(409);
    expect(r.jsonBody.error).toBe("لا توجد محاولة إضافية متاحة.");
    expect(ctx.counts.grade).toBe(0);
    expect(ctx.writes).toHaveLength(0);
  });
});

describe("student-submission GET returns unified availability", () => {
  it("scheduled/open/closed state.availability matches the assignment window", async () => {
    seed(ctx.store, { openAt: iso(NOW() + 3600_000) });
    expect((await handler(req("GET"), ctx.deps)).jsonBody.state.availability).toBe("scheduled");

    ctx = makeDeps();
    seed(ctx.store, { openAt: iso(NOW() - 1000), dueAt: iso(NOW() + 3600_000) });
    const open = (await handler(req("GET"), ctx.deps)).jsonBody.state;
    expect(open.availability).toBe("open");
    expect(open.canAttempt).toBe(true);
    expect(open.openAt).toBeTruthy();

    ctx = makeDeps();
    seed(ctx.store, { dueAt: iso(NOW() - 1000) });
    expect((await handler(req("GET"), ctx.deps)).jsonBody.state.availability).toBe("closed");
  });
});
