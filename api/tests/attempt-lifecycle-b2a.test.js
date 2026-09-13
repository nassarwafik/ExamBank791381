import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { handler as submissionHandler } from "../src/functions/student-submission.js";
import { handler as assignmentHandler } from "../src/functions/student-assignment.js";
import { handler as manageHandler } from "../src/functions/manage-assignments.js";
import {
  attemptModelVersion, requiresServerStart, activeAttemptOf, normalizeEndReason,
  deriveAttemptStatus, timerState, startRejection, writeRejection
} from "../src/lib/assignment-availability.js";

// B2A — UNIFIED ATTEMPT LIFECYCLE. Deterministic tests (fixed nowMs / fake timers, DI seams). They prove
// the generalization of the B1 server-authoritative attempt to UNTIMED attemptModelVersion>=2 assignments
// while preserving every legacy-untimed and timed-B1 guarantee.

const MIN = 60_000;
const BASE = 1_700_000_000_000;
const iso = ms => new Date(ms).toISOString();

// ── Pure lib helpers ─────────────────────────────────────────────────────────
describe("B2A lib helpers", () => {
  it("A: attemptModelVersion — v2 assignment => 2; legacy (missing) => 0", () => {
    expect(attemptModelVersion({ attemptModelVersion: 2 })).toBe(2);
    expect(attemptModelVersion({})).toBe(0);
    expect(attemptModelVersion(null)).toBe(0);
  });
  it("B: requiresServerStart — timed(any) OR untimed v2 => true; untimed legacy => false", () => {
    expect(requiresServerStart({ durationMinutes: 30 })).toBe(true);            // timed legacy
    expect(requiresServerStart({ durationMinutes: 30, attemptModelVersion: 2 })).toBe(true);
    expect(requiresServerStart({ durationMinutes: 0, attemptModelVersion: 2 })).toBe(true); // untimed v2
    expect(requiresServerStart({ durationMinutes: 0 })).toBe(false);           // untimed legacy
  });
  it("C: activeAttemptOf accepts an UNTIMED active attempt (endsAt \"\") but rejects malformed", () => {
    expect(activeAttemptOf({ activeAttempt: { attemptNumber: 1, startedAt: iso(BASE), endsAt: "" } })).toBeTruthy();
    expect(activeAttemptOf({ activeAttempt: { attemptNumber: 1, startedAt: iso(BASE), endsAt: iso(BASE + MIN) } })).toBeTruthy();
    expect(activeAttemptOf({ activeAttempt: { attemptNumber: 1 } })).toBeNull(); // no startedAt
    expect(activeAttemptOf({ activeAttempt: null })).toBeNull();
    expect(activeAttemptOf(null)).toBeNull();
  });
  it("D: normalizeEndReason — explicit wins; legacy maps timedOut flag", () => {
    expect(normalizeEndReason({ endReason: "timedOut" })).toBe("timedOut");
    expect(normalizeEndReason({ endReason: "submitted" })).toBe("submitted");
    expect(normalizeEndReason({ timedOut: true })).toBe("timedOut");      // legacy
    expect(normalizeEndReason({ timedOut: false })).toBe("submitted");    // legacy
    expect(normalizeEndReason({})).toBe("submitted");                     // legacy missing both
  });
  it("E: deriveAttemptStatus — notStarted/started/draft/submitted/timedOut, ACTIVE beats history", () => {
    expect(deriveAttemptStatus({ attempts: [] })).toBe("notStarted");
    expect(deriveAttemptStatus({ activeAttempt: { startedAt: iso(BASE), status: "started" } })).toBe("started");
    expect(deriveAttemptStatus({ activeAttempt: { startedAt: iso(BASE), status: "draft" } })).toBe("draft");
    expect(deriveAttemptStatus({ attempts: [{ attemptNumber: 1, endReason: "submitted" }] })).toBe("submitted");
    expect(deriveAttemptStatus({ attempts: [{ attemptNumber: 1, timedOut: true }] })).toBe("timedOut");
    // #15: attempt 2 ACTIVE while attempt 1 is completed => the active attempt wins.
    expect(deriveAttemptStatus({ attempts: [{ attemptNumber: 1, endReason: "submitted" }], activeAttempt: { attemptNumber: 2, startedAt: iso(BASE), status: "started" } })).toBe("started");
  });
  it("F: startRejection — untimed v2 open, no active => allowed (null); legacy untimed => 400", () => {
    const v2 = { status: "published", maxAttempts: 1, durationMinutes: 0, attemptModelVersion: 2 };
    expect(startRejection(v2, { attempts: [] }, BASE)).toBeNull();
    const legacy = { status: "published", maxAttempts: 1, durationMinutes: 0 };
    expect(startRejection(legacy, null, BASE)).toEqual({ status: 400, error: "لا يتطلب هذا الواجب بدء محاولة." });
  });
  it("G: writeRejection — untimed v2 requires an active attempt", () => {
    const v2 = { status: "published", maxAttempts: 1, durationMinutes: 0, attemptModelVersion: 2 };
    expect(writeRejection(v2, { attempts: [] }, "saveDraft", BASE)).toEqual({ status: 409, error: "ابدأ المحاولة أولاً." });
    const withActive = { attempts: [], activeAttempt: { attemptNumber: 1, startedAt: iso(BASE), endsAt: "", status: "started" } };
    expect(writeRejection(v2, withActive, "saveDraft", BASE)).toBeNull();
    // legacy untimed keeps historical behavior: no active needed
    const legacy = { status: "published", maxAttempts: 1, durationMinutes: 0 };
    expect(writeRejection(legacy, { attempts: [] }, "saveDraft", BASE)).toBeNull();
  });
  it("H: timerState for untimed v2 — active attempt never expires, no effective deadline", () => {
    const v2 = { status: "published", maxAttempts: 1, durationMinutes: 0, attemptModelVersion: 2 };
    const ts = timerState(v2, { attempts: [], activeAttempt: { attemptNumber: 1, startedAt: iso(BASE), endsAt: "", status: "started" } }, BASE + 999 * MIN);
    expect(ts.timed).toBe(false);
    expect(ts.requiresStart).toBe(true);
    expect(ts.attemptExpired).toBe(false);
    expect(ts.effectiveAttemptEndsAt).toBe("");
    expect(ts.canWrite).toBe(true);
    expect(ts.activeAttempt.endsAt).toBe("");
    expect(ts.attemptStatus).toBe("started");
  });
});

