import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { handler } from "../src/functions/student-submission.js";

// Drives the real handler through its dependency-injection seam with fake timers controlling server
// time (the handler calls Date.now() directly). Proves the server-authoritative timer contract:
// idempotent start, pre-start write block, expiry rejection, and timeout finalization that grades ONLY
// the server draft (a client cannot smuggle post-expiry answers).

const MIN = 60_000;
const BASE = 1_700_000_000_000;
const ASG = "platform/assignments/asg1.json";
const SUB = "platform/submissions/asg1/stu-1.json";
class StorageConflictError extends Error {}

let store, writes, counts, gradedAnswers, deps;
function makeDeps() {
  store = new Map(); writes = []; counts = { grade: 0, achievement: 0 }; gradedAnswers = [];
  deps = {
    requireStudentAuth: () => ({ ok: true, user: { sub: "stu-1" } }),
    getContainer: () => ({}),
    downloadJsonOrNull: async (_c, key) => (store.has(key) ? structuredClone(store.get(key)) : null),
    mutateJsonWithRetry: async (_c, key, fn) => { const cur = store.has(key) ? structuredClone(store.get(key)) : null; const next = await fn(cur); store.set(key, next); writes.push(key); return next; },
    StorageConflictError,
    // Correct answer is "A". Records the answers it was handed so tests can prove WHICH answers were graded.
    gradeExam: (_exam, answers) => { counts.grade++; gradedAnswers.push(answers); const ok = answers && answers.q1 && answers.q1.value === "A"; return { score: ok ? 10 : 0, totalMarks: 10, percentage: ok ? 100 : 0, manualReviewMarks: 0, finalized: true, questions: [], sections: [] }; },
    recordAchievementIfEligible: async () => { counts.achievement++; }
  };
}
function seed({ durationMinutes = 60, maxAttempts = 1, dueAt = new Date(BASE + 10 * 60 * MIN).toISOString() } = {}) {
  store.set("platform/users/stu-1.json", { userId: "stu-1", active: true, classId: "c1", displayName: "أحمد", code: "S1" });
  store.set("platform/classes/c1.json", { classId: "c1", status: "active" });
  store.set(ASG, { assignmentId: "asg1", classId: "c1", status: "published", maxAttempts, durationMinutes, title: "واجب", dueAt, examSnapshot: { questions: [{ examQuestionId: "q1", presentationType: "shortAnswer", marks: 10 }] } });
}
const req = (method, action, answers) => ({ method, params: { assignmentId: "asg1" }, json: async () => ({ action, ...(answers !== undefined ? { answers } : {}) }) });
const call = (method, action, answers) => handler(req(method, action, answers), deps);

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(BASE); makeDeps(); });
afterEach(() => { vi.useRealTimers(); });

describe("startAttempt", () => {
  it("stamps server startedAt/endsAt = start + durationMinutes", async () => {
    seed();
    const r = await call("POST", "startAttempt");
    expect(r.status).toBe(200);
    const aa = r.jsonBody.state.activeAttempt;
    expect(aa.startedAt).toBe(new Date(BASE).toISOString());
    expect(aa.endsAt).toBe(new Date(BASE + 60 * MIN).toISOString());
    expect(r.jsonBody.state.effectiveAttemptEndsAt).toBe(new Date(BASE + 60 * MIN).toISOString());
    expect(r.jsonBody.state.timed).toBe(true);
  });

  it("REQUIRED (#32) START DOES NOT RESET: second start 20 min later returns the SAME timer", async () => {
    seed();
    const first = (await call("POST", "startAttempt")).jsonBody.state.activeAttempt;
    vi.setSystemTime(BASE + 20 * MIN);
    const second = (await call("POST", "startAttempt")).jsonBody.state.activeAttempt;
    expect(second.startedAt).toBe(first.startedAt); // 10:00
    expect(second.endsAt).toBe(first.endsAt);       // 11:00 — NOT restarted to 11:20
    expect(store.get(SUB).attempts).toHaveLength(0); // no completed attempt created by starting
  });

  it("start on an UNTIMED assignment => 400", async () => {
    seed({ durationMinutes: 0 });
    const r = await call("POST", "startAttempt");
    expect(r.status).toBe(400);
  });
});

