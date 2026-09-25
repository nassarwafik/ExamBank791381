import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { handler as manageHandler } from "../src/functions/manage-assignments.js";
import { handler as submissionHandler } from "../src/functions/student-submission.js";
import { handler as studentAssignmentHandler } from "../src/functions/student-assignment.js";
import { handler as resultsHandler } from "../src/functions/assignment-results.js";
import { timerState, extendRejection, attemptPolicyOf, pauseRejection, resumeRejection } from "../src/lib/assignment-availability.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase 7A — assignment attempt policy (continuous / strict / pausable) through the REAL handlers on the in-memory blob
// store, with a controlled server clock. Continuous = today's lifecycle unchanged; strict = leaving the exam page ends
// the attempt (finalizeIntegrityExit, once); pausable = explicit save & exit (pauseAttempt) and resumeAttempt with the
// remaining SERVER budget only, the due date always a hard cap, and a per-attempt epoch against stale writes.

const S1 = "11111111-1111-1111-1111-111111111111";
const CID = "c1";
const MIN = 60000;
const T0 = Date.UTC(2026, 8, 1, 8, 0, 0);
const EXAM = { questions: [{ examQuestionId: "q1", presentationType: "trueFalse", marks: 10, answer: { correct: true } }] };
const RIGHT = { q1: { kind: "choice", index: 0 } };
const WRONG = { q1: { kind: "choice", index: 1 } };
const iso = ms => new Date(ms).toISOString();

let ctx;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  ctx = createMemoryContainer({
    ["platform/users/" + S1 + ".json"]: { schemaVersion: 3, role: "student", userId: S1, displayName: "أحمد", code: "S1", classId: CID, active: true, archived: false, authVersion: 1 },
    ["platform/classes/" + CID + ".json"]: { classId: CID, name: "الصف", active: true, studentIds: [] }
  });
});
afterEach(() => { vi.useRealTimers(); });
const at = ms => vi.setSystemTime(ms);

const T = () => ({ requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), getContainer: () => ctx.container, recordAuditEvent: async () => {} });
const SD = () => ({ container: ctx.container, requireStudentAuth: () => ({ ok: true, user: { sub: S1, sv: 1, role: "student" } }), recordAchievementIfEligible: async () => {} });
const manage = body => manageHandler({ method: "POST", url: "https://x/api/assignments", json: async () => body }, T());
const results = (aid, body) => body
  ? resultsHandler({ method: "POST", url: "https://x/api/assignment-results", json: async () => ({ assignmentId: aid, studentId: S1, ...body }) }, T())
  : resultsHandler({ method: "GET", url: "https://x/api/assignment-results?assignmentId=" + aid }, T());
const sub = (aid, body) => submissionHandler({ method: "POST", params: { assignmentId: aid }, headers: { get: () => null }, json: async () => body }, SD());
const getState = async aid => (await submissionHandler({ method: "GET", params: { assignmentId: aid }, headers: { get: () => null } }, SD())).jsonBody.state;
const examBody = aid => studentAssignmentHandler({ method: "GET", params: { assignmentId: aid }, headers: { get: () => null } }, SD());
const idOf = st => ({ expectedAttemptNumber: st.activeAttempt.attemptNumber, expectedStartedAt: st.activeAttempt.startedAt, ...(st.activeAttempt.attemptEpoch ? { expectedAttemptEpoch: st.activeAttempt.attemptEpoch } : {}) });
const doc = aid => ctx.getJson("platform/submissions/" + aid + "/" + S1 + ".json");
const assignmentDoc = aid => ctx.getJson("platform/assignments/" + aid + ".json");

async function create(extra = {}) {
  const r = await manage({ action: "create", classId: CID, title: "امتحان", examSnapshot: EXAM, publish: true, maxAttempts: 1, openAt: iso(T0 - MIN), dueAt: iso(T0 + 24 * 60 * MIN), ...extra });
  expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
  return r.jsonBody.assignment.assignmentId;
}
async function start(aid) {
  const r = await sub(aid, { action: "startAttempt" });
  expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
  return r.jsonBody.state;
}