// ── student-submission handler (untimed v2 + legacy + audit) ─────────────────
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
    gradeExam: (_exam, answers) => { counts.grade++; gradedAnswers.push(answers); const ok = answers && answers.q1 && answers.q1.value === "A"; return { score: ok ? 10 : 0, totalMarks: 10, percentage: ok ? 100 : 0, manualReviewMarks: 0, finalized: true, questions: [], sections: [] }; },
    recordAchievementIfEligible: async () => { counts.achievement++; }
  };
}
function seed({ durationMinutes = 0, attemptModelVersion = 2, maxAttempts = 1, dueAt = iso(BASE + 10 * 60 * MIN), status = "published" } = {}) {
  store.set("platform/users/stu-1.json", { userId: "stu-1", active: true, classId: "c1", displayName: "أحمد", code: "S1" });
  store.set("platform/classes/c1.json", { classId: "c1", status: "active" });
  const a = { assignmentId: "asg1", classId: "c1", status, maxAttempts, durationMinutes, title: "واجب", dueAt, examSnapshot: { questions: [{ examQuestionId: "q1", presentationType: "shortAnswer", marks: 10 }] } };
  if (attemptModelVersion) a.attemptModelVersion = attemptModelVersion;
  store.set(ASG, a);
}
const sReq = (method, action, answers) => ({ method, params: { assignmentId: "asg1" }, json: async () => ({ action, ...(answers !== undefined ? { answers } : {}) }) });
const sCall = (method, action, answers) => submissionHandler(sReq(method, action, answers), deps);