describe("REQUIRED (#35) timed writes require an active attempt", () => {
  it("saveDraft before start => 409 ابدأ المحاولة أولاً., no mutation", async () => {
    seed();
    const r = await call("POST", "saveDraft", { q1: { kind: "text", value: "A" } });
    expect(r.status).toBe(409);
    expect(r.jsonBody.error).toBe("ابدأ المحاولة أولاً.");
    expect(writes).toHaveLength(0);
  });
  it("submit before start => 409, no grade, no mutation", async () => {
    seed();
    const r = await call("POST", "submit", { q1: { kind: "text", value: "A" } });
    expect(r.status).toBe(409);
    expect(r.jsonBody.error).toBe("ابدأ المحاولة أولاً.");
    expect(counts.grade).toBe(0);
    expect(writes).toHaveLength(0);
  });
});

describe("timed save/submit within the window", () => {
  it("saveDraft then submit succeed while the attempt is live; completed attempt is timed audit-stamped", async () => {
    seed();
    await call("POST", "startAttempt");
    vi.setSystemTime(BASE + 5 * MIN);
    const rs = await call("POST", "saveDraft", { q1: { kind: "text", value: "A" } });
    expect(rs.status).toBe(200);
    expect(store.get(SUB).draftAnswers).toEqual({ q1: { kind: "text", value: "A" } });
    vi.setSystemTime(BASE + 10 * MIN);
    const r = await call("POST", "submit", { q1: { kind: "text", value: "A" } });
    expect(r.status).toBe(200);
    expect(r.jsonBody.result.score).toBe(10);
    expect(r.jsonBody.result.timedOut).toBe(false);
    expect(r.jsonBody.result.startedAt).toBe(new Date(BASE).toISOString());
    expect(r.jsonBody.result.endsAt).toBe(new Date(BASE + 60 * MIN).toISOString());
    expect(store.get(SUB).activeAttempt).toBeNull();   // cleared
    expect(store.get(SUB).attempts).toHaveLength(1);
    expect(counts.achievement).toBe(1);
  });

  it("REQUIRED (#25) submit AFTER expiry => 409 انتهى وقت المحاولة. (client recovers via finalize)", async () => {
    seed();
    await call("POST", "startAttempt");
    vi.setSystemTime(BASE + 61 * MIN);
    const r = await call("POST", "submit", { q1: { kind: "text", value: "A" } });
    expect(r.status).toBe(409);
    expect(r.jsonBody.error).toBe("انتهى وقت المحاولة.");
    expect(store.get(SUB).attempts).toHaveLength(0);
  });

  it("saveDraft after expiry => 409 انتهى وقت المحاولة.", async () => {
    seed();
    await call("POST", "startAttempt");
    vi.setSystemTime(BASE + 61 * MIN);
    const r = await call("POST", "saveDraft", { q1: { kind: "text", value: "A" } });
    expect(r.status).toBe(409);
    expect(r.jsonBody.error).toBe("انتهى وقت المحاولة.");
  });
});