describe("policy persistence", () => {
  it("create: omitted / continuous → continuous on model 2; strict / pausable → model 3; the choice is persisted", async () => {
    for (const [policy, version] of [[undefined, 2], ["continuous", 2], ["strict", 3], ["pausable", 3]]) {
      const aid = await create(policy === undefined ? {} : { attemptPolicy: policy });
      const stored = assignmentDoc(aid);
      expect(stored.attemptPolicy).toBe(policy || "continuous");
      expect(stored.attemptModelVersion).toBe(version);
    }
    const list = (await manageHandler({ method: "GET", url: "https://x/api/assignments?classId=" + CID }, T())).jsonBody.assignments;
    expect(list.map(x => x.attemptPolicy).sort()).toEqual(["continuous", "continuous", "pausable", "strict"]);
  });

  it("an invalid policy is rejected (400) and nothing is created", async () => {
    for (const bad of ["kiosk", "STRICT", 1, true, ["strict"], { p: "strict" }]) {
      const r = await manage({ action: "create", classId: CID, title: "x", examSnapshot: EXAM, attemptPolicy: bad });
      expect(r.status, String(bad)).toBe(400);
    }
    expect(ctx.names("platform/assignments/")).toEqual([]);
  });

  it("legacy / model-2 documents are continuous — a stray policy field never upgrades an old assignment", () => {
    expect(attemptPolicyOf({ status: "published" })).toBe("continuous");                                 // legacy, no field
    expect(attemptPolicyOf({ attemptModelVersion: 2 })).toBe("continuous");
    expect(attemptPolicyOf({ attemptModelVersion: 2, attemptPolicy: "strict" })).toBe("continuous");     // model 2 → never strict
    expect(attemptPolicyOf({ attemptModelVersion: 3, attemptPolicy: "bogus" })).toBe("continuous");
    expect(attemptPolicyOf({ attemptModelVersion: 3, attemptPolicy: "pausable" })).toBe("pausable");
  });
});

describe("continuous — unchanged lifecycle", () => {
  it("timed: leaving costs time (the server clock keeps running), return restores the SAME attempt; no pause/exit; model-2 shapes", async () => {
    const aid = await create({ durationMinutes: 60 });
    const st = await start(aid);
    expect(st.attemptPolicy).toBe("continuous");
    expect(st.activeAttempt).not.toHaveProperty("attemptEpoch");                                          // model-2 shape unchanged
    await sub(aid, { action: "saveDraft", answers: RIGHT, ...idOf(st) });
    at(T0 + 40 * MIN);                                                                                      // student away 40 min
    const back = await getState(aid);
    expect(back.activeAttempt.startedAt).toBe(st.activeAttempt.startedAt);
    expect(back.effectiveAttemptEndsAt).toBe(iso(T0 + 60 * MIN));                                          // never paused
    expect(back.draftAnswers).toEqual(RIGHT);
    expect((await sub(aid, { action: "pauseAttempt", answers: RIGHT, ...idOf(back) })).status).toBe(400);
    expect((await sub(aid, { action: "finalizeIntegrityExit", ...idOf(back) })).status).toBe(400);
    expect(doc(aid).activeAttempt.status).toBe("draft");                                                     // nothing ended
    expect((await sub(aid, { action: "saveDraft", answers: RIGHT, ...idOf(back) })).status).toBe(200);    // no epoch needed on model 2
  });
});