describe("B2A student-submission — untimed v2 lifecycle", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(BASE); makeDeps(); });
  afterEach(() => { vi.useRealTimers(); });

  it("I: GET (opening) never creates an activeAttempt or consumes an attempt", async () => {
    seed();
    const g = await sCall("GET");
    expect(g.status).toBe(200);
    expect(g.jsonBody.state.activeAttempt).toBeNull();
    expect(g.jsonBody.state.attemptStatus).toBe("notStarted");
    expect(g.jsonBody.state.attemptsUsed).toBe(0);
    expect(g.jsonBody.state.requiresStart).toBe(true);
    expect(g.jsonBody.state.canStartAttempt).toBe(true);
    expect(writes).toHaveLength(0);            // opening wrote nothing
    expect(store.get(SUB)).toBeUndefined();
  });

  it("J: startAttempt stamps startedAt, endsAt \"\", status started, attemptNumber 1", async () => {
    seed();
    const r = await sCall("POST", "startAttempt");
    expect(r.status).toBe(200);
    const aa = r.jsonBody.state.activeAttempt;
    expect(aa.attemptNumber).toBe(1);
    expect(aa.startedAt).toBe(iso(BASE));
    expect(aa.endsAt).toBe("");               // untimed => no deadline
    expect(aa.status).toBe("started");
    expect(r.jsonBody.state.timed).toBe(false);
    expect(r.jsonBody.state.effectiveAttemptEndsAt).toBe("");
    expect(r.jsonBody.state.attemptStatus).toBe("started");
    expect(store.get(SUB).attempts).toHaveLength(0);   // starting does not complete an attempt
  });

  it("K: startAttempt is IDEMPOTENT — a later call returns the SAME startedAt/attemptNumber", async () => {
    seed();
    const first = (await sCall("POST", "startAttempt")).jsonBody.state.activeAttempt;
    vi.setSystemTime(BASE + 45 * MIN);
    const second = (await sCall("POST", "startAttempt")).jsonBody.state.activeAttempt;
    expect(second.startedAt).toBe(first.startedAt);
    expect(second.attemptNumber).toBe(first.attemptNumber);
    expect(store.get(SUB).attempts).toHaveLength(0);
  });

  it("L: saveDraft before start => 409 ابدأ المحاولة أولاً., no mutation", async () => {
    seed();
    const r = await sCall("POST", "saveDraft", { q1: { kind: "text", value: "A" } });
    expect(r.status).toBe(409);
    expect(r.jsonBody.error).toBe("ابدأ المحاولة أولاً.");
    expect(writes).toHaveLength(0);
  });

  it("M: after start, saveDraft sets status=draft + server lastSavedAt without changing attemptNumber", async () => {
    seed();
    await sCall("POST", "startAttempt");
    vi.setSystemTime(BASE + 3 * MIN);
    const r = await sCall("POST", "saveDraft", { q1: { kind: "text", value: "A" } });
    expect(r.status).toBe(200);
    const aa = store.get(SUB).activeAttempt;
    expect(aa.status).toBe("draft");
    expect(aa.lastSavedAt).toBe(iso(BASE + 3 * MIN));
    expect(aa.attemptNumber).toBe(1);
    expect(store.get(SUB).draftSavedAt).toBe(iso(BASE + 3 * MIN));
  });

  it("N: submit records endReason submitted + endedAt + server startedAt; clears the active attempt", async () => {
    seed();
    await sCall("POST", "startAttempt");
    vi.setSystemTime(BASE + 8 * MIN);
    const r = await sCall("POST", "submit", { q1: { kind: "text", value: "A" } });
    expect(r.status).toBe(200);
    expect(r.jsonBody.result.endReason).toBe("submitted");
    expect(r.jsonBody.result.timedOut).toBe(false);
    expect(r.jsonBody.result.endedAt).toBe(iso(BASE + 8 * MIN));
    expect(r.jsonBody.result.startedAt).toBe(iso(BASE));
    expect(r.jsonBody.result.endsAt).toBe("");            // untimed
    expect(store.get(SUB).activeAttempt).toBeNull();
    expect(store.get(SUB).attempts).toHaveLength(1);
    expect(r.jsonBody.state.attemptStatus).toBe("submitted");
  });

  it("O: attemptNumber invariant — attempt 2 active = completed.length + 1; opening/saving never increments", async () => {
    seed({ maxAttempts: 2 });
    await sCall("POST", "startAttempt");
    await sCall("POST", "submit", { q1: { kind: "text", value: "A" } });    // attempt 1 complete
    // opening + a stray saveDraft attempt must not bump the number or start a new attempt on their own
    await sCall("GET");
    const r2 = await sCall("POST", "startAttempt");                         // attempt 2
    expect(r2.jsonBody.state.activeAttempt.attemptNumber).toBe(2);
    // #15: active attempt 2 beats the completed attempt 1 result.
    expect(r2.jsonBody.state.attemptStatus).toBe("started");
    expect(store.get(SUB).attempts).toHaveLength(1);
  });

  it("P: exhausted attempts — startAttempt after the only attempt => 409 no extra attempt", async () => {
    seed({ maxAttempts: 1 });
    await sCall("POST", "startAttempt");
    await sCall("POST", "submit", { q1: { kind: "text", value: "A" } });
    const r = await sCall("POST", "startAttempt");
    expect(r.status).toBe(409);
    expect(store.get(SUB).attempts).toHaveLength(1);
  });
});

