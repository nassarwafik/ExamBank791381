import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { handler as manageHandler } from "../src/functions/manage-assignments.js";
import { handler as submissionHandler } from "../src/functions/student-submission.js";
import { handler as resultsHandler } from "../src/functions/assignment-results.js";
import { mutateJsonWithRetry } from "../src/lib/platform-storage.js";
import { normalizeEndReason, deriveAttemptStatus } from "../src/lib/assignment-availability.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase 7B — the teacher ends ONE student's current attempt (endActiveAttempt) through the REAL handlers on the in-memory
// blob store (real ETag CAS + real mutateJsonWithRetry), with a controlled server clock. Races are made deterministic by
// letting a competing writer commit BETWEEN a handler's read and its conditional write, so the CAS really conflicts and
// the loser really re-reads the live state.

const S1 = "11111111-1111-1111-1111-111111111111";
const S2 = "22222222-2222-2222-2222-222222222222";
const CID = "c1";
const MIN = 60000;
const T0 = Date.UTC(2026, 8, 1, 8, 0, 0);
const EXAM = { questions: [{ examQuestionId: "q1", presentationType: "trueFalse", marks: 10, answer: { correct: true } }] };
const RIGHT = { q1: { kind: "choice", index: 0 } };
const WRONG = { q1: { kind: "choice", index: 1 } };
const iso = ms => new Date(ms).toISOString();

let ctx, audits;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  audits = [];
  ctx = createMemoryContainer({
    ["platform/users/" + S1 + ".json"]: { schemaVersion: 3, role: "student", userId: S1, displayName: "أحمد", code: "S1", classId: CID, active: true, archived: false, authVersion: 1 },
    ["platform/users/" + S2 + ".json"]: { schemaVersion: 3, role: "student", userId: S2, displayName: "سارة", code: "S2", classId: "other", active: true, archived: false, authVersion: 1 },
    ["platform/classes/" + CID + ".json"]: { classId: CID, name: "الصف", active: true, studentIds: [] }
  });
});
afterEach(() => { vi.useRealTimers(); });
const at = ms => vi.setSystemTime(ms);

// Teacher deps. `teacherMut` lets a race test interleave a competing writer inside the teacher's CAS.
let teacherMut = null;
const T = () => ({ requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), getContainer: () => ctx.container, recordAuditEvent: async (_c, ev) => { audits.push(ev); }, ...(teacherMut ? { mutateJsonWithRetry: teacherMut } : {}) });
let studentMut = null;
const SD = () => ({ container: ctx.container, requireStudentAuth: () => ({ ok: true, user: { sub: S1, sv: 1, role: "student" } }), recordAchievementIfEligible: async () => {}, ...(studentMut ? { mutateJsonWithRetry: studentMut } : {}) });
beforeEach(() => { teacherMut = null; studentMut = null; });

const manage = body => manageHandler({ method: "POST", url: "https://x/api/assignments", json: async () => body }, T());
const results = (aid, body, studentId = S1) => resultsHandler({ method: "POST", url: "https://x/api/assignment-results", json: async () => ({ assignmentId: aid, studentId, ...body }) }, T());
const gradebook = async aid => (await resultsHandler({ method: "GET", url: "https://x/api/assignment-results?assignmentId=" + aid }, T())).jsonBody;
const sub = (aid, body) => submissionHandler({ method: "POST", params: { assignmentId: aid }, headers: { get: () => null }, json: async () => body }, SD());
const getState = async aid => (await submissionHandler({ method: "GET", params: { assignmentId: aid }, headers: { get: () => null } }, SD())).jsonBody.state;
const idOf = st => ({ expectedAttemptNumber: st.activeAttempt.attemptNumber, expectedStartedAt: st.activeAttempt.startedAt, ...(st.activeAttempt.attemptEpoch ? { expectedAttemptEpoch: st.activeAttempt.attemptEpoch } : {}) });
const SUB = aid => "platform/submissions/" + aid + "/" + S1 + ".json";
const doc = aid => ctx.getJson(SUB(aid));
const etag = aid => ctx.store.get(SUB(aid)).etag;
const end = (aid, identity, extra = {}) => results(aid, { action: "endActiveAttempt", ...identity, ...extra });

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
async function save(aid, st, answers) {
  const r = await sub(aid, { action: "saveDraft", answers, ...idOf(st) });
  expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
  return r.jsonBody.state || st;
}
// A mutateJsonWithRetry that lets `competitor` commit between this caller's read and its CAS write (once).
function interleaved(competitor) {
  let fired = false;
  return (c, name, fn, obs) => mutateJsonWithRetry(c, name, async v => {
    const next = await fn(v);
    if (!fired) { fired = true; await competitor(); }
    return next;
  }, obs);
}
const expectCleared = d => {
  expect(d.activeAttempt).toBeNull();
  expect(d.draftAnswers).toEqual({});
  expect(d.draftSavedAt).toBe("");
};