describe("strict", () => {
  it("no attempt yet → an exit request finalizes nothing (no attempt consumed)", async () => {
    const aid = await create({ attemptPolicy: "strict" });
    const r = await sub(aid, { action: "finalizeIntegrityExit" });
    expect(r.status).toBe(200);
    expect(r.jsonBody.alreadyFinalized).toBe(true);
    expect(doc(aid) ? doc(aid).attempts || [] : []).toEqual([]);
  });

  it("leaving after start ends THAT attempt once: server draft graded (client answers ignored), endReason integrityExit, cannot continue", async () => {
    const aid = await create({ attemptPolicy: "strict", durationMinutes: 30 });
    const st = await start(aid);
    expect(st.activeAttempt.attemptEpoch).toBe(1);
    await sub(aid, { action: "saveDraft", answers: RIGHT, ...idOf(st) });
    at(T0 + 5 * MIN);
    const exit = await sub(aid, { action: "finalizeIntegrityExit", answers: WRONG, ...idOf(st) });
    expect(exit.status).toBe(200);
    expect(exit.jsonBody.result).toMatchObject({ attemptNumber: 1, endReason: "integrityExit", score: 10, timedOut: false, endedAt: iso(T0 + 5 * MIN) });
    expect(doc(aid).activeAttempt).toBeNull();
    expect(doc(aid).attempts).toHaveLength(1);
    const after = await getState(aid);
    expect(after.attemptStatus).toBe("integrityExit");
    expect((await sub(aid, { action: "saveDraft", answers: RIGHT, ...idOf(st) })).status).toBe(409);      // same attempt: gone
    expect((await sub(aid, { action: "submit", answers: RIGHT, ...idOf(st) })).status).toBe(409);
    expect((await sub(aid, { action: "startAttempt" })).status).toBe(409);                                // maxAttempts 1 — consumed
    const row = (await results(aid)).jsonBody.students[0];
    expect(row.attemptStatus).toBe("integrityExit");
    expect(row.latestResult.endReason).toBe("integrityExit");
  });

  it("visibilitychange + pagehide duplicates (sequential AND concurrent) finalize exactly once", async () => {
    const aid = await create({ attemptPolicy: "strict", maxAttempts: 2 });
    const st = await start(aid);
    const first = await sub(aid, { action: "finalizeIntegrityExit", ...idOf(st) });
    const second = await sub(aid, { action: "finalizeIntegrityExit", ...idOf(st) });
    expect(first.jsonBody.alreadyFinalized).toBe(false);
    expect(second.jsonBody.alreadyFinalized).toBe(true);
    expect(doc(aid).attempts).toHaveLength(1);
    const st2 = await start(aid);
    const both = await Promise.all([sub(aid, { action: "finalizeIntegrityExit", ...idOf(st2) }), sub(aid, { action: "finalizeIntegrityExit", ...idOf(st2) })]);
    expect(both.every(r => r.status === 200)).toBe(true);
    expect(both.filter(r => r.jsonBody.alreadyFinalized === false)).toHaveLength(1);
    expect(doc(aid).attempts.map(a => a.endReason)).toEqual(["integrityExit", "integrityExit"]);
  });

  it("an ordinary submit stays «submitted»; a late exit after it is a no-op; submit vs exit concurrently → exactly one result", async () => {
    const aid = await create({ attemptPolicy: "strict", maxAttempts: 2 });
    const st = await start(aid);
    const s = await sub(aid, { action: "submit", answers: RIGHT, ...idOf(st) });
    expect(s.jsonBody.result.endReason).toBe("submitted");
    const late = await sub(aid, { action: "finalizeIntegrityExit", ...idOf(st) });
    expect(late.jsonBody.alreadyFinalized).toBe(true);
    expect(doc(aid).attempts.map(a => a.endReason)).toEqual(["submitted"]);
    const st2 = await start(aid);
    await Promise.all([sub(aid, { action: "submit", answers: RIGHT, ...idOf(st2) }), sub(aid, { action: "finalizeIntegrityExit", ...idOf(st2) })]);
    expect(doc(aid).attempts).toHaveLength(2);                                                               // never two results for attempt 2
    expect(doc(aid).activeAttempt).toBeNull();
  });

  it("a stale exit (old attempt identity or wrong epoch) never ends a newer attempt", async () => {
    const aid = await create({ attemptPolicy: "strict", maxAttempts: 2 });
    const st = await start(aid);
    await sub(aid, { action: "submit", answers: RIGHT, ...idOf(st) });
    const st2 = await start(aid);
    expect((await sub(aid, { action: "finalizeIntegrityExit", ...idOf(st) })).status).toBe(409);           // attempt 1 identity
    expect((await sub(aid, { action: "finalizeIntegrityExit", ...idOf(st2), expectedAttemptEpoch: 2 })).status).toBe(409);
    expect((await sub(aid, { action: "finalizeIntegrityExit", expectedAttemptNumber: 2, expectedStartedAt: st2.activeAttempt.startedAt })).status).toBe(409); // no epoch
    expect(doc(aid).activeAttempt.attemptNumber).toBe(2);
  });

  it("an exit that arrives after the time ran out is recorded as timedOut (the clock ended it first)", async () => {
    const aid = await create({ attemptPolicy: "strict", durationMinutes: 10 });
    const st = await start(aid);
    at(T0 + 11 * MIN);
    const r = await sub(aid, { action: "finalizeIntegrityExit", ...idOf(st) });
    expect(r.jsonBody.result).toMatchObject({ endReason: "timedOut", timedOut: true, endedAt: iso(T0 + 10 * MIN) });
  });
});