describe("B2A student-submission — legacy untimed backward compatibility", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(BASE); makeDeps(); });
  afterEach(() => { vi.useRealTimers(); });

  it("Q: legacy untimed (no attemptModelVersion) saves/submits without a start; lazy server startedAt is stamped", async () => {
    seed({ attemptModelVersion: 0 });
    vi.setSystemTime(BASE + 2 * MIN);
    const rs = await sCall("POST", "saveDraft", { q1: { kind: "text", value: "A" } });
    expect(rs.status).toBe(200);
    // lazy-established audit start (never consumes an attempt)
    expect(store.get(SUB).activeAttempt.startedAt).toBe(iso(BASE + 2 * MIN));
    expect(store.get(SUB).attempts).toHaveLength(0);
    vi.setSystemTime(BASE + 5 * MIN);
    const r = await sCall("POST", "submit", { q1: { kind: "text", value: "A" } });
    expect(r.status).toBe(200);
    expect(r.jsonBody.result.endReason).toBe("submitted");
    expect(r.jsonBody.result.startedAt).toBe(iso(BASE + 2 * MIN));   // carried from the lazy start
    expect(r.jsonBody.result.endedAt).toBe(iso(BASE + 5 * MIN));
    expect(store.get(SUB).attempts).toHaveLength(1);
    expect(store.get(SUB).activeAttempt).toBeNull();
  });

  it("R: legacy completed attempt missing endReason normalizes to submitted in the public shape", async () => {
    seed({ attemptModelVersion: 0 });
    // simulate a pre-B2A stored attempt (no endReason / endedAt, timedOut false)
    store.set(SUB, { schemaVersion: 1, assignmentId: "asg1", studentId: "stu-1", classId: "c1", draftAnswers: {}, activeAttempt: null,
      attempts: [{ attemptNumber: 1, submittedAt: iso(BASE), score: 5, totalMarks: 10, percentage: 50, manualReviewMarks: 0, finalized: true, timedOut: false }] });
    const g = await sCall("GET");
    expect(g.jsonBody.state.latestResult.endReason).toBe("submitted");
    expect(g.jsonBody.state.latestResult.endedAt).toBe("");     // not fabricated
    expect(g.jsonBody.state.attemptStatus).toBe("submitted");
  });
});