describe("endActiveAttempt — ends the CURRENT attempt for every policy", () => {
  for (const policy of ["continuous", "strict", "pausable"]) {
    it(policy + " running attempt: graded from the server draft, teacherEnded, cleared, exactly one attempt consumed", async () => {
      const aid = await create({ attemptPolicy: policy, durationMinutes: 30 });
      const st = await start(aid);
      await save(aid, st, RIGHT);
      at(T0 + 5 * MIN);
      const r = await end(aid, idOf(st));
      expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
      expect(r.jsonBody.alreadyEnded).toBe(false);
      const d = doc(aid);
      expect(d.attempts).toHaveLength(1);
      const a = d.attempts[0];
      expect(a).toMatchObject({ attemptNumber: 1, startedAt: st.activeAttempt.startedAt, endReason: "teacherEnded", timedOut: false, endedAt: iso(T0 + 5 * MIN), score: 10, answers: RIGHT });
      if (policy === "continuous") expect(a.pauseCount).toBeUndefined();                              // model 2: no model-3 fields
      else expect(a.pauseCount).toBe(0);
      expectCleared(d);
      expect(r.jsonBody).toMatchObject({ activeAttempt: null, attemptStatus: "teacherEnded", attemptsUsed: 1, allowedAttempts: 1, canWrite: false });
      expect(r.jsonBody.latestResult).toMatchObject({ attemptNumber: 1, endReason: "teacherEnded", score: 10 });
    });
  }

  it("a PAUSED attempt can be ended: the clock is not resumed, pausedRemainingMs is not recomputed, pauseCount is copied", async () => {
    const aid = await create({ attemptPolicy: "pausable", durationMinutes: 30 });
    const st = await start(aid);
    at(T0 + 10 * MIN);
    const paused = (await sub(aid, { action: "pauseAttempt", answers: RIGHT, ...idOf(st) })).jsonBody.state;
    expect(paused.activeAttempt.status).toBe("paused");
    const before = doc(aid).activeAttempt;
    expect(before.pausedRemainingMs).toBe(20 * MIN);
    at(T0 + 3 * 60 * MIN);                                                                  // hours later — budget would long be gone if the clock ran
    const r = await end(aid, idOf(paused));
    expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
    const a = doc(aid).attempts[0];
    expect(a).toMatchObject({ endReason: "teacherEnded", timedOut: false, pauseCount: 1, score: 10, answers: RIGHT, endedAt: iso(T0 + 3 * 60 * MIN) });
    expect(a.runEndsAt).toBeUndefined();                                                     // never resumed
    expect(a.pausedRemainingMs).toBeUndefined();
    expectCleared(doc(aid));
    expect(audits).toHaveLength(1);
    expect(audits[0].details).toMatchObject({ previousStatus: "paused", pauseCount: 1, attemptPolicy: "pausable", timed: true });
    // The student can no longer resume that attempt.
    expect((await sub(aid, { action: "resumeAttempt", ...idOf(paused) })).status).toBe(409);
  });
});