describe("pausable — pause", () => {
  it("saves the latest answers atomically, keeps attempt 1 / startedAt, stores the SERVER remaining budget, advances the epoch", async () => {
    const aid = await create({ attemptPolicy: "pausable", durationMinutes: 60 });
    const st = await start(aid);
    at(T0 + 22 * MIN);
    const r = await sub(aid, { action: "pauseAttempt", answers: RIGHT, ...idOf(st) });
    expect(r.status).toBe(200);
    const aa = r.jsonBody.state.activeAttempt;
    expect(aa).toMatchObject({ attemptNumber: 1, startedAt: st.activeAttempt.startedAt, endsAt: iso(T0 + 60 * MIN), status: "paused", attemptEpoch: 2, pauseCount: 1, pausedAt: iso(T0 + 22 * MIN), pausedRemainingMs: 38 * MIN });
    expect(r.jsonBody.state.attemptStatus).toBe("paused");
    expect(r.jsonBody.state.attemptsUsed).toBe(0);
    expect(doc(aid).draftAnswers).toEqual(RIGHT);
    expect(r.jsonBody.state.canWrite).toBe(false);
  });

  it("no timer consumption while paused; no writes while paused; questions are not served while paused", async () => {
    const aid = await create({ attemptPolicy: "pausable", durationMinutes: 60 });
    const st = await start(aid);
    at(T0 + 22 * MIN);
    const paused = (await sub(aid, { action: "pauseAttempt", answers: RIGHT, ...idOf(st) })).jsonBody.state;
    at(T0 + 22 * MIN + 5 * 60 * MIN);                                                                     // 5 hours later
    const later = await getState(aid);
    expect(later.attemptExpired).toBe(false);
    expect(later.activeAttempt.pausedRemainingMs).toBe(38 * MIN);                                            // unchanged
    expect(later.effectiveAttemptEndsAt).toBe("");
    for (const action of ["saveDraft", "submit"]) {
      expect((await sub(aid, { action, answers: WRONG, ...idOf(paused) })).status, action).toBe(409);      // even with the current epoch
      expect((await sub(aid, { action, answers: WRONG, ...idOf(st) })).status, action).toBe(409);
    }
    expect(doc(aid).draftAnswers).toEqual(RIGHT);
    expect(doc(aid).attempts || []).toEqual([]);
    expect((await sub(aid, { action: "startAttempt" })).status).toBe(409);                                  // never restarted
    const body = await examBody(aid);
    expect(body.jsonBody.assignment.requiresStart).toBe(true);
    expect(body.jsonBody.assignment.exam.questions).toBeUndefined();
  });
});