describe("B2A student-submission — timed audit fields (endReason / endedAt)", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(BASE); makeDeps(); });
  afterEach(() => { vi.useRealTimers(); });

  it("W: normal timed submit => endReason submitted, endedAt = server submission time", async () => {
    seed({ durationMinutes: 60, attemptModelVersion: 2 });
    await sCall("POST", "startAttempt");
    vi.setSystemTime(BASE + 10 * MIN);
    const r = await sCall("POST", "submit", { q1: { kind: "text", value: "A" } });
    expect(r.jsonBody.result.endReason).toBe("submitted");
    expect(r.jsonBody.result.endedAt).toBe(iso(BASE + 10 * MIN));
    expect(r.jsonBody.result.timedOut).toBe(false);
  });

  it("X: timed timeout => endReason timedOut, endedAt = AUTHORITATIVE deadline (not the later finalize time)", async () => {
    seed({ durationMinutes: 60, attemptModelVersion: 2 });
    await sCall("POST", "startAttempt");
    vi.setSystemTime(BASE + 61 * MIN);   // finalize happens AFTER the deadline (offline recovery)
    const r = await sCall("POST", "finalizeTimedOutAttempt");
    expect(r.jsonBody.result.endReason).toBe("timedOut");
    expect(r.jsonBody.result.timedOut).toBe(true);
    expect(r.jsonBody.result.endedAt).toBe(iso(BASE + 60 * MIN));    // the deadline, NOT BASE+61min
    expect(r.jsonBody.result.submittedAt).toBe(iso(BASE + 61 * MIN)); // real finalization timestamp
  });

  it("Y: timed timeout endedAt honors a due-clipped deadline (min(endsAt, effectiveDueAt))", async () => {
    // duration deadline is BASE+60m but the due date clips it to BASE+40m.
    seed({ durationMinutes: 60, attemptModelVersion: 2, dueAt: iso(BASE + 40 * MIN) });
    await sCall("POST", "startAttempt");
    vi.setSystemTime(BASE + 50 * MIN);   // past the clipped deadline
    const r = await sCall("POST", "finalizeTimedOutAttempt");
    expect(r.jsonBody.result.endReason).toBe("timedOut");
    expect(r.jsonBody.result.endedAt).toBe(iso(BASE + 40 * MIN));    // due-clipped effective deadline
  });
});

// ── student-assignment handler — v2 question gate ────────────────────────────
function makeAsgDeps({ durationMinutes = 0, attemptModelVersion = 2, submission = null } = {}) {
  const s = new Map();
  s.set("platform/users/stu-1.json", { userId: "stu-1", active: true, classId: "c1", displayName: "أحمد", code: "S1" });
  s.set("platform/classes/c1.json", { classId: "c1", status: "active" });
  const a = { assignmentId: "asg1", classId: "c1", status: "published", maxAttempts: 1, durationMinutes, title: "واجب",
    dueAt: iso(BASE + 10 * 60 * MIN), questionCount: 1, totalMarks: 10,
    examSnapshot: { title: "امتحان", coverPage: { enabled: true, activityType: "exam" }, sections: [{ id: "s1", title: "القسم", gradingPolicy: "all", maxMarks: 10, questions: [{ examQuestionId: "q1", text: "نص السؤال السري", presentationType: "shortAnswer", marks: 10, answer: { text: "SECRET" } }] }] } };
  if (attemptModelVersion) a.attemptModelVersion = attemptModelVersion;
  s.set("platform/assignments/asg1.json", a);
  if (submission) s.set(SUB, submission);
  return { requireStudentAuth: () => ({ ok: true, user: { sub: "stu-1" } }), getContainer: () => ({}), downloadJsonOrNull: async (_c, key) => (s.has(key) ? structuredClone(s.get(key)) : null) };
}
const aReq = { method: "GET", params: { assignmentId: "asg1" }, json: async () => ({}) };