describe("server draft only", () => {
  it("client-supplied answers are ignored — the saved server draft is graded and stored", async () => {
    const aid = await create({ durationMinutes: 30 });
    const st = await start(aid);
    await save(aid, st, WRONG);
    const r = await end(aid, idOf(st), { answers: RIGHT, draftAnswers: RIGHT });
    expect(r.status).toBe(200);
    expect(doc(aid).attempts[0]).toMatchObject({ score: 0, answers: WRONG });
  });

  it("no saved draft → graded as empty (score 0), still exactly one attempt", async () => {
    const aid = await create({ durationMinutes: 30 });
    const st = await start(aid);
    const r = await end(aid, idOf(st), { answers: RIGHT });
    expect(r.status).toBe(200);
    expect(doc(aid).attempts).toHaveLength(1);
    expect(doc(aid).attempts[0]).toMatchObject({ score: 0, answers: {} });
  });
});

describe("history and counters are preserved", () => {
  it("previous attempts are kept byte-for-byte; attemptsUsed +1 exactly; allowedAttempts unchanged", async () => {
    const aid = await create({ durationMinutes: 30, maxAttempts: 2 });
    const st1 = await start(aid);
    await sub(aid, { action: "submit", answers: RIGHT, ...idOf(st1) });
    expect((await results(aid, { action: "allowRetry" })).status).toBe(200);                 // allowed 3 (> maxAttempts)
    const first = JSON.parse(JSON.stringify(doc(aid).attempts[0]));
    const allowedBefore = doc(aid).allowedAttempts;
    const st2 = await start(aid);
    await save(aid, st2, WRONG);
    const r = await end(aid, idOf(st2));
    expect(r.status).toBe(200);
    const d = doc(aid);
    expect(d.attempts).toHaveLength(2);
    expect(d.attempts[0]).toEqual(first);
    expect(d.attempts[1]).toMatchObject({ attemptNumber: 2, endReason: "teacherEnded" });
    expect(d.allowedAttempts).toBe(allowedBefore);
    expect(r.jsonBody).toMatchObject({ attemptsUsed: 2, allowedAttempts: allowedBefore });
    expect(r.jsonBody.attempts.map(x => x.endReason)).toEqual(["submitted", "teacherEnded"]);
  });

  it("the response row is exactly the row a gradebook reload shows", async () => {
    const aid = await create({ durationMinutes: 30 });
    const st = await start(aid);
    await save(aid, st, RIGHT);
    const r = await end(aid, idOf(st));
    const row = (await gradebook(aid)).students.find(x => x.studentId === S1);
    const { ok: _ok, alreadyEnded: _ae, ...snap } = r.jsonBody;
    for (const [k, v] of Object.entries(snap)) expect(row[k], k).toEqual(v);
    expect(row.attemptStatus).toBe("teacherEnded");
  });
});