describe("pausable — resume", () => {
  async function pausedAt22() {
    const aid = await create({ attemptPolicy: "pausable", durationMinutes: 60 });
    const st = await start(aid);
    at(T0 + 22 * MIN);
    const paused = (await sub(aid, { action: "pauseAttempt", answers: RIGHT, ...idOf(st) })).jsonBody.state;
    return { aid, st, paused };
  }

  it("the SAME attempt with the SAME answers and ONLY the remaining 38 minutes (never 60); startedAt/endsAt untouched; no extra attempt", async () => {
    const { aid, st, paused } = await pausedAt22();
    const R = T0 + 5 * 60 * MIN;
    at(R);
    const r = await sub(aid, { action: "resumeAttempt", ...idOf(paused) });
    expect(r.status).toBe(200);
    const s2 = r.jsonBody.state;
    expect(s2.activeAttempt).toMatchObject({ attemptNumber: 1, startedAt: st.activeAttempt.startedAt, endsAt: iso(T0 + 60 * MIN), attemptEpoch: 3, runEndsAt: iso(R + 38 * MIN), pausedRemainingMs: null });
    expect(s2.effectiveAttemptEndsAt).toBe(iso(R + 38 * MIN));
    expect(s2.draftAnswers).toEqual(RIGHT);
    expect(s2.attemptsUsed).toBe(0);
    expect(s2.canWrite).toBe(true);
    expect((await examBody(aid)).jsonBody.assignment.exam.questions).toHaveLength(1);                        // questions again
    at(R + 38 * MIN + 1000);
    expect((await getState(aid)).attemptExpired).toBe(true);                                                  // budget, not a fresh 60
  });

  it("double resume (sequential retry AND concurrent) is idempotent: one epoch step, one deadline", async () => {
    const { aid, paused } = await pausedAt22();
    at(T0 + 6 * 60 * MIN);                                                                                  // still before the 24 h due date
    const a = await sub(aid, { action: "resumeAttempt", ...idOf(paused) });
    at(T0 + 6 * 60 * MIN + 5000);
    const b = await sub(aid, { action: "resumeAttempt", ...idOf(paused) });
    expect(b.status).toBe(200);
    expect(b.jsonBody.alreadyResumed).toBe(true);
    expect(b.jsonBody.state.activeAttempt.runEndsAt).toBe(a.jsonBody.state.activeAttempt.runEndsAt);
    expect(doc(aid).activeAttempt.attemptEpoch).toBe(3);
    const { aid: aid2, paused: p2 } = await pausedAt22();
    const both = await Promise.all([sub(aid2, { action: "resumeAttempt", ...idOf(p2) }), sub(aid2, { action: "resumeAttempt", ...idOf(p2) })]);
    expect(both.every(r => r.status === 200)).toBe(true);
    expect(doc(aid2).activeAttempt.attemptEpoch).toBe(3);
  });

  it("the due date caps the resumed time: 35 min budget but due in 20 → 20; due already passed → cannot resume, closed as timedOut", async () => {
    const aid = await create({ attemptPolicy: "pausable", durationMinutes: 60, dueAt: iso(T0 + 120 * MIN) });
    const st = await start(aid);
    at(T0 + 25 * MIN);
    const paused = (await sub(aid, { action: "pauseAttempt", answers: RIGHT, ...idOf(st) })).jsonBody.state;
    expect(paused.activeAttempt.pausedRemainingMs).toBe(35 * MIN);
    at(T0 + 100 * MIN);                                                                                       // due in 20 min
    const r = await sub(aid, { action: "resumeAttempt", ...idOf(paused) });
    expect(r.jsonBody.state.effectiveAttemptEndsAt).toBe(iso(T0 + 120 * MIN));
    // A second assignment: the due date passes while paused.
    const aid2 = await create({ attemptPolicy: "pausable", durationMinutes: 60, dueAt: iso(T0 + 150 * MIN) });
    const st2 = await start(aid2);
    const p2 = (await sub(aid2, { action: "pauseAttempt", answers: RIGHT, ...idOf(st2) })).jsonBody.state;
    at(T0 + 151 * MIN);
    const late = await sub(aid2, { action: "resumeAttempt", ...idOf(p2) });
    expect(late.status).toBe(409);
    expect((await sub(aid2, { action: "saveDraft", answers: WRONG, ...idOf(p2) })).status).toBe(409);
    const g = await getState(aid2);
    expect(g.attemptExpired).toBe(true);
    const fin = await sub(aid2, { action: "finalizeTimedOutAttempt" });
    expect(fin.jsonBody.result).toMatchObject({ endReason: "timedOut", endedAt: iso(T0 + 150 * MIN), score: 10, attemptNumber: 1 });
    expect(doc(aid2).attempts[0].pauseCount).toBe(1);
  });

  it("a teacher due-date extension revives a paused attempt whose deadline passed; resume then gets its remaining budget", async () => {
    const aid = await create({ attemptPolicy: "pausable", durationMinutes: 60, dueAt: iso(T0 + 30 * MIN) });
    const st = await start(aid);
    at(T0 + 10 * MIN);
    const paused = (await sub(aid, { action: "pauseAttempt", answers: RIGHT, ...idOf(st) })).jsonBody.state;
    at(T0 + 40 * MIN);
    expect((await sub(aid, { action: "resumeAttempt", ...idOf(paused) })).status).toBe(409);
    expect((await manage({ action: "updateTiming", assignmentId: aid, dueAt: iso(T0 + 600 * MIN) })).status).toBe(200);
    const r = await sub(aid, { action: "resumeAttempt", ...idOf(paused) });
    expect(r.status).toBe(200);
    expect(r.jsonBody.state.effectiveAttemptEndsAt).toBe(iso(T0 + 40 * MIN + 50 * MIN));                   // 50 min budget, not 60
  });
});