describe("B2A student-assignment — question gate for untimed v2", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(BASE); });
  afterEach(() => { vi.useRealTimers(); });

  it("S: untimed v2 with NO active attempt => pre-start metadata only, NO question body", async () => {
    const r = await assignmentHandler(aReq, makeAsgDeps({ attemptModelVersion: 2 }));
    expect(r.status).toBe(200);
    expect(r.jsonBody.assignment.requiresStart).toBe(true);
    expect(r.jsonBody.assignment.timed).toBe(false);
    expect(r.jsonBody.assignment.durationMinutes).toBe(0);
    // safe cover metadata present…
    expect(r.jsonBody.assignment.exam.coverPage.enabled).toBe(true);
    expect(r.jsonBody.assignment.marksDistribution.total).toBe(10);
    // …but NO questions/sections and NO secret answer leaked
    expect(r.jsonBody.assignment.exam.sections).toBeUndefined();
    expect(r.jsonBody.assignment.exam.questions).toBeUndefined();
    expect(JSON.stringify(r.jsonBody)).not.toContain("SECRET");
    expect(JSON.stringify(r.jsonBody)).not.toContain("نص السؤال السري");
  });

  it("T: untimed v2 WITH an active attempt => full student-sanitized exam (answers still stripped)", async () => {
    const submission = { assignmentId: "asg1", studentId: "stu-1", classId: "c1", attempts: [], activeAttempt: { attemptNumber: 1, startedAt: iso(BASE), endsAt: "", status: "started" } };
    const r = await assignmentHandler(aReq, makeAsgDeps({ attemptModelVersion: 2, submission }));
    expect(r.status).toBe(200);
    expect(r.jsonBody.assignment.exam.sections).toHaveLength(1);
    expect(r.jsonBody.assignment.exam.sections[0].questions[0].text).toBe("نص السؤال السري");
    expect(JSON.stringify(r.jsonBody)).not.toContain("SECRET");   // answer key stripped
  });

  it("U: legacy untimed (no attemptModelVersion) still delivers the full exam immediately (historical)", async () => {
    const r = await assignmentHandler(aReq, makeAsgDeps({ attemptModelVersion: 0 }));
    expect(r.status).toBe(200);
    expect(r.jsonBody.assignment.exam.sections).toHaveLength(1);
    expect(r.jsonBody.assignment.requiresStart).toBeUndefined();
  });
});

// ── manage-assignments — attemptModelVersion:2 stamped on create ─────────────
describe("B2A manage-assignments — new assignments are attemptModelVersion 2", () => {
  it("V: create stamps attemptModelVersion:2 (untimed) and exposes it in the summary", async () => {
    const s = new Map(); const uploads = [];
    s.set("platform/classes/c1.json", { classId: "c1", name: "الصف", active: true });
    const deps2 = {
      requireBuilderAuth: () => ({ ok: true, user: { sub: "t1" } }), getContainer: () => ({}),
      downloadJsonOrNull: async (_c, k) => (s.has(k) ? structuredClone(s.get(k)) : null),
      uploadJson: async (_c, k, v) => { s.set(k, v); uploads.push({ k, v }); },
      listJson: async () => [], mutateJsonWithRetry: async () => { throw new Error("nope"); }, recordAuditEvent: async () => {}
    };
    const req = { method: "POST", url: "http://x/assignments", params: {}, json: async () => ({ action: "create", classId: "c1", title: "واجب", durationMinutes: 0, publish: true, examSnapshot: { title: "ا", sections: [{ id: "s", gradingPolicy: "all", questions: [{ marks: 10 }] }] } }) };
    const r = await manageHandler(req, deps2);
    expect(r.status).toBe(200);
    expect(r.jsonBody.assignment.attemptModelVersion).toBe(2);
    expect(uploads[0].v.attemptModelVersion).toBe(2);            // persisted on the document
  });
});