describe("identity — never a generic «end this student's attempt»", () => {
  it("missing / malformed identity → 400 and nothing is written", async () => {
    const aid = await create({ durationMinutes: 30 });
    const st = await start(aid);
    const tag = etag(aid);
    const good = idOf(st);
    for (const bad of [{}, { expectedAttemptNumber: 1 }, { expectedStartedAt: good.expectedStartedAt }, { ...good, expectedAttemptNumber: "1" }, { ...good, expectedAttemptNumber: true }, { ...good, expectedAttemptNumber: 1.5 }, { ...good, expectedAttemptNumber: 0 }, { ...good, expectedStartedAt: "" }, { ...good, expectedStartedAt: 5 }]) {
      const r = await end(aid, bad);
      expect(r.status, JSON.stringify(bad)).toBe(400);
    }
    expect(etag(aid)).toBe(tag);
    expect(audits).toHaveLength(0);
  });

  it("stale attemptNumber or startedAt → 409, the live attempt is untouched", async () => {
    const aid = await create({ durationMinutes: 30 });
    const st = await start(aid);
    const tag = etag(aid);
    expect((await end(aid, { ...idOf(st), expectedAttemptNumber: 2 })).status).toBe(409);
    expect((await end(aid, { ...idOf(st), expectedStartedAt: iso(T0 - MIN) })).status).toBe(409);
    expect(etag(aid)).toBe(tag);
    expect(doc(aid).activeAttempt).toBeTruthy();
    expect(audits).toHaveLength(0);
  });

  it("model 3: a missing / malformed epoch fails closed (400); a stale epoch → 409", async () => {
    const aid = await create({ attemptPolicy: "pausable", durationMinutes: 30 });
    const st = await start(aid);
    const { expectedAttemptEpoch: _e, ...noEpoch } = idOf(st);
    expect((await end(aid, noEpoch)).status).toBe(400);
    for (const e of ["1", 0, 1.5, true, null]) expect((await end(aid, { ...noEpoch, expectedAttemptEpoch: e })).status, String(e)).toBe(400);
    const paused = (await sub(aid, { action: "pauseAttempt", answers: RIGHT, ...idOf(st) })).jsonBody.state;
    const resumed = (await sub(aid, { action: "resumeAttempt", ...idOf(paused) })).jsonBody.state;
    expect(resumed.activeAttempt.attemptEpoch).toBe(3);
    expect((await end(aid, idOf(st))).status).toBe(409);                                     // epoch 1 — composed before the pause
    expect((await end(aid, idOf(paused))).status).toBe(409);                                 // epoch 2 — composed while paused
    expect(doc(aid).activeAttempt).toBeTruthy();
    expect(doc(aid).attempts).toHaveLength(0);
    expect((await end(aid, idOf(resumed))).status).toBe(200);
  });

  it("model 2 does not require an epoch (continuous)", async () => {
    const aid = await create({ durationMinutes: 30 });
    const st = await start(aid);
    expect(st.activeAttempt.attemptEpoch).toBeUndefined();
    expect((await end(aid, idOf(st))).status).toBe(200);
  });

  it("an OLD request can never end a NEWER attempt", async () => {
    const aid = await create({ durationMinutes: 30, maxAttempts: 3 });
    // Attempt 1 submitted by the student, attempt 2 now live: a late teacher end for attempt 1 is refused.
    const st1 = await start(aid);
    await sub(aid, { action: "submit", answers: RIGHT, ...idOf(st1) });
    at(T0 + MIN);
    const st2 = await start(aid);
    const r = await end(aid, idOf(st1));
    expect(r.status).toBe(409);
    expect(doc(aid).activeAttempt.attemptNumber).toBe(2);
    expect(doc(aid).attempts).toHaveLength(1);
    // Attempt 2 ended by the teacher, attempt 3 live: a DUPLICATE of the attempt-2 end is idempotent and leaves #3 alone.
    expect((await end(aid, idOf(st2))).status).toBe(200);
    at(T0 + 2 * MIN);
    const st3 = await start(aid);
    const dup = await end(aid, idOf(st2));
    expect(dup.status).toBe(200);
    expect(dup.jsonBody.alreadyEnded).toBe(true);
    expect(doc(aid).activeAttempt).toMatchObject({ attemptNumber: 3, startedAt: st3.activeAttempt.startedAt });
    expect(doc(aid).attempts).toHaveLength(2);
    expect(dup.jsonBody.activeAttempt.attemptNumber).toBe(3);                                  // authoritative snapshot, newer attempt kept
  });
});

describe("duplicate teacher end", () => {
  it("is idempotent: one result, no second write, one audit event", async () => {
    const aid = await create({ durationMinutes: 30 });
    const st = await start(aid);
    await save(aid, st, RIGHT);
    const r1 = await end(aid, idOf(st));
    const tag = etag(aid);
    const r2 = await end(aid, idOf(st));
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r2.jsonBody.alreadyEnded).toBe(true);
    expect(etag(aid)).toBe(tag);
    expect(doc(aid).attempts).toHaveLength(1);
    expect(audits).toHaveLength(1);
    expect(r2.jsonBody.attempts).toEqual(r1.jsonBody.attempts);
  });

  it("two concurrent teacher ends → exactly one completed attempt", async () => {
    const aid = await create({ durationMinutes: 30 });
    const st = await start(aid);
    const [a, b] = await Promise.all([end(aid, idOf(st)), end(aid, idOf(st))]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect([a.jsonBody.alreadyEnded, b.jsonBody.alreadyEnded].sort()).toEqual([false, true]);
    expect(doc(aid).attempts).toHaveLength(1);
    expect(audits).toHaveLength(1);
  });
});