describe("teacher extension × pause/resume", () => {
  it("running: an extension is part of the paused budget; paused: extension rejected (budget unchanged); resumed: extension must exceed the new running end", async () => {
    const aid = await create({ attemptPolicy: "pausable", durationMinutes: 60 });
    const st = await start(aid);
    at(T0 + 10 * MIN);
    expect((await results(aid, { action: "extendActiveAttempt", newEndsAt: iso(T0 + 90 * MIN) })).status).toBe(200);
    at(T0 + 20 * MIN);
    const paused = (await sub(aid, { action: "pauseAttempt", answers: RIGHT, ...idOf(await getState(aid)) })).jsonBody.state;
    expect(paused.activeAttempt.pausedRemainingMs).toBe(70 * MIN);                                          // 90 − 20
    const whilePaused = await results(aid, { action: "extendActiveAttempt", newEndsAt: iso(T0 + 999 * MIN) });
    expect(whilePaused.status).toBe(409);
    expect(whilePaused.jsonBody.error).toContain("متوقفة مؤقتًا");                                         // the explicit paused rule
    expect(doc(aid).activeAttempt.pausedRemainingMs).toBe(70 * MIN);
    expect(doc(aid).activeAttempt.extendedEndsAt).toBe(iso(T0 + 90 * MIN));                                 // audit preserved
    const R = T0 + 300 * MIN;
    at(R);
    await sub(aid, { action: "resumeAttempt", ...idOf(paused) });
    expect((await getState(aid)).effectiveAttemptEndsAt).toBe(iso(R + 70 * MIN));                          // old extension never shortens
    expect((await results(aid, { action: "extendActiveAttempt", newEndsAt: iso(R + 60 * MIN) })).status).toBe(400);   // not later than the running end
    expect((await results(aid, { action: "extendActiveAttempt", newEndsAt: iso(R + 80 * MIN) })).status).toBe(200);
    expect((await getState(aid)).effectiveAttemptEndsAt).toBe(iso(R + 80 * MIN));
    expect(doc(aid).activeAttempt.startedAt).toBe(st.activeAttempt.startedAt);
  });

  it("pure: extendRejection refuses a paused attempt", () => {
    const a = { status: "published", durationMinutes: 60, attemptModelVersion: 3, attemptPolicy: "pausable" };
    const s = { attempts: [], activeAttempt: { attemptNumber: 1, startedAt: iso(T0), endsAt: iso(T0 + 60 * MIN), status: "paused", attemptEpoch: 2, pausedRemainingMs: 5 * MIN } };
    expect(extendRejection(a, s, iso(T0 + 999 * MIN), T0 + MIN)).toMatchObject({ status: 409 });
    expect(timerState(a, s, T0 + 999 * MIN).attemptExpired).toBe(false);
    expect(pauseRejection({ ...a, attemptPolicy: "strict" }, s, T0)).toMatchObject({ status: 400 });
    expect(resumeRejection({ attemptModelVersion: 2, attemptPolicy: "pausable", status: "published" }, s, T0)).toMatchObject({ status: 400 });
  });
});