describe("REQUIRED (#37) timeout finalization grades ONLY the server draft", () => {
  it("client-supplied timeout answers are ignored; server draft is graded and stored", async () => {
    seed();
    await call("POST", "startAttempt");
    vi.setSystemTime(BASE + 5 * MIN);
    await call("POST", "saveDraft", { q1: { kind: "text", value: "A" } }); // server draft = correct "A"
    vi.setSystemTime(BASE + 61 * MIN); // expired
    // Client tries to cheat by sending "B" (wrong) — must be ignored; server grades saved "A".
    const r = await call("POST", "finalizeTimedOutAttempt", { q1: { kind: "text", value: "B" } });
    expect(r.status).toBe(200);
    expect(r.jsonBody.result.score).toBe(10);           // graded "A", not "B"
    expect(r.jsonBody.result.timedOut).toBe(true);
    // The answers that reached the grader were the server draft, never the client "B".
    expect(gradedAnswers[gradedAnswers.length - 1]).toEqual({ q1: { kind: "text", value: "A" } });
    const stored = store.get(SUB);
    expect(stored.attempts[0].answers).toEqual({ q1: { kind: "text", value: "A" } });
    expect(stored.activeAttempt).toBeNull();
    expect(stored.draftAnswers).toEqual({});
  });

  it("finalize BEFORE expiry => 409 لم تنتهِ مدة المحاولة بعد.", async () => {
    seed();
    await call("POST", "startAttempt");
    vi.setSystemTime(BASE + 30 * MIN);
    const r = await call("POST", "finalizeTimedOutAttempt");
    expect(r.status).toBe(409);
    expect(r.jsonBody.error).toBe("لم تنتهِ مدة المحاولة بعد.");
  });

  it("REQUIRED (#30) finalize is idempotent: a second call adds no attempt and no extra achievement", async () => {
    seed();
    await call("POST", "startAttempt");
    await call("POST", "saveDraft", { q1: { kind: "text", value: "A" } });
    vi.setSystemTime(BASE + 61 * MIN);
    const first = await call("POST", "finalizeTimedOutAttempt");
    expect(first.jsonBody.alreadyFinalized).toBe(false);
    const second = await call("POST", "finalizeTimedOutAttempt");
    expect(second.jsonBody.alreadyFinalized).toBe(true);
    expect(store.get(SUB).attempts).toHaveLength(1);
    expect(counts.achievement).toBe(1);
  });
});

describe("REQUIRED (#16) multiple attempts get a fresh timer only after the previous completes", () => {
  it("attempt 2 starts a NEW window; a refresh during attempt 1 does not create attempt 2", async () => {
    seed({ maxAttempts: 2 });
    await call("POST", "startAttempt");                       // attempt 1 @ 10:00
    await call("POST", "startAttempt");                       // refresh — idempotent, still attempt 1
    expect(store.get(SUB).activeAttempt.attemptNumber).toBe(1);
    vi.setSystemTime(BASE + 10 * MIN);
    await call("POST", "submit", { q1: { kind: "text", value: "A" } }); // complete attempt 1
    expect(store.get(SUB).attempts).toHaveLength(1);
    vi.setSystemTime(BASE + 20 * MIN);
    const r2 = await call("POST", "startAttempt");            // attempt 2 @ 10:20
    const aa = r2.jsonBody.state.activeAttempt;
    expect(aa.attemptNumber).toBe(2);
    expect(aa.startedAt).toBe(new Date(BASE + 20 * MIN).toISOString());
    expect(aa.endsAt).toBe(new Date(BASE + 80 * MIN).toISOString());
  });
});

describe("REQUIRED (#20) refresh/resume returns the same active attempt (GET)", () => {
  it("GET after start (30 min later) returns unchanged startedAt/endsAt", async () => {
    seed();
    const started = (await call("POST", "startAttempt")).jsonBody.state.activeAttempt;
    vi.setSystemTime(BASE + 30 * MIN);
    const g = await handler({ method: "GET", params: { assignmentId: "asg1" }, json: async () => ({}) }, deps);
    expect(g.jsonBody.state.activeAttempt.startedAt).toBe(started.startedAt);
    expect(g.jsonBody.state.activeAttempt.endsAt).toBe(started.endsAt);
    expect(g.jsonBody.state.attemptExpired).toBe(false);
  });
});

describe("REQUIRED (#38) untimed backward compatibility", () => {
  it("no durationMinutes: saveDraft/submit work with no startAttempt required", async () => {
    seed({ durationMinutes: 0 });
    const rs = await call("POST", "saveDraft", { q1: { kind: "text", value: "A" } });
    expect(rs.status).toBe(200);
    const r = await call("POST", "submit", { q1: { kind: "text", value: "A" } });
    expect(r.status).toBe(200);
    expect(r.jsonBody.result.timedOut).toBe(false);
    expect(store.get(SUB).attempts).toHaveLength(1);
  });
});