describe("races — exactly one writer closes the attempt", () => {
  it("student submit commits inside the teacher's CAS → submit wins, teacher 409, one result", async () => {
    const aid = await create({ durationMinutes: 30 });
    const st = await start(aid);
    await save(aid, st, WRONG);
    let submitStatus = 0;
    teacherMut = interleaved(async () => { submitStatus = (await sub(aid, { action: "submit", answers: RIGHT, ...idOf(st) })).status; });
    const r = await end(aid, idOf(st));
    expect(submitStatus).toBe(200);
    expect(r.status).toBe(409);
    expect(doc(aid).attempts).toHaveLength(1);
    expect(doc(aid).attempts[0]).toMatchObject({ endReason: "submitted", score: 10 });
    expect(audits).toHaveLength(0);
  });

  it("teacher end commits inside the student's submit CAS → teacher wins, submit 409, one result", async () => {
    const aid = await create({ durationMinutes: 30 });
    const st = await start(aid);
    await save(aid, st, WRONG);
    let endStatus = 0;
    studentMut = interleaved(async () => { endStatus = (await end(aid, idOf(st))).status; });
    const s = await sub(aid, { action: "submit", answers: RIGHT, ...idOf(st) });
    expect(endStatus).toBe(200);
    expect(s.status).toBe(409);
    expect(doc(aid).attempts).toHaveLength(1);
    expect(doc(aid).attempts[0]).toMatchObject({ endReason: "teacherEnded", score: 0, answers: WRONG });
    expectCleared(doc(aid));
  });

  it("student pause commits inside the teacher's CAS → pause wins, teacher 409 (stale epoch); a retry with the new epoch ends the paused attempt", async () => {
    const aid = await create({ attemptPolicy: "pausable", durationMinutes: 30 });
    const st = await start(aid);
    let paused = null;
    teacherMut = interleaved(async () => { paused = (await sub(aid, { action: "pauseAttempt", answers: RIGHT, ...idOf(st) })).jsonBody.state; });
    const r = await end(aid, idOf(st));
    expect(r.status).toBe(409);
    expect(doc(aid).activeAttempt.status).toBe("paused");
    expect(doc(aid).attempts).toHaveLength(0);
    teacherMut = null;
    const r2 = await end(aid, idOf(paused));
    expect(r2.status).toBe(200);
    expect(doc(aid).attempts).toHaveLength(1);
    expect(doc(aid).attempts[0]).toMatchObject({ endReason: "teacherEnded", pauseCount: 1, answers: RIGHT });
    expectCleared(doc(aid));
  });

  it("teacher end commits inside the student's pause CAS → end wins, pause 409, never paused-after-end", async () => {
    const aid = await create({ attemptPolicy: "pausable", durationMinutes: 30 });
    const st = await start(aid);
    await save(aid, st, WRONG);
    let endStatus = 0;
    studentMut = interleaved(async () => { endStatus = (await end(aid, idOf(st))).status; });
    const p = await sub(aid, { action: "pauseAttempt", answers: RIGHT, ...idOf(st) });
    expect(endStatus).toBe(200);
    expect(p.status).toBe(409);
    const d = doc(aid);
    expect(d.attempts).toHaveLength(1);
    expect(d.attempts[0]).toMatchObject({ endReason: "teacherEnded", answers: WRONG });
    expectCleared(d);
    expect((await getState(aid)).attemptStatus).toBe("teacherEnded");
  });

  it("student resume commits inside the teacher's CAS on a paused attempt → teacher 409 (the teacher never resumes)", async () => {
    const aid = await create({ attemptPolicy: "pausable", durationMinutes: 30 });
    const st = await start(aid);
    const paused = (await sub(aid, { action: "pauseAttempt", answers: RIGHT, ...idOf(st) })).jsonBody.state;
    teacherMut = interleaved(async () => { await sub(aid, { action: "resumeAttempt", ...idOf(paused) }); });
    expect((await end(aid, idOf(paused))).status).toBe(409);
    expect(doc(aid).activeAttempt).toMatchObject({ status: "draft", attemptEpoch: 3 });
    expect(doc(aid).attempts).toHaveLength(0);
  });
});