describe("races — no late write overwrites a newer lifecycle state", () => {
  async function running() {
    const aid = await create({ attemptPolicy: "pausable", durationMinutes: 60, maxAttempts: 2 });
    const st = await start(aid);
    return { aid, st };
  }

  it("autosave in flight → pause: the late pre-pause autosave (epoch 1) is rejected; the paused draft is kept", async () => {
    const { aid, st } = await running();
    await sub(aid, { action: "pauseAttempt", answers: RIGHT, ...idOf(st) });
    const late = await sub(aid, { action: "saveDraft", answers: WRONG, ...idOf(st) });
    expect(late.status).toBe(409);
    expect(doc(aid).draftAnswers).toEqual(RIGHT);
  });

  it("pause → resume → an OLD pre-pause autosave (same number + startedAt, epoch 1) is rejected by the epoch alone", async () => {
    const { aid, st } = await running();
    const paused = (await sub(aid, { action: "pauseAttempt", answers: RIGHT, ...idOf(st) })).jsonBody.state;
    const resumed = (await sub(aid, { action: "resumeAttempt", ...idOf(paused) })).jsonBody.state;
    expect(resumed.activeAttempt.attemptNumber).toBe(st.activeAttempt.attemptNumber);
    expect(resumed.activeAttempt.startedAt).toBe(st.activeAttempt.startedAt);
    const stale = await sub(aid, { action: "saveDraft", answers: WRONG, ...idOf(st) });                   // epoch 1
    expect(stale.status).toBe(409);
    const staleSubmit = await sub(aid, { action: "submit", answers: WRONG, ...idOf(st) });
    expect(staleSubmit.status).toBe(409);
    expect(doc(aid).draftAnswers).toEqual(RIGHT);
    expect(doc(aid).attempts || []).toEqual([]);
    expect((await sub(aid, { action: "saveDraft", answers: WRONG, ...idOf(resumed) })).status).toBe(200);   // current epoch 3 writes
  });

  it("two pause requests: the retry is idempotent and never recomputes the budget", async () => {
    const { aid, st } = await running();
    at(T0 + 10 * MIN);
    await sub(aid, { action: "pauseAttempt", answers: RIGHT, ...idOf(st) });
    at(T0 + 30 * MIN);
    const again = await sub(aid, { action: "pauseAttempt", answers: WRONG, ...idOf(st) });
    expect(again.jsonBody.alreadyPaused).toBe(true);
    expect(doc(aid).activeAttempt).toMatchObject({ pausedRemainingMs: 50 * MIN, pauseCount: 1, attemptEpoch: 2 });
    expect(doc(aid).draftAnswers).toEqual(RIGHT);
    const { aid: aid2, st: st2 } = await running();
    const both = await Promise.all([sub(aid2, { action: "pauseAttempt", answers: RIGHT, ...idOf(st2) }), sub(aid2, { action: "pauseAttempt", answers: RIGHT, ...idOf(st2) })]);
    expect(both.every(r => r.status === 200)).toBe(true);
    expect(doc(aid2).activeAttempt).toMatchObject({ pauseCount: 1, attemptEpoch: 2 });
  });

  it("pause vs submit: whichever commits first wins, the other is refused — exactly one outcome", async () => {
    const { aid, st } = await running();
    await sub(aid, { action: "pauseAttempt", answers: RIGHT, ...idOf(st) });
    expect((await sub(aid, { action: "submit", answers: RIGHT, ...idOf(st) })).status).toBe(409);
    expect(doc(aid).attempts || []).toEqual([]);
    const { aid: aid2, st: st2 } = await running();
    await sub(aid2, { action: "submit", answers: RIGHT, ...idOf(st2) });
    expect((await sub(aid2, { action: "pauseAttempt", answers: RIGHT, ...idOf(st2) })).status).toBe(409);
    expect(doc(aid2).attempts).toHaveLength(1);
    expect(doc(aid2).activeAttempt).toBeNull();
    const { aid: aid3, st: st3 } = await running();
    await Promise.all([sub(aid3, { action: "submit", answers: RIGHT, ...idOf(st3) }), sub(aid3, { action: "pauseAttempt", answers: RIGHT, ...idOf(st3) })]);
    const d3 = doc(aid3);
    expect((d3.attempts || []).length + (d3.activeAttempt ? 1 : 0)).toBe(1);                                // submitted XOR paused
  });

  it("timeout vs pause / resume: an expired attempt cannot be paused; a resumed budget runs out normally", async () => {
    const { aid, st } = await running();
    at(T0 + 61 * MIN);
    expect((await sub(aid, { action: "pauseAttempt", answers: RIGHT, ...idOf(st) })).status).toBe(409);
    expect((await sub(aid, { action: "finalizeTimedOutAttempt" })).jsonBody.result.endReason).toBe("timedOut");
    const st2 = await start(aid);
    at(T0 + 70 * MIN);
    const paused = (await sub(aid, { action: "pauseAttempt", answers: RIGHT, ...idOf(st2) })).jsonBody.state;
    expect(paused.activeAttempt.pausedRemainingMs).toBe(51 * MIN);
    at(T0 + 200 * MIN);
    const resumed = (await sub(aid, { action: "resumeAttempt", ...idOf(paused) })).jsonBody.state;
    at(T0 + 252 * MIN);
    expect((await sub(aid, { action: "saveDraft", answers: WRONG, ...idOf(resumed) })).status).toBe(409);
    expect((await sub(aid, { action: "resumeAttempt", ...idOf(paused) })).jsonBody.alreadyResumed).toBe(true);   // idempotent, never re-arms
    expect((await getState(aid)).attemptExpired).toBe(true);
  });

  it("assignment archived while paused: pause/resume refused (403); after restore the SAME attempt resumes", async () => {
    const { aid, st } = await running();
    const paused = (await sub(aid, { action: "pauseAttempt", answers: RIGHT, ...idOf(st) })).jsonBody.state;
    expect((await manage({ action: "archive", assignmentId: aid, confirmActiveAttempts: true })).status).toBe(200);
    expect((await sub(aid, { action: "resumeAttempt", ...idOf(paused) })).status).toBe(403);
    expect((await manage({ action: "restore", assignmentId: aid })).status).toBe(200);
    const r = await sub(aid, { action: "resumeAttempt", ...idOf(paused) });
    expect(r.status).toBe(200);
    expect(r.jsonBody.state.activeAttempt.attemptNumber).toBe(1);
  });

  it("maxAttempts reduced while attempt 2 is paused: the already-admitted attempt still resumes and submits", async () => {
    const aid = await create({ attemptPolicy: "pausable", maxAttempts: 2 });
    const s1 = await start(aid);
    await sub(aid, { action: "submit", answers: WRONG, ...idOf(s1) });
    const s2 = await start(aid);
    const paused = (await sub(aid, { action: "pauseAttempt", answers: RIGHT, ...idOf(s2) })).jsonBody.state;
    expect((await manage({ action: "setMaxAttempts", assignmentId: aid, maxAttempts: 1 })).status).toBe(200);
    const resumed = (await sub(aid, { action: "resumeAttempt", ...idOf(paused) })).jsonBody.state;
    expect(resumed.activeAttempt.attemptNumber).toBe(2);
    const done = await sub(aid, { action: "submit", answers: RIGHT, ...idOf(resumed) });
    expect(done.status).toBe(200);
    expect(done.jsonBody.result).toMatchObject({ attemptNumber: 2, score: 10, pauseCount: 1 });
  });

  it("strict epoch validation: string / float / zero / missing expectedAttemptEpoch all fail closed", async () => {
    const { aid, st } = await running();
    for (const e of ["1", 1.5, 0, -1, null, true]) {
      expect((await sub(aid, { action: "saveDraft", answers: WRONG, ...idOf(st), expectedAttemptEpoch: e })).status, String(e)).toBe(409);
    }
    const { expectedAttemptEpoch: _omit, ...noEpoch } = idOf(st);
    expect((await sub(aid, { action: "saveDraft", answers: WRONG, ...noEpoch })).status).toBe(409);
    expect((await sub(aid, { action: "saveDraft", answers: RIGHT, ...idOf(st) })).status).toBe(200);
  });
});

describe("teacher visibility", () => {
  it("gradebook: a paused row shows «paused» with its budget; the assignment carries its policy", async () => {
    const aid = await create({ attemptPolicy: "pausable", durationMinutes: 45 });
    const st = await start(aid);
    at(T0 + 15 * MIN);
    await sub(aid, { action: "pauseAttempt", answers: RIGHT, ...idOf(st) });
    const r = (await results(aid)).jsonBody;
    expect(r.assignment.attemptPolicy).toBe("pausable");
    expect(r.students[0].attemptStatus).toBe("paused");
    expect(r.students[0].activeAttempt).toMatchObject({ status: "paused", pausedRemainingMs: 30 * MIN });
    expect(r.stats.active).toBe(1);
  });
});