describe("timer semantics", () => {
  it("an attempt already expired by the server clock closes as timedOut at its effective deadline (not teacherEnded)", async () => {
    const aid = await create({ durationMinutes: 30 });
    const st = await start(aid);
    await save(aid, st, RIGHT);
    at(T0 + 45 * MIN);
    const r = await end(aid, idOf(st));
    expect(r.status).toBe(200);
    expect(doc(aid).attempts[0]).toMatchObject({ endReason: "timedOut", timedOut: true, endedAt: iso(T0 + 30 * MIN), score: 10 });
    expect(r.jsonBody.attemptStatus).toBe("timedOut");
    expect(audits[0].details).toMatchObject({ endReason: "timedOut", endedAt: iso(T0 + 30 * MIN) });
  });

  it("a paused attempt past the due date closes as timedOut at the due date", async () => {
    const due = T0 + 60 * MIN;
    const aid = await create({ attemptPolicy: "pausable", durationMinutes: 30, dueAt: iso(due) });
    const st = await start(aid);
    const paused = (await sub(aid, { action: "pauseAttempt", answers: RIGHT, ...idOf(st) })).jsonBody.state;
    at(due + 10 * MIN);
    expect((await end(aid, idOf(paused))).status).toBe(200);
    expect(doc(aid).attempts[0]).toMatchObject({ endReason: "timedOut", endedAt: iso(due), pauseCount: 1 });
  });

  it("student finalizeTimedOutAttempt commits inside the teacher's CAS → one timedOut result, teacher 409", async () => {
    const aid = await create({ durationMinutes: 30 });
    const st = await start(aid);
    at(T0 + 45 * MIN);
    teacherMut = interleaved(async () => { await sub(aid, { action: "finalizeTimedOutAttempt" }); });
    expect((await end(aid, idOf(st))).status).toBe(409);
    expect(doc(aid).attempts).toHaveLength(1);
    expect(doc(aid).attempts[0].endReason).toBe("timedOut");
    expect(audits).toHaveLength(0);
  });

  it("teacher end first, then the student's timeout finalize → an idempotent no-op, still one result", async () => {
    const aid = await create({ durationMinutes: 30 });
    const st = await start(aid);
    expect((await end(aid, idOf(st))).status).toBe(200);
    at(T0 + 45 * MIN);
    const f = await sub(aid, { action: "finalizeTimedOutAttempt" });
    expect(f.status).toBe(200);
    expect(f.jsonBody.alreadyFinalized).toBe(true);
    expect(doc(aid).attempts).toHaveLength(1);
    expect(doc(aid).attempts[0].endReason).toBe("teacherEnded");
  });
});

describe("permissions", () => {
  it("archived assignment → 409; missing assignment / student → 404; student outside the class → 403 — nothing written", async () => {
    const aid = await create({ durationMinutes: 30 });
    const st = await start(aid);
    const tag = etag(aid);
    expect((await results("nope", { action: "endActiveAttempt", ...idOf(st) })).status).toBe(404);
    expect((await results(aid, { action: "endActiveAttempt", ...idOf(st) }, "33333333-3333-3333-3333-333333333333")).status).toBe(404);
    expect((await results(aid, { action: "endActiveAttempt", ...idOf(st) }, S2)).status).toBe(403);
    const arch = await manage({ action: "archive", assignmentId: aid, confirmActiveAttempts: true });
    expect(arch.status, JSON.stringify(arch.jsonBody)).toBe(200);
    expect((await end(aid, idOf(st))).status).toBe(409);
    expect(etag(aid)).toBe(tag);
    expect(audits.filter(x => x.action === "assignment.endActiveAttempt")).toHaveLength(0);
  });

  it("an archive that lands after the request was authorized is still refused inside the CAS", async () => {
    const aid = await create({ durationMinutes: 30 });
    const st = await start(aid);
    let archived = false;
    teacherMut = (c, name, fn, obs) => mutateJsonWithRetry(c, name, async v => {
      if (!archived) { archived = true; const a = ctx.getJson("platform/assignments/" + aid + ".json"); ctx.setJson("platform/assignments/" + aid + ".json", { ...a, status: "archived" }); }
      return fn(v);
    }, obs);
    expect((await end(aid, idOf(st))).status).toBe(409);
    expect(doc(aid).activeAttempt).toBeTruthy();
    expect(doc(aid).attempts).toHaveLength(0);
  });

  it("an unauthenticated teacher request is refused before anything is read", async () => {
    const aid = await create({ durationMinutes: 30 });
    const st = await start(aid);
    const r = await resultsHandler({ method: "POST", url: "https://x/api/assignment-results", json: async () => ({ action: "endActiveAttempt", assignmentId: aid, studentId: S1, ...idOf(st) }) }, { ...T(), requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false } } }) });
    expect(r.status).toBe(401);
    expect(doc(aid).activeAttempt).toBeTruthy();
  });
});

describe("audit", () => {
  it("written exactly once with identity/timing/policy details and NO answers, tokens or exam content", async () => {
    const aid = await create({ attemptPolicy: "strict", durationMinutes: 30 });
    const st = await start(aid);
    await save(aid, st, RIGHT);
    at(T0 + 7 * MIN);
    await end(aid, idOf(st));
    const ev = audits.filter(x => x.action === "assignment.endActiveAttempt");
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ actor: "teacher-1", targetType: "student", targetId: S1 });
    expect(ev[0].details).toEqual({ assignmentId: aid, attemptNumber: 1, startedAt: st.activeAttempt.startedAt, endedAt: iso(T0 + 7 * MIN), endReason: "teacherEnded", attemptPolicy: "strict", pauseCount: 0, previousStatus: "draft", timed: true });
    const text = JSON.stringify(ev[0]);
    for (const leak of ["q1", "choice", "answers", "index", "examSnapshot", "token", "trueFalse"]) expect(text, leak).not.toContain(leak);
  });
});

describe("student view + no teacher resume", () => {
  it("the student sees the ended attempt with its reason and cannot keep writing to it", async () => {
    const aid = await create({ durationMinutes: 30 });
    const st = await start(aid);
    await save(aid, st, RIGHT);
    await end(aid, idOf(st));
    const s = await getState(aid);
    expect(s).toMatchObject({ attemptStatus: "teacherEnded", activeAttempt: null, canWrite: false });
    expect(s.latestResult).toMatchObject({ endReason: "teacherEnded", score: 10 });
    expect((await sub(aid, { action: "saveDraft", answers: WRONG, ...idOf(st) })).status).toBe(409);
    expect((await sub(aid, { action: "submit", answers: WRONG, ...idOf(st) })).status).toBe(409);
    expect(doc(aid).attempts).toHaveLength(1);
  });

  it("there is no teacher resume: resume-like actions are unsupported and a paused attempt stays paused", async () => {
    const aid = await create({ attemptPolicy: "pausable", durationMinutes: 30 });
    const st = await start(aid);
    const paused = (await sub(aid, { action: "pauseAttempt", answers: RIGHT, ...idOf(st) })).jsonBody.state;
    const tag = etag(aid);
    for (const action of ["resumeAttempt", "teacherResume", "resumeActiveAttempt"]) expect((await results(aid, { action, ...idOf(paused) })).status, action).toBe(400);
    expect(etag(aid)).toBe(tag);
    expect(doc(aid).activeAttempt).toMatchObject({ status: "paused", attemptEpoch: 2 });
    expect(doc(aid).activeAttempt.runEndsAt).toBeUndefined();
  });
});

describe("labels / normalization", () => {
  it("teacherEnded is a known end reason; historical values are unchanged", () => {
    expect(normalizeEndReason({ endReason: "teacherEnded" })).toBe("teacherEnded");
    expect(normalizeEndReason({ endReason: "integrityExit" })).toBe("integrityExit");
    expect(normalizeEndReason({ timedOut: true })).toBe("timedOut");
    expect(normalizeEndReason({})).toBe("submitted");
    expect(normalizeEndReason({ endReason: "bogus" })).toBe("submitted");
    expect(deriveAttemptStatus({ attempts: [{ endReason: "teacherEnded" }] })).toBe("teacherEnded");
    expect(deriveAttemptStatus({ attempts: [{ endReason: "teacherEnded" }], activeAttempt: { startedAt: "x", status: "started" } })).toBe("started");
  });
});
